/**
 * POST /api/pms/room-types/sync
 *
 * Dispatcher PMS-aware per la sincronizzazione delle tipologie di camere.
 *
 * Sostituisce la chiamata hardcoded a /api/scidoo/room-types/sync che
 * falliva sugli hotel BRiG con `[scidoo] /rooms/getRoomTypes.php failed
 * 401: not authorized` (bug 20/05/2026).
 *
 * Legge `pms_integrations.pms_name` e instrada al provider corretto:
 *   - scidoo -> ScidooClient.getRoomTypes() (path legacy mantenuto invariato)
 *   - brig   -> BrigClient.getRoomTypes() (popola brig_room_code)
 *
 * NOTA: il body restituito e' compatibile con quello del vecchio endpoint
 * Scidoo: { success, count, roomTypes }, in modo che la UI lato client
 * (RoomTypesManager) non debba cambiare oltre l'URL.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooClient } from "@/lib/services/scidoo-client"
import { BrigClient, BrigError, isBrigDailyQuotaExceeded } from "@/lib/connectors/brig/client"
import { SlopeClient, SlopeError } from "@/lib/connectors/slope/client"
import { slopeName } from "@/lib/connectors/slope/types"
import { logSyncEvent } from "@/lib/connectors/sync-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { hotelId } = await request.json()

    if (!hotelId) {
      return NextResponse.json({ error: "Hotel ID is required" }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    const { data: pmsIntegration, error: pmsError } = await supabase
      .from("pms_integrations")
      .select("*")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    if (pmsError || !pmsIntegration) {
      return NextResponse.json(
        { error: "Nessuna integrazione PMS configurata per questo hotel" },
        { status: 404 },
      )
    }

    if (!pmsIntegration.is_active) {
      return NextResponse.json({ error: "PMS integration is not active" }, { status: 400 })
    }

    const pmsName = (pmsIntegration.pms_name || "").toLowerCase()

    // ─────────────── SCIDOO ───────────────
    if (pmsName === "scidoo") {
      const scidooClient = new ScidooClient({
        apiKey: pmsIntegration.api_key,
        propertyId: pmsIntegration.property_id,
      })

      const roomTypes = await scidooClient.getRoomTypes()

      const roomTypesToInsert = roomTypes.map((rt) => {
        const maxOcc = rt.capacity || rt.capacity_default || 2
        const baseOcc = rt.capacity_default || rt.capacity || 2
        return {
          hotel_id: hotelId,
          code: rt.name
            .toUpperCase()
            .replace(/\s+/g, "_")
            .replace(/[^A-Z0-9_]/g, ""),
          scidoo_room_type_id: rt.id.toString(),
          name: rt.name,
          capacity: maxOcc,
          capacity_default: baseOcc,
          min_occupancy: 1,
          max_occupancy: maxOcc,
          total_rooms: rt.rooms || 1,
          size_sqm: rt.size || null,
          additional_beds: rt.additional_beds || 0,
          is_active: true,
        }
      })

      const { error: deleteError } = await supabase.from("room_types").delete().eq("hotel_id", hotelId)
      if (deleteError) {
        return NextResponse.json({ error: "Errore eliminazione room types esistenti" }, { status: 500 })
      }

      const { data: insertedRoomTypes, error: insertError } = await supabase
        .from("room_types")
        .insert(roomTypesToInsert)
        .select()

      if (insertError) {
        return NextResponse.json({ error: "Errore salvataggio room types" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        count: insertedRoomTypes.length,
        roomTypes: insertedRoomTypes,
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
          syncType: "room_types",
          status,
          startedAt: brigStartedAt,
          recordsFetched: details.fetched,
          recordsInserted: details.inserted,
          recordsUpdated: details.updated,
          recordsFailed: details.failed,
          errorMessage: details.error || null,
        })
      // Il bridge BRiG ha gia' avuto problemi di tipo:
      //  - api_key salvata come JWT invece di UUID -> 401
      //  - endpoint senza schema -> normalizeBaseUrl aggiunge https:// ma
      //    App Engine richiede http://
      // Pre-validazione esplicita per dare messaggi utili al super admin.
      const apiKey: string = pmsIntegration.api_key || ""
      if (apiKey.startsWith("eyJ") && apiKey.length > 100) {
        return NextResponse.json(
          {
            error:
              "BRiG api_key sembra essere un JWT (Bearer) e non l'UUID atteso dall'header x-api-key. Richiedi al provider BRiG la API key UUID corretta e aggiornala in /superadmin/connectors-mapping.",
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
      const structureId: string = pmsIntegration.property_id || pmsIntegration.config?.structure_id || ""
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
        raw = await brigClient.getRoomTypes()
      } catch (err) {
        if (err instanceof BrigError) {
          // Quota giornaliera BRiG esaurita (FIX 25/05/2026): messaggio
          // umano + status 429 cosi' la UI puo' distinguerlo da un
          // errore generico 502 (vedi room-types-manager.tsx catch).
          if (err.status === 429 && isBrigDailyQuotaExceeded(err.body)) {
            await logBrig("error", {
              error: `BRiG quota giornaliera esaurita: ${err.body.slice(0, 300)}`,
            })
            return NextResponse.json(
              {
                error:
                  "Quota giornaliera BRiG esaurita (You have reached the maximum number of requests). " +
                  "Sandbox: 100 richieste/giorno. Reset previsto a mezzanotte.",
                details: err.body.slice(0, 500),
                quotaExhausted: true,
              },
              { status: 429 },
            )
          }
          await logBrig("error", { error: `BRiG ${err.status}: ${err.body.slice(0, 300)}` })
          return NextResponse.json(
            {
              error: `BRiG /api/nol/roomtypes/list ha risposto ${err.status}`,
              details: err.body.slice(0, 500),
            },
            { status: 502 },
          )
        }
        throw err
      }

      // BRiG puo' rispondere come array oppure come { data: [...] } / { items: [...] }
      const arr: any[] = Array.isArray(raw)
        ? raw
        : (raw as any)?.data ?? (raw as any)?.items ?? []

      if (!Array.isArray(arr) || arr.length === 0) {
        return NextResponse.json(
          {
            error:
              "BRiG ha risposto OK ma senza room types. Verifica lo structureId / sid configurato per l'hotel.",
            sample: raw,
          },
          { status: 404 },
        )
      }

      // Recupera room types esistenti per preservare i record (mappature,
      // display_order, ecc.) ed evitare il delete-and-insert che farebbe
      // perdere il lavoro fatto in /superadmin/connectors-mapping.
      const { data: existingRoomTypes } = await supabase
        .from("room_types")
        .select("id, brig_room_code, code, name")
        .eq("hotel_id", hotelId)

      // Normalizer condiviso: maiuscole + space->_ + strip caratteri non
      // alfanumerici. Usato sia per `code` sia per `name` per il matching
      // robusto contro varianti tipo "Camera Doppia" vs "DOPPIA".
      const normalize = (s: string) =>
        String(s ?? "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "_")
          .replace(/[^A-Z0-9_]/g, "")

      const existingByBrigCode = new Map<string, any>()
      const existingByCode = new Map<string, any>()
      // FIX 25/05/2026 (incident Cavallino "DOPPIA/MATRIMONIALE non ha
      // brig_room_code mappato"): Brig ritorna il SUO codice interno in
      // `code` (es. "DBL", "MAT"), che NON coincide col nostro
      // room_types.code "umano" ("DOPPIA", "MATRIMONIALE") inserito da
      // utente o da setup manuale. Senza questo terzo indice, il match
      // fallisce e il sync fa insert di nuove righe duplicate, lasciando
      // le vecchie senza brig_room_code e creando 4 righe per 2 camere.
      // Aggiungiamo un fallback per `name` normalizzato che e' invece di
      // norma stabile ("DOPPIA" lato nostro = "Doppia" lato Brig).
      const existingByName = new Map<string, any>()
      for (const rt of existingRoomTypes || []) {
        if (rt.brig_room_code) existingByBrigCode.set(rt.brig_room_code, rt)
        if (rt.code) existingByCode.set(rt.code, rt)
        if (rt.name) {
          const normName = normalize(rt.name)
          if (normName) existingByName.set(normName, rt)
        }
      }

      const upserts = arr.map((rt: any) => {
        const code: string = String(rt.code ?? rt.id ?? rt.roomTypeCode ?? "").trim()
        const name: string = String(rt.name ?? rt.description ?? code).trim() || code
        const capacity = Number(rt.capacity ?? rt.maxOccupancy ?? rt.maxPax ?? 2) || 2
        const totalRooms = Number(rt.quantity ?? rt.rooms ?? rt.totalRooms ?? 1) || 1

        const normalizedCode = normalize(code)
        const normalizedName = normalize(name)

        // Priorita' di match (la prima che trova vince):
        //  1. brig_room_code esatto (idempotenza dei sync successivi)
        //  2. code normalizzato (caso storico Scidoo dove code == nome custom)
        //  3. name normalizzato (caso Brig dove code Brig != code nostro)
        const existing =
          existingByBrigCode.get(code) ||
          existingByCode.get(normalizedCode) ||
          existingByName.get(normalizedName) ||
          null

        return {
          ...(existing?.id ? { id: existing.id } : {}),
          hotel_id: hotelId,
          code: normalizedCode || code,
          brig_room_code: code,
          name,
          capacity,
          capacity_default: capacity,
          min_occupancy: 1,
          max_occupancy: capacity,
          total_rooms: totalRooms,
          additional_beds: 0,
          is_active: true,
        }
      })

      // Upsert su id quando presente (preserva mappature), insert puro per i
      // codici nuovi.
      const toUpdate = upserts.filter((u) => (u as any).id)
      const toInsert = upserts.filter((u) => !(u as any).id)

      const results: any[] = []

      if (toUpdate.length > 0) {
        const { data, error } = await supabase
          .from("room_types")
          .upsert(toUpdate, { onConflict: "id", ignoreDuplicates: false })
          .select()
        if (error) {
          return NextResponse.json(
            { error: "Errore aggiornamento room types BRiG", details: error.message },
            { status: 500 },
          )
        }
        results.push(...(data || []))
      }

      if (toInsert.length > 0) {
        const { data, error } = await supabase.from("room_types").insert(toInsert).select()
        if (error) {
          await logBrig("error", {
            fetched: arr.length,
            failed: toInsert.length,
            error: `insert: ${error.message}`,
          })
          return NextResponse.json(
            { error: "Errore inserimento room types BRiG", details: error.message },
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
        success: true,
        count: results.length,
        roomTypes: results,
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
          syncType: "room_types",
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

      let lodgingTypes
      try {
        lodgingTypes = await slopeClient.getLodgingTypes()
      } catch (err) {
        if (err instanceof SlopeError) {
          await logSlope("error", { error: `Slope ${err.status}: ${err.body.slice(0, 300)}` })
          return NextResponse.json(
            {
              error: `Slope /v1/lodging-types ha risposto ${err.status}`,
              details: err.body.slice(0, 500),
            },
            { status: 502 },
          )
        }
        throw err
      }

      if (!Array.isArray(lodgingTypes) || lodgingTypes.length === 0) {
        return NextResponse.json(
          { error: "Slope ha risposto OK ma senza lodging types. Verifica l'API key (e' per-struttura)." },
          { status: 404 },
        )
      }

      // Upsert PRESERVANTE (stesso pattern BRiG): mai delete-and-insert, per
      // non perdere mappature/display_order fatte in connectors-mapping.
      const { data: existingRoomTypes } = await supabase
        .from("room_types")
        .select("id, slope_lodging_type_id, code, name")
        .eq("hotel_id", hotelId)

      const normalize = (s: string) =>
        String(s ?? "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "_")
          .replace(/[^A-Z0-9_]/g, "")

      const existingBySlopeId = new Map<string, any>()
      const existingByCode = new Map<string, any>()
      const existingByName = new Map<string, any>()
      for (const rt of existingRoomTypes || []) {
        if (rt.slope_lodging_type_id) existingBySlopeId.set(rt.slope_lodging_type_id, rt)
        if (rt.code) existingByCode.set(rt.code, rt)
        if (rt.name) {
          const normName = normalize(rt.name)
          if (normName) existingByName.set(normName, rt)
        }
      }

      const upserts = lodgingTypes.map((lt) => {
        // `name` Slope e' un array multilingua [{locale,value}] (verificato
        // live in sandbox 13/07/2026): slopeName estrae it -> en -> primo.
        const name = slopeName(lt.name).trim() || lt.id
        const capacity = Number(lt.maximumCapacity ?? lt.nominalCapacity ?? 2) || 2
        const baseCapacity = Number(lt.nominalCapacity ?? capacity) || capacity
        const normalizedName = normalize(name)

        // Priorita' di match: 1) slope_lodging_type_id (idempotenza),
        // 2) code normalizzato, 3) name normalizzato.
        const existing =
          existingBySlopeId.get(lt.id) ||
          existingByCode.get(normalizedName) ||
          existingByName.get(normalizedName) ||
          null

        return {
          ...(existing?.id ? { id: existing.id } : {}),
          hotel_id: hotelId,
          code: normalizedName || lt.id,
          slope_lodging_type_id: lt.id,
          name,
          capacity,
          capacity_default: baseCapacity,
          min_occupancy: 1,
          max_occupancy: capacity,
          total_rooms: Number(lt.quantity ?? 1) || 1,
          additional_beds: 0,
          is_active: true,
        }
      })

      const toUpdate = upserts.filter((u) => (u as any).id)
      const toInsert = upserts.filter((u) => !(u as any).id)
      const results: any[] = []

      if (toUpdate.length > 0) {
        const { data, error } = await supabase
          .from("room_types")
          .upsert(toUpdate, { onConflict: "id", ignoreDuplicates: false })
          .select()
        if (error) {
          await logSlope("error", { fetched: lodgingTypes.length, error: `update: ${error.message}` })
          return NextResponse.json(
            { error: "Errore aggiornamento room types Slope", details: error.message },
            { status: 500 },
          )
        }
        results.push(...(data || []))
      }

      if (toInsert.length > 0) {
        const { data, error } = await supabase.from("room_types").insert(toInsert).select()
        if (error) {
          await logSlope("error", {
            fetched: lodgingTypes.length,
            failed: toInsert.length,
            error: `insert: ${error.message}`,
          })
          return NextResponse.json(
            { error: "Errore inserimento room types Slope", details: error.message },
            { status: 500 },
          )
        }
        results.push(...(data || []))
      }

      await logSlope("success", {
        fetched: lodgingTypes.length,
        inserted: toInsert.length,
        updated: toUpdate.length,
      })

      return NextResponse.json({
        success: true,
        count: results.length,
        roomTypes: results,
        provider: "slope",
      })
    }

    // ─────────────── PMS NON SUPPORTATO ───────────────
    return NextResponse.json(
      {
        error: `Provider PMS '${pmsName}' non supporta la sincronizzazione automatica delle tipologie di camera. Configura le tipologie manualmente o contatta il supporto.`,
      },
      { status: 400 },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore sconosciuto" },
      { status: 500 },
    )
  }
}
