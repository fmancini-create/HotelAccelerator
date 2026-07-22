import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ETLOrchestrator } from "@/lib/etl/etl-orchestrator"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// Force ETL può richiedere parecchi secondi per Barronci (19k raw)
export const maxDuration = 120

/**
 * POST /api/admin/connectors-health/force-etl
 *
 * Lancia il `BookingsProcessor` (path B) per uno o più hotel Scidoo.
 * Risolve sia il "backlog ETL" (raw_unprocessed > 0) sia i "RAW orphan"
 * (raw senza booking corrispondente, perché il path B li creerà).
 *
 * Differenze rispetto a `/api/admin/run-etl`:
 *  - usa il check `super_admin` (allineato agli altri endpoint connectors-health)
 *  - accetta `hotelId?` (singolo) o nessun parametro (tutti gli hotel scidoo)
 *  - gira SOLO `job_type='bookings'` per evitare side-effect sugli altri processori
 *  - aggrega i risultati (incl. block_reason quando il guard ETL rifiuta)
 *
 * SAFETY:
 *  - Solo super_admin
 *  - Rispetta `can_run_etl` (gate Supabase): se mapping non validato, l'hotel
 *    viene skippato con `block_reason` chiaro, non si forza nulla.
 *  - Sequenziale, non parallelo, per non sovraccaricare il DB.
 */
export async function POST(request: NextRequest) {
  // Auth: super_admin only (allineato a /diagnose e /reconcile-cancellations)
  const { user, supabase: authClient } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()

  // Body opzionale: { hotelId?: string, resetOrphans?: boolean }
  // resetOrphans=true → marca `processed=false` i raw senza booking corrispondente
  // PRIMA di lanciare l'ETL, così il processor li rielaborerà (default: false).
  // È l'unico modo per "guarire" gli orphan: il processor processa solo i raw
  // con processed=false, quindi senza reset gli orphan restano per sempre.
  let onlyHotel: string | null = null
  let resetOrphans = false
  try {
    const body = (await request.json().catch(() => ({}))) as {
      hotelId?: string
      resetOrphans?: boolean
    }
    if (body.hotelId) onlyHotel = body.hotelId
    if (body.resetOrphans) resetOrphans = true
  } catch {
    // ignore
  }

  // Lista hotel target: stessa fonte di verità di /diagnose, cioè
  // pms_integrations dove pms_name='scidoo'. (La colonna `pms_name` NON esiste
  // sulla tabella `hotels`.)
  const integrationsQuery = supabase
    .from("pms_integrations")
    .select("hotel_id, hotels(id, name)")
    .eq("pms_name", "scidoo")
  if (onlyHotel) integrationsQuery.eq("hotel_id", onlyHotel)
  const { data: integrations, error: integErr } = await integrationsQuery
  if (integErr) {
    return NextResponse.json({ error: integErr.message }, { status: 500 })
  }
  const hotels = (integrations || [])
    .map((row: { hotel_id: string; hotels: { id: string; name: string } | null }) => ({
      id: row.hotels?.id || row.hotel_id,
      name: row.hotels?.name || "Hotel sconosciuto",
    }))
  if (hotels.length === 0) {
    return NextResponse.json(
      { ok: true, hotels: [], note: "Nessun hotel scidoo trovato" },
      { status: 200 },
    )
  }

  const results: Array<{
    hotel_id: string
    hotel_name: string
    status: "ok" | "blocked" | "error"
    block_reason?: string
    error_message?: string
    records_processed?: number
    records_inserted?: number
    records_updated?: number
    records_failed?: number
    orphans_reset?: number
    /** Quanti raw avevano processed=false PRIMA del sweep finale */
    unprocessed_before_sweep?: number
    /** Quanti raw sono stati marcati processed=true dal sweep finale */
    marked_processed_by_sweep?: number
    /** Quanti raw avevano processed=false MA nessun booking corrispondente
     *  (residuo legittimo dopo il sweep, es. raw appena syncati dal cron). */
    still_unprocessed_after_sweep?: number
    /** Errore raw del sweep finale, se l'update batch fallisce. */
    sweep_error?: string
    duration_ms?: number
  }> = []

  for (const hotel of hotels) {
    const startedAt = Date.now()
    let orphansReset = 0
    try {
      console.log("[v0] force-etl: starting for", hotel.name, hotel.id)

      // STEP 1 (opzionale): marca processed=false i raw senza booking corrispondente.
      // I "RAW orphan" hanno processed=true ma non hanno una riga in bookings col
      // loro pms_booking_id. Senza reset il BookingsProcessor li ignora a vita.
      if (resetOrphans) {
        // Prendo i pms_booking_id presenti in bookings per questo hotel.
        // Stesso bug del sweep: senza paginazione esplicita Supabase ritorna
        // max 1000 righe e l'analisi orphan diventa errata.
        const existingSet = new Set<string>()
        {
          let bFrom = 0
          const PAGE = 1000
          for (let p = 0; p < 200; p++) {
            const { data: page } = await supabase
              .from("bookings")
              .select("pms_booking_id")
              .eq("hotel_id", hotel.id)
              .eq("source", "scidoo")
              .range(bFrom, bFrom + PAGE - 1)
            if (!page || page.length === 0) break
            for (const row of page as { pms_booking_id: string | null }[]) {
              if (row.pms_booking_id) existingSet.add(row.pms_booking_id)
            }
            if (page.length < PAGE) break
            bFrom += PAGE
          }
        }

        // Iter sui raw di questo hotel, raccolgo gli orphan
        const orphanIds: string[] = []
        let from = 0
        const PAGE = 1000
        // SAFETY: limit superiore (50k) per evitare loop infiniti
        for (let i = 0; i < 50; i++) {
          const { data: rawPage } = await supabase
            .from("scidoo_raw_bookings")
            .select("id, scidoo_booking_id, processed")
            .eq("hotel_id", hotel.id)
            .eq("processed", true)
            .range(from, from + PAGE - 1)
          if (!rawPage || rawPage.length === 0) break
          for (const r of rawPage) {
            if (!existingSet.has(r.scidoo_booking_id)) orphanIds.push(r.id)
          }
          if (rawPage.length < PAGE) break
          from += PAGE
        }

        // Reset processed=false in chunk da 200
        if (orphanIds.length > 0) {
          for (let i = 0; i < orphanIds.length; i += 200) {
            const chunk = orphanIds.slice(i, i + 200)
            const { error: resetErr } = await supabase
              .from("scidoo_raw_bookings")
              .update({ processed: false })
              .in("id", chunk)
            if (resetErr) {
              console.error("[v0] force-etl: orphan reset error:", resetErr)
            }
          }
          orphansReset = orphanIds.length
          console.log("[v0] force-etl: reset", orphansReset, "orphans for", hotel.name)
        }
      }

      // STEP 2: lancia l'orchestrator (con il guard can_run_etl integrato)
      const orchestrator = new ETLOrchestrator({
        hotel_id: hotel.id,
        job_type: "bookings",
        triggered_by: "superadmin_force_etl",
        triggered_by_user: user.id,
      })
      const r = await orchestrator.run()

      if (r.blocked) {
        results.push({
          hotel_id: hotel.id,
          hotel_name: hotel.name,
          status: "blocked",
          block_reason: r.block_reason || "ETL guard rejected",
          orphans_reset: orphansReset,
          duration_ms: Date.now() - startedAt,
        })
        continue
      }

      const b = r.results.bookings

      // STEP 3: SWEEP POST-ETL (idempotente, fix per bug noto del processor).
      // Il `BookingsProcessor` fa un batch update di `processed=true` (riga ~178)
      // SENZA error checking: se quell'update fallisce silenziosamente (rate
      // limit, hop di rete, ecc.) il processor riporta comunque inserted=N
      // perché conta solo gli upsert su `bookings`. Risultato: bookings sono
      // popolati ma raw restano `processed=false` → backlog fantasma.
      //
      // Qui rifacciamo l'update in modo idempotente e con reporting esplicito:
      // marca `processed=true` su TUTTI i raw che hanno un booking
      // corrispondente in `bookings` (match su pms_booking_id). I raw senza
      // booking restano `processed=false` (sono il backlog vero, magari appena
      // syncato dal cron mentre giravamo).
      let unprocessedBeforeSweep = 0
      let markedBySweep = 0
      let stillUnprocessedAfterSweep = 0
      let sweepErrorMsg: string | undefined
      try {
        // Carico tutti i pms_booking_id presenti in bookings per questo hotel.
        // ATTENZIONE: paginare esplicitamente con .range() è OBBLIGATORIO.
        // Supabase senza range/limit ritorna solo le prime 1000 righe (default
        // cap), e un .select() naked su tabelle grandi tronca silenziosamente.
        // Era il bug per cui Massabò/Moriano/Barronci marcavano solo
        // ~999/683/300 raw invece di tutti: il bookingsSet era incompleto.
        const bookingsSet = new Set<string>()
        {
          let bFrom = 0
          const PAGE = 1000
          // SAFETY cap: max 200k booking per hotel
          for (let p = 0; p < 200; p++) {
            const { data: page } = await supabase
              .from("bookings")
              .select("pms_booking_id")
              .eq("hotel_id", hotel.id)
              .eq("source", "scidoo")
              .range(bFrom, bFrom + PAGE - 1)
            if (!page || page.length === 0) break
            for (const row of page as { pms_booking_id: string | null }[]) {
              if (row.pms_booking_id) bookingsSet.add(row.pms_booking_id)
            }
            if (page.length < PAGE) break
            bFrom += PAGE
          }
        }

        // Carico tutti i raw con processed=false per questo hotel
        const rawToFix: { id: string; scidoo_booking_id: string }[] = []
        let from = 0
        const PAGE = 1000
        for (let i = 0; i < 50; i++) {
          const { data: page } = await supabase
            .from("scidoo_raw_bookings")
            .select("id, scidoo_booking_id")
            .eq("hotel_id", hotel.id)
            .eq("processed", false)
            .range(from, from + PAGE - 1)
          if (!page || page.length === 0) break
          for (const row of page) rawToFix.push(row)
          if (page.length < PAGE) break
          from += PAGE
        }
        unprocessedBeforeSweep = rawToFix.length

        // Filtra solo quelli che hanno un booking corrispondente (match reale)
        const idsToMark = rawToFix
          .filter((r) => r.scidoo_booking_id && bookingsSet.has(r.scidoo_booking_id))
          .map((r) => r.id)
        stillUnprocessedAfterSweep = unprocessedBeforeSweep - idsToMark.length

        // Update in chunk da 200. Provo PRIMA con processed_at, e se fallisce
        // (es. constraint inatteso sulla colonna) fallback senza timestamp.
        if (idsToMark.length > 0) {
          const nowIso = new Date().toISOString()
          let useTimestamp = true
          for (let i = 0; i < idsToMark.length; i += 200) {
            const chunk = idsToMark.slice(i, i + 200)
            const payload: { processed: boolean; processed_at?: string } = useTimestamp
              ? { processed: true, processed_at: nowIso }
              : { processed: true }
            let { error: sweepErr } = await supabase
              .from("scidoo_raw_bookings")
              .update(payload)
              .in("id", chunk)
            if (sweepErr && useTimestamp && i === 0) {
              console.error(
                "[v0] force-etl: sweep with processed_at failed, retrying without:",
                sweepErr,
              )
              useTimestamp = false
              const retry = await supabase
                .from("scidoo_raw_bookings")
                .update({ processed: true })
                .in("id", chunk)
              sweepErr = retry.error
            }
            if (sweepErr) {
              const detail =
                `${sweepErr.message || "no message"}` +
                (sweepErr.code ? ` [code=${sweepErr.code}]` : "") +
                (sweepErr.details ? ` [details=${sweepErr.details}]` : "") +
                (sweepErr.hint ? ` [hint=${sweepErr.hint}]` : "")
              console.error("[v0] force-etl: sweep update error:", sweepErr)
              sweepErrorMsg = `chunk@${i} (size=${chunk.length}): ${detail}`
              break
            }
            markedBySweep += chunk.length
          }
          console.log(
            `[v0] force-etl: sweep marked ${markedBySweep}/${unprocessedBeforeSweep} for ${hotel.name}` +
              (sweepErrorMsg ? ` (stop: ${sweepErrorMsg})` : ""),
          )
        }
      } catch (sweepErr) {
        const msg = (sweepErr as Error).message
        console.error("[v0] force-etl: sweep step failed (non-fatal):", sweepErr)
        sweepErrorMsg = sweepErrorMsg || msg
      }

      // STEP 4 RIMOSSO 30/04/2026 (post-timeout Barronci 120s): il rate backfill
      // viene ora orchestrato dalla UI come step indipendente via
      // POST /api/superadmin/backfill-rate-fields per ogni hotel.
      // Motivo: con Barronci (~19k bookings) la combinazione force-etl + backfill
      // sforava il maxDuration. Separare i due fa rispettare il budget Vercel
      // e mantiene le metriche pulite. La UI di /superadmin/connectors-health/diagnose
      // chiama i due endpoint in serie.

      results.push({
        hotel_id: hotel.id,
        hotel_name: hotel.name,
        // Se il processor ha records_failed > 0 o un error_message, è uno status "error"
        // anche se l'orchestrator non ha lanciato eccezioni: vogliamo vederlo in UI.
        status: b?.error_message ? "error" : "ok",
        error_message: b?.error_message,
        records_processed: b?.records_processed ?? 0,
        records_inserted: b?.records_inserted ?? 0,
        records_updated: b?.records_updated ?? 0,
        records_failed: b?.records_failed ?? 0,
        orphans_reset: orphansReset,
        unprocessed_before_sweep: unprocessedBeforeSweep,
        marked_processed_by_sweep: markedBySweep,
        still_unprocessed_after_sweep: stillUnprocessedAfterSweep,
        sweep_error: sweepErrorMsg,
        duration_ms: Date.now() - startedAt,
      })
    } catch (e) {
      console.error("[v0] force-etl: error for", hotel.name, e)
      results.push({
        hotel_id: hotel.id,
        hotel_name: hotel.name,
        status: "error",
        error_message: (e as Error).message,
        orphans_reset: orphansReset,
        duration_ms: Date.now() - startedAt,
      })
    }
  }

  console.log("[v0] force-etl: summary", {
    triggered_by: user.id,
    only_hotel: onlyHotel,
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    error: results.filter((r) => r.status === "error").length,
  })

  return NextResponse.json({ ok: true, hotels: results })
}
