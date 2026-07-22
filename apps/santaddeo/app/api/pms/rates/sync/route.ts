/**
 * POST /api/pms/rates/sync
 *
 * Dispatcher PMS-aware per la sincronizzazione delle tariffe.
 *
 * Sostituisce la chiamata hardcoded a /api/scidoo/rates/sync che falliva
 * sugli hotel BRiG con 401 not authorized (bug 20/05/2026, stesso pattern
 * di room-types).
 *
 * Legge `pms_integrations.pms_name` e instrada al provider corretto:
 *   - scidoo -> ScidooClient.getRates() + upsert su scidoo_rate_id
 *   - brig   -> BrigClient.getRatePlans() + upsert su brig_rate_code
 *   - slope  -> SlopeClient.getRatePlans() + upsert su slope_rate_plan_id (13/07/2026)
 *
 * Body restituito compatibile con il vecchio endpoint Scidoo:
 * { message, count, total } (la UI poi richiama GET /api/rates per
 * caricare lo stato persistito).
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooClient } from "@/lib/services/scidoo-client"
import { BrigClient, BrigError } from "@/lib/connectors/brig/client"
import { SlopeClient, SlopeError } from "@/lib/connectors/slope/client"
import { slopeName } from "@/lib/connectors/slope/types"
import { logSyncEvent } from "@/lib/connectors/sync-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Accetto sia hotel_id (vecchio scidoo) che hotelId (nuovo) per compatibilita'.
    const hotelId: string | undefined = body.hotelId || body.hotel_id

    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    const { data: pmsIntegration, error: pmsError } = await supabase
      .from("pms_integrations")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    if (pmsError || !pmsIntegration) {
      return NextResponse.json(
        { error: "PMS integration not found or not active" },
        { status: 404 },
      )
    }

    const pmsName = (pmsIntegration.pms_name || "").toLowerCase()

    // ─────────────── SCIDOO ───────────────
    if (pmsName === "scidoo") {
      const scidooClient = new ScidooClient({
        apiKey: pmsIntegration.api_key,
        propertyId: pmsIntegration.property_id,
      })

      const scidooRates = await scidooClient.getRates()
      if (!scidooRates || scidooRates.length === 0) {
        return NextResponse.json({ message: "No rates found in Scidoo", count: 0 })
      }

      // Lookup scidoo_room_type_id -> our UUID
      const { data: ourRoomTypes } = await supabase
        .from("room_types")
        .select("id, scidoo_room_type_id")
        .eq("hotel_id", hotelId)

      const scidooToUuid: Record<string, string> = {}
      for (const rt of ourRoomTypes || []) {
        if (rt.scidoo_room_type_id) scidooToUuid[rt.scidoo_room_type_id] = rt.id
      }

      const ratesToUpsert = scidooRates.map((rate: any) => {
        const scidooRoomTypeIds: number[] = rate.room_type_list || []
        const applicableRoomTypeIds = scidooRoomTypeIds
          .map((scidooId: number) => scidooToUuid[String(scidooId)])
          .filter(Boolean)
        return {
          hotel_id: hotelId,
          scidoo_rate_id: rate.id.toString(),
          code: rate.code || rate.id.toString(),
          name: rate.name || "",
          arrangements: rate.arrangements || [],
          is_active: rate.is_active !== false,
          applicable_room_type_ids: applicableRoomTypeIds,
          raw_data: rate,
          updated_at: new Date().toISOString(),
        }
      })

      const { data: upserted, error: upsertError } = await supabase
        .from("rates")
        .upsert(ratesToUpsert, {
          onConflict: "hotel_id,scidoo_rate_id",
          ignoreDuplicates: false,
        })
        .select()

      if (upsertError) {
        return NextResponse.json(
          { error: "Failed to upsert rates", details: upsertError.message },
          { status: 500 },
        )
      }

      return NextResponse.json({
        message: "Rates synced successfully",
        count: upserted?.length || 0,
        total: scidooRates.length,
      })
    }

    // ─────────────── BRIG ───────────────
    if (pmsName === "brig") {
      const brigStartedAt = Date.now()
      const logBrig = (
        status: "success" | "partial" | "error",
        details: { fetched?: number; inserted?: number; updated?: number; failed?: number; error?: string },
      ) =>
        logSyncEvent({
          hotelId,
          pmsIntegrationId: pmsIntegration.id,
          pmsName: "brig",
          syncType: "rates",
          status,
          startedAt: brigStartedAt,
          recordsFetched: details.fetched,
          recordsInserted: details.inserted,
          recordsUpdated: details.updated,
          recordsFailed: details.failed,
          errorMessage: details.error || null,
        })
      const apiKey: string = pmsIntegration.api_key || ""
      if (apiKey.startsWith("eyJ") && apiKey.length > 100) {
        return NextResponse.json(
          {
            error:
              "BRiG api_key sembra essere un JWT (Bearer) e non l'UUID atteso dall'header x-api-key. Aggiornala in /superadmin/connectors-mapping.",
            hint: `api_key length=${apiKey.length}, prefix=${apiKey.slice(0, 8)}…`,
          },
          { status: 400 },
        )
      }
      if (!pmsIntegration.endpoint_url) {
        return NextResponse.json(
          { error: "BRiG endpoint_url non configurato per questo hotel" },
          { status: 400 },
        )
      }
      const structureId: string =
        pmsIntegration.property_id || pmsIntegration.config?.structure_id || ""
      if (!structureId) {
        return NextResponse.json(
          { error: "BRiG structureId (property_id) non configurato per questo hotel" },
          { status: 400 },
        )
      }

      const brigClient = new BrigClient({
        baseUrl: pmsIntegration.endpoint_url,
        apiKey,
        structureId,
      })

      let raw: unknown
      try {
        raw = await brigClient.getRatePlans()
      } catch (err) {
        if (err instanceof BrigError) {
          await logBrig("error", { error: `BRiG ${err.status}: ${err.body.slice(0, 300)}` })
          return NextResponse.json(
            {
              error: `BRiG /api/nol/rateplans/list ha risposto ${err.status}`,
              details: err.body.slice(0, 500),
            },
            { status: 502 },
          )
        }
        throw err
      }

      const arr: any[] = Array.isArray(raw)
        ? raw
        : (raw as any)?.data ?? (raw as any)?.items ?? []

      if (!Array.isArray(arr) || arr.length === 0) {
        return NextResponse.json(
          {
            error:
              "BRiG ha risposto OK ma senza rate plans. Verifica lo structureId / sid configurato.",
            sample: raw,
          },
          { status: 404 },
        )
      }

      // Esistenti per preservare mappature/order
      const { data: existingRates } = await supabase
        .from("rates")
        .select("id, brig_rate_code, code")
        .eq("hotel_id", hotelId)

      const existingByBrigCode = new Map<string, any>()
      const existingByCode = new Map<string, any>()
      for (const r of existingRates || []) {
        if (r.brig_rate_code) existingByBrigCode.set(r.brig_rate_code, r)
        if (r.code) existingByCode.set(r.code, r)
      }

      const ratePayloads = arr.map((rp: any) => {
        const brigCode: string = String(rp.code ?? rp.id ?? rp.ratePlanCode ?? "").trim()
        const name: string = String(rp.name ?? rp.description ?? brigCode).trim() || brigCode
        const normalizedCode = brigCode

        const existing =
          existingByBrigCode.get(brigCode) || existingByCode.get(normalizedCode) || null

        return {
          ...(existing?.id ? { id: existing.id } : {}),
          hotel_id: hotelId,
          code: normalizedCode,
          brig_rate_code: brigCode,
          name,
          arrangements: [],
          is_active: rp.is_active !== false && rp.active !== false,
          raw_data: rp,
          updated_at: new Date().toISOString(),
        }
      })

      const toUpdate = ratePayloads.filter((u) => (u as any).id)
      const toInsert = ratePayloads.filter((u) => !(u as any).id)

      const results: any[] = []
      if (toUpdate.length > 0) {
        const { data, error } = await supabase
          .from("rates")
          .upsert(toUpdate, { onConflict: "id", ignoreDuplicates: false })
          .select()
        if (error) {
          return NextResponse.json(
            { error: "Errore aggiornamento rates BRiG", details: error.message },
            { status: 500 },
          )
        }
        results.push(...(data || []))
      }
      if (toInsert.length > 0) {
        const { data, error } = await supabase.from("rates").insert(toInsert).select()
        if (error) {
          await logBrig("error", {
            fetched: arr.length,
            failed: toInsert.length,
            error: `insert: ${error.message}`,
          })
          return NextResponse.json(
            { error: "Errore inserimento rates BRiG", details: error.message },
            { status: 500 },
          )
        }
        results.push(...(data || []))
      }

      await logBrig("success", {
        fetched: arr.length,
        inserted: toInsert.length,
        updated: toUpdate.length,
      })

      return NextResponse.json({
        message: "Rates synced successfully",
        count: results.length,
        total: arr.length,
        provider: "brig",
      })
    }

    // ─────────────── SLOPE (nativo, 13/07/2026) ───────────────
    if (pmsName === "slope") {
      const slopeStartedAt = Date.now()
      const logSlope = (
        status: "success" | "partial" | "error",
        details: { fetched?: number; inserted?: number; updated?: number; failed?: number; error?: string },
      ) =>
        logSyncEvent({
          hotelId,
          pmsIntegrationId: pmsIntegration.id,
          pmsName: "slope",
          syncType: "rates",
          status,
          startedAt: slopeStartedAt,
          recordsFetched: details.fetched,
          recordsInserted: details.inserted,
          recordsUpdated: details.updated,
          recordsFailed: details.failed,
          errorMessage: details.error || null,
        })

      if (!pmsIntegration.api_key) {
        return NextResponse.json(
          { error: "Slope api_key non configurata per questo hotel" },
          { status: 400 },
        )
      }

      const slopeClient = new SlopeClient({
        apiKey: pmsIntegration.api_key,
        baseUrl: pmsIntegration.endpoint_url || "",
      })

      let ratePlans
      try {
        ratePlans = await slopeClient.getRatePlans()
      } catch (err) {
        if (err instanceof SlopeError) {
          await logSlope("error", { error: `Slope ${err.status}: ${err.body.slice(0, 300)}` })
          return NextResponse.json(
            {
              error: `Slope /v1/rate-plans ha risposto ${err.status}`,
              details: err.body.slice(0, 500),
            },
            { status: 502 },
          )
        }
        throw err
      }

      if (!Array.isArray(ratePlans) || ratePlans.length === 0) {
        return NextResponse.json(
          { error: "Slope ha risposto OK ma senza rate plans. Verifica l'API key (e' per-struttura)." },
          { status: 404 },
        )
      }

      // Upsert PRESERVANTE (stesso pattern BRiG): match per slope_rate_plan_id
      // poi per code, mai delete-and-insert.
      const { data: existingRates } = await supabase
        .from("rates")
        .select("id, slope_rate_plan_id, code")
        .eq("hotel_id", hotelId)

      const existingBySlopeId = new Map<string, any>()
      const existingByCode = new Map<string, any>()
      for (const r of existingRates || []) {
        if (r.slope_rate_plan_id) existingBySlopeId.set(r.slope_rate_plan_id, r)
        if (r.code) existingByCode.set(r.code, r)
      }

      const ratePayloads = ratePlans.map((rp) => {
        // `name` Slope e' multilingua [{locale,value}]: slopeName estrae
        // it -> en -> primo (verificato live in sandbox 13/07/2026).
        const name = slopeName(rp.name).trim() || rp.id
        const normalizedCode = name
          .toUpperCase()
          .replace(/\s+/g, "_")
          .replace(/[^A-Z0-9_]/g, "")

        const existing =
          existingBySlopeId.get(rp.id) || existingByCode.get(normalizedCode) || null

        return {
          ...(existing?.id ? { id: existing.id } : {}),
          hotel_id: hotelId,
          code: normalizedCode || rp.id,
          slope_rate_plan_id: rp.id,
          name,
          arrangements: [],
          is_active: true,
          // NB: isDerived nel raw_data — le derivate NON vanno pushate
          // (il push-impl Slope le filtra, stessa regola madre/derivata Scidoo).
          raw_data: rp,
          updated_at: new Date().toISOString(),
        }
      })

      const toUpdate = ratePayloads.filter((u) => (u as any).id)
      const toInsert = ratePayloads.filter((u) => !(u as any).id)

      const results: any[] = []
      if (toUpdate.length > 0) {
        const { data, error } = await supabase
          .from("rates")
          .upsert(toUpdate, { onConflict: "id", ignoreDuplicates: false })
          .select()
        if (error) {
          await logSlope("error", { fetched: ratePlans.length, error: `update: ${error.message}` })
          return NextResponse.json(
            { error: "Errore aggiornamento rates Slope", details: error.message },
            { status: 500 },
          )
        }
        results.push(...(data || []))
      }
      if (toInsert.length > 0) {
        const { data, error } = await supabase.from("rates").insert(toInsert).select()
        if (error) {
          await logSlope("error", {
            fetched: ratePlans.length,
            failed: toInsert.length,
            error: `insert: ${error.message}`,
          })
          return NextResponse.json(
            { error: "Errore inserimento rates Slope", details: error.message },
            { status: 500 },
          )
        }
        results.push(...(data || []))
      }

      await logSlope("success", {
        fetched: ratePlans.length,
        inserted: toInsert.length,
        updated: toUpdate.length,
      })

      return NextResponse.json({
        message: "Rates synced successfully",
        count: results.length,
        total: ratePlans.length,
        provider: "slope",
      })
    }

    return NextResponse.json(
      {
        error: `Provider PMS '${pmsName}' non supporta la sincronizzazione automatica delle tariffe.`,
      },
      { status: 400 },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to sync rates",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
