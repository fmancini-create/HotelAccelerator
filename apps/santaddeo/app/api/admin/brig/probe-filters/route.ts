import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createClient } from "@supabase/supabase-js"
import { BrigClient } from "@/lib/connectors/brig/client"
import type { BrigPaginatedReservations } from "@/lib/connectors/brig/types"

export const maxDuration = 300

/**
 * GET /api/admin/brig/probe-filters?hotelId=...&pageSizeA=100&pageSizeB=71&dates=2026-06-03,2026-07-25
 *
 * STRUMENTO DIAGNOSTICO (solo super_admin). NON scrive nulla su DB.
 *
 * STORIA:
 *  - probe v1: l'endpoint IGNORA ogni filtro periodo (honoredFilters vuoto).
 *  - probe v2 (passata singola): pageSize 100 -> 3886 righe ma solo ~3306
 *    reservationCode DISTINTI (580 duplicati). totalItems=3886 conta i
 *    DUPLICATI. Re-fetch della stessa pagina = identico (ordine stabile).
 *
 * DOMANDA DECISIVA (probe v3): variando `pageSize` (che sposta i confini di
 * pagina dove nascono i duplicati) l'UNIONE dei distinti CRESCE verso 3886 e
 * RECUPERA le prenotazioni mancanti su date note?
 *   - Cammina con pageSizeA e pageSizeB, accumula l'unione per reservationCode.
 *   - Misura |A|, |B|, |A∪B|, codici nuovi visti solo in B.
 *   - Per ogni data sentinella conta le camere occupate (checkin<=D<checkout,
 *     status non cancellato) usando SOLO A vs usando A∪B: se l'unione si
 *     avvicina al valore reale del gestionale (es. 03/06 = 65), allora la cura
 *     e' "sweep multi-pageSize con union+dedup per reservationCode".
 *
 * Costo quota: ~ceil(total/pageSizeA) + ceil(total/pageSizeB). Con 3886 e
 * 100+71 ~= 39+55 = 94, entro 100/giorno SE la quota e' fresca. Si ferma se
 * BRiG risponde "maximum number of requests".
 */

function extractItems(res: BrigPaginatedReservations): Array<Record<string, unknown>> {
  return (res.items ?? res.data ?? res.reservations ?? []) as Array<Record<string, unknown>>
}

const rcOf = (row: Record<string, unknown>) =>
  (row.reservationCode ?? row._id ?? JSON.stringify(row)) as string

const isCancelled = (row: Record<string, unknown>) => {
  const s = String(row.status ?? "").toUpperCase()
  return s === "DELETED" || s === "CANCELLED" || s === "CANCELED" || s === "NOSHOW" || s === "NO_SHOW"
}

const dayOf = (v: unknown): string | null => {
  if (!v) return null
  const s = String(v)
  // ISO "2026-06-03T00:00:00Z" o "2026-06-03"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Camere occupate nella notte D: checkin <= D < checkout, non cancellata. */
function coversDate(row: Record<string, unknown>, d: string): boolean {
  if (isCancelled(row)) return false
  const ci = dayOf(row.checkin)
  const co = dayOf(row.checkout)
  if (!ci || !co) return false
  return ci <= d && d < co
}

async function walk(
  client: BrigClient,
  pageSize: number,
  budget: { left: number },
): Promise<{ rows: Map<string, Record<string, unknown>>; totalItems: number | null; pages: number; quotaHit: boolean }> {
  const rows = new Map<string, Record<string, unknown>>()
  let totalItems: number | null = null
  let pages = 0
  let quotaHit = false
  for (let page = 1; budget.left > 0; page++) {
    let res: BrigPaginatedReservations
    try {
      res = await client.getReservations({ page, pageSize })
      budget.left--
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/maximum number of requests/i.test(msg)) {
        quotaHit = true
        break
      }
      throw err
    }
    if (totalItems == null) totalItems = res.totalItems ?? null
    const items = extractItems(res)
    if (items.length === 0) break
    pages = page
    for (const row of items) rows.set(rcOf(row), row)
    if (items.length < pageSize) break
    if (totalItems != null && page >= Math.ceil(totalItems / pageSize) + 2) break
  }
  return { rows, totalItems, pages, quotaHit }
}

function occupancy(rows: Iterable<Record<string, unknown>>, dates: string[]) {
  const out: Record<string, number> = {}
  for (const d of dates) out[d] = 0
  for (const row of rows) {
    for (const d of dates) if (coversDate(row, d)) out[d]++
  }
  return out
}

export async function GET(request: Request) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "missing_hotel_id", hint: "?hotelId=uuid" }, { status: 400 })
  const pageSizeA = Math.min(Number(searchParams.get("pageSizeA") || 100), 100)
  const pageSizeB = Math.min(Number(searchParams.get("pageSizeB") || 71), 100)
  const maxRequests = Number(searchParams.get("maxRequests") || 96)
  const today = new Date().toISOString().slice(0, 10)
  const dates = (searchParams.get("dates") || today).split(",").map((s) => s.trim()).filter(Boolean)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: "missing_supabase_env" }, { status: 500 })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: integration, error: intErr } = await admin
    .from("pms_integrations")
    .select("api_key, property_id, endpoint_url")
    .eq("hotel_id", hotelId)
    .eq("pms_name", "brig")
    .eq("integration_mode", "api")
    .maybeSingle()
  if (intErr) return NextResponse.json({ error: "integration_read_failed", detail: intErr.message }, { status: 500 })
  if (!integration?.api_key || !integration?.property_id) {
    return NextResponse.json({ error: "brig_integration_incomplete" }, { status: 400 })
  }
  const baseUrl = integration.endpoint_url || process.env.BRIG_BASE_URL
  if (!baseUrl) return NextResponse.json({ error: "missing_base_url" }, { status: 500 })

  const client = new BrigClient({ baseUrl, apiKey: integration.api_key, structureId: integration.property_id })
  const budget = { left: maxRequests }

  let A: Awaited<ReturnType<typeof walk>>
  let B: Awaited<ReturnType<typeof walk>> | null = null
  try {
    A = await walk(client, pageSizeA, budget)
    if (!A.quotaHit && budget.left > 0) B = await walk(client, pageSizeB, budget)
  } catch (err) {
    return NextResponse.json(
      { error: "walk_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  // Unione A∪B
  const union = new Map<string, Record<string, unknown>>(A.rows)
  let newInB = 0
  if (B) for (const [rc, row] of B.rows) { if (!union.has(rc)) newInB++; union.set(rc, row) }

  const totalItems = A.totalItems ?? B?.totalItems ?? null
  const occA = occupancy(A.rows.values(), dates)
  const occUnion = occupancy(union.values(), dates)
  const occByDate = dates.map((d) => ({ date: d, soloA: occA[d], unione: occUnion[d], recuperate: occUnion[d] - occA[d] }))

  const distinctA = A.rows.size
  const distinctUnion = union.size
  const recovered = distinctUnion - distinctA

  let diagnosis: string
  if (!B) {
    diagnosis = A.quotaHit
      ? "Quota BRiG esaurita durante la passata A: rilancia domani (quota fresca) per la prova unione."
      : "Solo passata A completata (budget richieste). Aumenta maxRequests o rilancia."
  } else if (recovered > 20) {
    diagnosis =
      `Variare pageSize RECUPERA dati: l'unione aggiunge ${recovered} reservationCode (${distinctUnion} vs ${distinctA}). ` +
      "CURA: sweep multi-pageSize con union+dedup per reservationCode, accumulato in DB e ripetuto finche' converge."
  } else {
    diagnosis =
      `Variare pageSize NON recupera quasi nulla (+${recovered}). I ~580 mancanti non sono raggiungibili neppure cambiando i confini di pagina: ` +
      "il limite e' nell'API (probabile dataset reale = ~3306; totalItems gonfiato dai duplicati lato server). " +
      "In tal caso il fix e' il GATE: smettere di inseguire 3886 e considerare completo a convergenza (distinct stabile)."
  }

  return NextResponse.json({
    hotelId,
    dates,
    totalItemsDichiarato: totalItems,
    walkA: { pageSize: pageSizeA, pages: A.pages, distinct: distinctA, quotaHit: A.quotaHit },
    walkB: B
      ? { pageSize: pageSizeB, pages: B.pages, distinct: B.rows.size, quotaHit: B.quotaHit }
      : null,
    unione: { distinct: distinctUnion, nuoviInB: newInB, recuperatiVsA: recovered },
    occupazionePerData: occByDate,
    requestsUsed: maxRequests - budget.left,
    diagnosis,
  })
}
