/**
 * PRICING PARAMS API - VERSION 8
 * Saves pricing algorithm parameters using a SINGLE bulk DELETE + bulk INSERT.
 *
 * 23/05/2026: V7 faceva un DELETE+INSERT PER OGNI data. Quando l'utente
 * inviava un range lungo (es. "Invia prezzi al PMS 23/05/2026 -> 10/01/2027",
 * 232 giorni) erano 232 round-trip sequenziali a Supabase: ben oltre il
 * maxDuration di 30s -> 504 -> il client riceveva la pagina HTML di errore
 * Vercel ("An error occurred") e falliva il JSON.parse mostrando in dialog
 * "Unexpected token 'A', 'An error o'... is not valid JSON".
 *
 * Ora: 1 DELETE su (hotel_id, date IN [...], param_key IN [...]) + 1 INSERT
 * bulk. Tempo costante indipendente dalla dimensione del range.
 *
 * Table: pricing_algo_params
 */
import { createClient, getAuthUser } from "@/lib/supabase/server"
import { fetchAllPaginated } from "@/lib/supabase/paginate"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function saveParams(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hotelId: string,
  params: Array<{ param_key: string; date: string; value: unknown }>
): Promise<number> {
  console.log("[v0] PRICING-PARAMS V8 - saving", params.length, "params for hotel:", hotelId)

  // Filtro params validi.
  const valid = params.filter(p => p.param_key && p.date && p.value !== undefined)
  if (valid.length === 0) return 0

  // ============================================================
  // INCIDENTE 15/07/2026 (Barronci: parametri manuali SPARITI da
  // settembre a dicembre): il vecchio DELETE bulk era un PRODOTTO
  // CARTESIANO (hotel, date IN tutteLeDate, param_key IN tutteLeChiavi).
  // Se il client aveva in memoria un solo parametro per la data D (es.
  // stato troncato dal cap 1000 del GET, o compilazione di una chiave
  // sola su un range), il DELETE spazzava TUTTE le ~60 chiavi su D e
  // l'insert reinseriva solo quella inviata -> wipe silenzioso di
  // base_rate, incrementi tipologia/tariffa/occupazione, soglie, ecc.
  // ORA: niente delete preventivo. UPSERT per i valori pieni; DELETE
  // SOLO delle coppie (param_key, date) esplicitamente inviate con
  // value === "" (marker di cancellazione), raggruppate per chiave.
  // Una coppia mai inviata NON viene MAI toccata.
  // ============================================================
  const nonEmpty = valid.filter(p => String(p.value) !== "")
  const deleteMarkers = valid.filter(p => String(p.value) === "")

  if (deleteMarkers.length > 0) {
    const datesByKey = new Map<string, string[]>()
    for (const m of deleteMarkers) {
      const arr = datesByKey.get(m.param_key) ?? []
      arr.push(m.date)
      datesByKey.set(m.param_key, arr)
    }
    for (const [key, dates] of datesByKey) {
      const { error: delErr } = await supabase
        .from("pricing_algo_params")
        .delete()
        .eq("hotel_id", hotelId)
        .eq("param_key", key)
        .in("date", dates)
      if (delErr) {
        console.error("[v0] V9 targeted delete error:", key, delErr.message)
        throw new Error(`pricing_algo_params delete failed: ${delErr.message}`)
      }
    }
  }

  if (nonEmpty.length === 0) {
    // Solo marker di cancellazione: lavoro gia' fatto.
    return valid.length
  }

  // DEDUP (18/06/2026): la tabella ha un vincolo univoco
  // `idx_pricing_algo_params_unique` su (hotel_id, date, param_key). Se il client
  // invia due righe con la STESSA combinazione (range sovrapposti, chiave
  // ripetuta) l'INSERT bulk falliva con 23505 duplicate key -> 500. Deduplichiamo
  // last-wins per (date|param_key) prima di scrivere.
  const nowIso = new Date().toISOString()
  const byKey = new Map<string, { hotel_id: string; param_key: string; date: string; param_value: string; updated_at: string }>()
  for (const p of nonEmpty) {
    byKey.set(`${p.date}|${p.param_key}`, {
      hotel_id: hotelId,
      param_key: p.param_key,
      date: p.date,
      param_value: String(p.value),
      updated_at: nowIso,
    })
  }
  const rows = Array.from(byKey.values())

  // UPSERT in chunk (onConflict sulle colonne del vincolo univoco): robusto
  // anche se il DELETE sopra ha lasciato residui o in caso di race. PostgREST
  // limita il body ~1MB, 1000 righe/chunk e' largo (range tipico 365 * ~5 keys).
  const CHUNK = 1000
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error: insErr } = await supabase
      .from("pricing_algo_params")
      .upsert(slice, { onConflict: "hotel_id,date,param_key" })
    if (insErr) {
      console.error("[v0] V8 bulk upsert error:", insErr.message)
      throw new Error(`pricing_algo_params upsert failed: ${insErr.message}`)
    }
    inserted += slice.length
  }

  console.log(
    "[v0] V8 - saved",
    inserted,
    "rows (deleted-only:",
    valid.length - nonEmpty.length,
    ", deduped:",
    nonEmpty.length - rows.length,
    ")",
  )
  return valid.length
}

export async function POST(request: NextRequest) {
  console.log("[v0] ========== PRICING-PARAMS API VERSION 8 ==========")
  
  try {
    const body = await request.json()
    console.log("[v0] V8 received body keys:", Object.keys(body))
    
    const { hotel_id, params, occupancy_bands } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    // BUG FIX 30/04/2026 (audit globale): hotel access check.
    // Prima l'auth user veniva estratto ma NON utilizzato come gate
    // (`userId = user?.id ?? null`, mai verificato). Significa che un
    // utente di Hotel A poteva (a) sovrascrivere TUTTI gli occupancy_bands
    // di Hotel B (DELETE+INSERT senza filtro per ownership) e
    // (b) scrivere/sovrascrivere `pricing_algo_params` di qualsiasi hotel.
    const denied = await validateHotelAccess(hotel_id)
    if (denied) return denied

    // Auth check
    const isV0Preview = await isDevAuthAsync()
    let userId: string | null = null
    if (isV0Preview) {
      userId = "5de43b7b-e661-4e4e-8177-7943df06470c"
    } else {
      const userClient = await createClient()
      const user = await getAuthUser(userClient)
      userId = user?.id ?? null
    }

    const supabase = await createClient()
    
    // Save params using pricing_algo_params table
    let savedCount = 0
    if (params && Array.isArray(params) && params.length > 0) {
      savedCount = await saveParams(supabase, hotel_id, params)
    } else {
      console.log("[v0] V8 - no params in request")
    }
    
    // Save occupancy bands
    if (occupancy_bands && Array.isArray(occupancy_bands) && occupancy_bands.length > 0) {
      // Delete existing bands for this hotel
      await supabase
        .from("occupancy_bands")
        .delete()
        .eq("hotel_id", hotel_id)
      
      // Insert new bands with correct column mapping
      const bandsToInsert = occupancy_bands.map((band: any) => ({
        hotel_id: hotel_id,
        group_id: band.group_id || null,
        band_index: band.band_index ?? 0,
        min_pct: band.min_pct ?? 0,
        max_pct: band.max_pct ?? 100,
        min_num: band.min_num ?? 0,
        max_num: band.max_num ?? 999,
        increment_pct: band.increment_pct ?? 0,
        increment_eur: band.increment_eur ?? 0,
        increment_mode: band.increment_mode || "eur",
        occupancy_mode: band.occupancy_mode || "pct",
        label: band.label || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
      
      const { error: bandsErr } = await supabase
        .from("occupancy_bands")
        .insert(bandsToInsert)
      
      if (bandsErr) {
        console.error("[v0] V8 bands insert error:", bandsErr.message)
      } else {
        console.log("[v0] V8 - saved", bandsToInsert.length, "occupancy bands with correct schema")
      }
    }
    
    const recalcId = crypto.randomUUID()
    console.log("[v0] V8 complete - recalc_id:", recalcId, "saved:", savedCount)

    return NextResponse.json({
      success: true,
      recalc_id: recalcId,
      saved_params: savedCount,
      message: "Parametri salvati. Ricalcolo prezzi in corso in background...",
    })
  } catch (error) {
    console.error("[v0] V8 error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore sconosciuto" },
      { status: 500 }
    )
  }
}

// Also handle GET requests for reading params
export async function GET(request: NextRequest) {
  try {
    const hotelId = request.nextUrl.searchParams.get("hotel_id")
    const startDate = request.nextUrl.searchParams.get("start_date")
    const endDate = request.nextUrl.searchParams.get("end_date")
    
    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    // Hotel access gate (vedi POST sopra per motivazione).
    const denied = await validateHotelAccess(hotelId, null, { allowSeller: "full" })
    if (denied) return denied

    const supabase = await createClient()

    // FIX 15/07/2026: query paginata con ordine univoco (date + param_key).
    // La versione precedente era una singola SELECT senza .range(): PostgREST
    // cappa a 1000 righe IN SILENZIO e un hotel supera quella soglia in ~17
    // giorni di parametri (Barronci = 61 param_key/giorno). Stessa classe di
    // bug del cap su pricing-grid / push-grid (vedi memoria 1000-cap).
    const buildQuery = () => {
      let q: any = supabase
        .from("pricing_algo_params")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("date", { ascending: true })
        .order("param_key", { ascending: true })
      if (startDate) q = q.gte("date", startDate)
      if (endDate) q = q.lte("date", endDate)
      return q
    }
    const { data, error } = await fetchAllPaginated<any>(buildQuery)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ params: data })
  } catch (error) {
    console.error("[v0] GET pricing-params error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
