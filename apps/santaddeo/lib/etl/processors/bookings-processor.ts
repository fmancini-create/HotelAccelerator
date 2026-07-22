// ETL Processor for Bookings
// Transforms raw bookings from public schema to normalized bookings

import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooMapper } from "../mappers/scidoo-mapper"
import type { ETLResult, RoomTypeMapping } from "../types"
import { notifyHotelUsersByPreference } from "@/lib/notifications/notify"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, baseDelay = 2000): Promise<T> {
  let lastError: Error | null = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const errorMessage = lastError.message.toLowerCase()

      // Check if it's a rate limit error
      const isRateLimit =
        errorMessage.includes("too many") || errorMessage.includes("rate limit") || errorMessage.includes("429")

      if (i < maxRetries - 1) {
        // Longer wait for rate limits
        const waitTime = isRateLimit ? baseDelay * Math.pow(2, i + 1) : baseDelay * Math.pow(2, i)
        console.log(`[v0] Retry ${i + 1}/${maxRetries} after ${waitTime}ms (rate limit: ${isRateLimit})`)
        await delay(waitTime)
      }
    }
  }
  throw lastError
}

export class BookingsProcessor {
  private hotelId: string
  private etlJobId: string

  constructor(hotelId: string, etlJobId: string) {
    this.hotelId = hotelId
    this.etlJobId = etlJobId
  }

  async process(): Promise<ETLResult> {
    const startTime = Date.now()
    const supabase = await createServiceRoleClient()

    let recordsProcessed = 0
    let recordsInserted = 0
    let recordsUpdated = 0
    const recordsSkipped = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      console.log("[v0] ETL: Starting bookings processing for hotel", this.hotelId)

      await delay(1000)

      // Load room_types (RMS truth table) for scidoo_room_type_id -> UUID mapping
      const { data: roomTypes, error: roomTypesError } = await supabase
        .from("room_types")
        .select("id, scidoo_room_type_id")
        .eq("hotel_id", this.hotelId)

      if (roomTypesError) {
        console.log("[v0] ETL: Error fetching room types, continuing without mappings")
      }

      const mappings: RoomTypeMapping[] =
        roomTypes?.map((rt) => ({
          scidoo_room_type_id: rt.scidoo_room_type_id || "",
          santaddeo_room_type_id: rt.id,
        })) || []

      // Build rate_id -> room_type UUID fallback for bookings where room_type_id=0
      const scidooRtMap = new Map<string, string>()
      for (const rt of roomTypes || []) {
        if (rt.scidoo_room_type_id) scidooRtMap.set(String(rt.scidoo_room_type_id), rt.id)
      }

      const rateToRoomType = new Map<string, string>()
      const { data: rawRates } = await supabase
        .from("scidoo_raw_rates")
        .select("scidoo_rate_id, room_type_id")
        .eq("hotel_id", this.hotelId)
      if (rawRates) {
        for (const rate of rawRates) {
          if (rate.room_type_id && rate.scidoo_rate_id) {
            const rtUuid = scidooRtMap.get(String(rate.room_type_id))
            if (rtUuid) rateToRoomType.set(String(rate.scidoo_rate_id), rtUuid)
          }
        }
      }
      console.log("[v0] ETL: rate->room fallbacks:", rateToRoomType.size)

      // Cache rates: pms_rate_id (string) -> { id (uuid), name, code }
      // FIX 30/04/2026 v2 (post-incident orphan Massabò 2306):
      // La query precedente faceva `SELECT pms_rate_id FROM rates`. Quella
      // colonna NON ESISTE in questo progetto: la tabella `rates` ha solo
      // `scidoo_rate_id`. La query restituisce error 42703, il client supabase
      // lo mette in `.error`, ma qui non veniva destrutturato e l'errore
      // veniva ignorato. rateCache restava vuoto. Da solo sarebbe innocuo
      // (rate_id/rate_name finiscono NULL), MA combinato con altri side-effect
      // del cron (ratesRows = null + autoheal sequence in /api/scidoo/rates/sync
      // anch'esso su pms_rate_id) ha contribuito al fail dei 3 booking nuovi
      // Massabò ogni 30 minuti.
      // Ora leggiamo `scidoo_rate_id` (che esiste davvero) e logghiamo errori.
      const rateCache = new Map<string, { id: string; name: string | null; code: string | null }>()
      const { data: ratesRows, error: ratesErr } = await supabase
        .from("rates")
        .select("id, scidoo_rate_id, name, code")
        .eq("hotel_id", this.hotelId)
      if (ratesErr) {
        console.error("[v0] ETL: rate cache load failed (non-fatal):", ratesErr.message)
      }
      if (ratesRows) {
        for (const r of ratesRows) {
          if (r.scidoo_rate_id) {
            rateCache.set(String(r.scidoo_rate_id), { id: r.id, name: r.name, code: r.code })
          }
        }
      }
      console.log("[v0] ETL: rate cache loaded:", rateCache.size, "entries")

      const mapper = new ScidooMapper(this.hotelId, mappings, rateToRoomType, rateCache)

      await delay(500)

      // Fetch ALL unprocessed bookings (no artificial limit)
      let allRawBookings: any[] = []
      let fetchOffset = 0
      const FETCH_SIZE = 1000
      while (true) {
        const { data: batch, error: fetchError } = await supabase
          .from("scidoo_raw_bookings")
          .select("*")
          .eq("hotel_id", this.hotelId)
          .eq("processed", false)
          .order("synced_at", { ascending: true })
          .range(fetchOffset, fetchOffset + FETCH_SIZE - 1)

        if (fetchError) {
          console.log("[v0] ETL: Error fetching raw bookings:", fetchError.message)
          break
        }
        if (!batch || batch.length === 0) break
        allRawBookings = allRawBookings.concat(batch)
        fetchOffset += FETCH_SIZE
        if (batch.length < FETCH_SIZE) break
      }

      console.log("[v0] ETL: Found", allRawBookings.length, "unprocessed bookings")

      // PRE-LOAD per notifiche: per ognuno dei pms_booking_id dei raw nuovi
      // ricaviamo lo stato CORRENTE in `bookings` (esiste? era cancellato?).
      // Questo ci permette, dopo l'upsert, di classificare:
      //   - "nuova prenotazione"  -> pms_booking_id non presente prima
      //   - "cancellazione"       -> esisteva con is_cancelled=false e ora e' true
      // Nota: non blocchiamo l'ETL se la query fallisce; le notifiche sono
      // best-effort.
      const existingByPmsId = new Map<string, { is_cancelled: boolean }>()
      try {
        const pmsIds = Array.from(
          new Set(
            allRawBookings
              .map((rb) => (rb?.raw_data?.id ?? rb?.scidoo_booking_id ?? rb?.pms_booking_id) as string | null)
              .filter((x): x is string => !!x)
              .map(String),
          ),
        )
        // Carichiamo a chunk per evitare URL troppo lunghe
        const PRELOAD_CHUNK = 200
        for (let i = 0; i < pmsIds.length; i += PRELOAD_CHUNK) {
          const chunk = pmsIds.slice(i, i + PRELOAD_CHUNK)
          const { data: existing } = await supabase
            .from("bookings")
            .select("pms_booking_id, is_cancelled")
            .eq("hotel_id", this.hotelId)
            .in("pms_booking_id", chunk)
          for (const row of existing ?? []) {
            if ((row as any)?.pms_booking_id) {
              existingByPmsId.set(String((row as any).pms_booking_id), {
                is_cancelled: !!(row as any).is_cancelled,
              })
            }
          }
        }
      } catch (preloadErr) {
        console.error("[v0] ETL: notifications pre-load failed (non-fatal):", preloadErr)
      }

      // Map all bookings first
      const toUpsert: any[] = []
      const processedIds: string[] = []
      const failedIds: string[] = []

      for (const rawBooking of allRawBookings) {
        recordsProcessed++
        try {
          const normalizedBooking = mapper.mapBooking(rawBooking.raw_data || rawBooking)
          toUpsert.push({ ...normalizedBooking, updated_at: new Date().toISOString() })
          processedIds.push(rawBooking.id)
        } catch (error) {
          recordsFailed++
          failedIds.push(rawBooking.id)
          console.error("[v0] ETL: Error mapping booking", rawBooking.id, error)
        }
      }

      console.log(`[v0] ETL: Mapped ${toUpsert.length} bookings, ${failedIds.length} failed. Upserting in batches...`)

      // FIX 30/04/2026 (post-incident orphan Massabò): tracciamo il PRIMO
      // errore di upsert per riportarlo in `etl_jobs.error_message`. Prima
      // gli errori venivano solo loggati in console.error e i 3 booking
      // Massabò falliti ogni 30min restavano invisibili in DB. Ora il
      // primo errore reale (es. constraint, FK, type mismatch) e' visibile
      // sulla pagina /superadmin/connectors-health.
      const failureSamples: string[] = []
      const captureFailure = (pmsBookingId: string | undefined, err: unknown) => {
        if (failureSamples.length >= 3) return
        const e = err as { message?: string; code?: string; details?: string; hint?: string }
        const parts = [
          pmsBookingId ? `pms_booking_id=${pmsBookingId}` : null,
          e?.message,
          e?.code ? `code=${e.code}` : null,
          e?.details ? `details=${e.details}` : null,
          e?.hint ? `hint=${e.hint}` : null,
        ].filter(Boolean)
        failureSamples.push(parts.join(" | "))
      }

      // Batch upsert into bookings table (chunks of 200)
      const BATCH_SIZE = 200
      for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
        const chunk = toUpsert.slice(i, i + BATCH_SIZE)
        try {
          const { error } = await withRetry(async () => {
            return await supabase
              .from("bookings")
              .upsert(chunk, { onConflict: "hotel_id,pms_booking_id", ignoreDuplicates: false, count: "exact" })
          })
          if (error) throw error
          recordsInserted += chunk.length
          console.log(`[v0] ETL: bookings batch ${Math.floor(i / BATCH_SIZE) + 1}: ${Math.min(i + BATCH_SIZE, toUpsert.length)}/${toUpsert.length}`)
        } catch (error) {
          console.error("[v0] ETL: bookings batch error:", error)
          captureFailure(undefined, error)
          // Fallback: insert one by one for this batch to identify bad records
          for (const booking of chunk) {
            try {
              const { error: singleErr } = await supabase
                .from("bookings")
                .upsert(booking, { onConflict: "hotel_id,pms_booking_id" })
              if (singleErr) throw singleErr
              recordsInserted++
            } catch (singleError) {
              recordsFailed++
              captureFailure(booking?.pms_booking_id, singleError)
              console.error("[v0] ETL: Single booking error:", booking.pms_booking_id, singleError)
            }
          }
        }
      }

      if (recordsFailed > 0 && !errorMessage) {
        errorMessage = `${recordsFailed} record(s) failed. Samples: ${failureSamples.slice(0, 3).join(" || ")}`.slice(0, 1500)
      }

      // ----------------------------------------------------------------------
      // FAN-OUT NOTIFICHE (opt-in via notification_preferences)
      // Classifichiamo ogni record `toUpsert` confrontandolo con lo stato
      // pre-batch caricato in `existingByPmsId`:
      //   - non esisteva  -> "new_booking"  (e non e' subito cancellata)
      //   - esisteva non cancellata e ora is_cancelled=true -> "booking_cancelled"
      // Le notifiche sono OPT-IN: utenti senza riga / con popup=false non
      // ricevono nulla. dedup_key per-utente garantisce idempotenza anche
      // se l'ETL gira piu' volte sullo stesso pms_booking_id.
      try {
        const newOnes: any[] = []
        const cancelledOnes: any[] = []
        for (const b of toUpsert) {
          const pid = b?.pms_booking_id ? String(b.pms_booking_id) : null
          if (!pid) continue
          const prev = existingByPmsId.get(pid)
          if (!prev) {
            // Nuova entry. Se nasce gia' cancellata la trattiamo come cancellazione.
            if (b?.is_cancelled === true) cancelledOnes.push(b)
            else newOnes.push(b)
          } else if (prev.is_cancelled === false && b?.is_cancelled === true) {
            cancelledOnes.push(b)
          }
        }

        const formatDate = (d: string | null | undefined) => {
          if (!d) return ""
          // Aspettiamo YYYY-MM-DD o ISO
          const onlyDate = String(d).slice(0, 10)
          const parts = onlyDate.split("-")
          if (parts.length !== 3) return onlyDate
          return `${parts[2]}/${parts[1]}/${parts[0]}`
        }
        const guestLabel = (b: any) =>
          (b?.guest_name && String(b.guest_name).trim()) || "Ospite"
        const stayLabel = (b: any) => {
          const ci = formatDate(b?.check_in_date)
          const co = formatDate(b?.check_out_date)
          if (ci && co) return `${ci} → ${co}`
          if (ci) return `dal ${ci}`
          return ""
        }
        const channelLabel = (b: any) => {
          const ch = b?.channel ? String(b.channel).trim() : ""
          return ch ? ` · ${ch}` : ""
        }

        const NOTIFY_HARD_LIMIT = 50 // anti-flood su backfill massivi
        const toNotifyNew = newOnes.slice(0, NOTIFY_HARD_LIMIT)
        const toNotifyCx = cancelledOnes.slice(0, NOTIFY_HARD_LIMIT)

        for (const b of toNotifyNew) {
          const stay = stayLabel(b)
          await notifyHotelUsersByPreference({
            hotelId: this.hotelId,
            preferenceKey: "new_bookings",
            type: "new_booking",
            title: `Nuova prenotazione · ${guestLabel(b)}`,
            body: stay ? `${stay}${channelLabel(b)}` : channelLabel(b).replace(/^\s·\s/, ""),
            actionUrl: "/dati/bookings",
            dedupKeyBase: `new_booking:${this.hotelId}:${b.pms_booking_id}`,
          })
        }

        for (const b of toNotifyCx) {
          const stay = stayLabel(b)
          await notifyHotelUsersByPreference({
            hotelId: this.hotelId,
            preferenceKey: "cancellations",
            type: "booking_cancelled",
            title: `Cancellazione · ${guestLabel(b)}`,
            body: stay ? `${stay}${channelLabel(b)}` : channelLabel(b).replace(/^\s·\s/, ""),
            actionUrl: "/dati/bookings",
            dedupKeyBase: `booking_cancelled:${this.hotelId}:${b.pms_booking_id}`,
          })
        }

        if (newOnes.length > NOTIFY_HARD_LIMIT || cancelledOnes.length > NOTIFY_HARD_LIMIT) {
          console.log(
            `[v0] ETL: notifiche limitate a ${NOTIFY_HARD_LIMIT} su questo run (new=${newOnes.length}, cancelled=${cancelledOnes.length}) per evitare flood`,
          )
        } else {
          console.log(
            `[v0] ETL: notifiche fan-out -> new=${newOnes.length}, cancelled=${cancelledOnes.length}`,
          )
        }
      } catch (notifyErr) {
        // Non bloccare l'ETL per problemi di notifica
        console.error("[v0] ETL: bookings notification fan-out failed (non-fatal):", notifyErr)
      }

      // Batch mark all as processed (chunks of 500)
      const allProcessedIds = [...processedIds, ...failedIds]
      for (let i = 0; i < allProcessedIds.length; i += 500) {
        const chunk = allProcessedIds.slice(i, i + 500)
        await supabase
          .from("scidoo_raw_bookings")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .in("id", chunk)
      }

      // Reconciliation step: allinea is_cancelled per i raw "annullata" che potrebbero
      // essere stati saltati in passate precedenti (phantom bookings).
      // Necessario perché un booking cancellato in Scidoo deve riflettersi su
      // bookings.is_cancelled per non gonfiare le metriche (es. box Movimenti Oggi).
      try {
        const { data: cancelledRaw } = await supabase
          .from("scidoo_raw_bookings")
          .select("scidoo_booking_id, cancellation_date")
          .eq("hotel_id", this.hotelId)
          .eq("status", "annullata")
        const cancelledIds = (cancelledRaw || [])
          .map((r) => r.scidoo_booking_id)
          .filter((id): id is string => Boolean(id))
        if (cancelledIds.length > 0) {
          // Aggiorna a chunks per evitare URL troppo lunghe nel filter .in()
          const RECONCILE_CHUNK = 200
          let reconciled = 0
          for (let i = 0; i < cancelledIds.length; i += RECONCILE_CHUNK) {
            const chunk = cancelledIds.slice(i, i + RECONCILE_CHUNK)
            const { count } = await supabase
              .from("bookings")
              .update({
                is_cancelled: true,
                updated_at: new Date().toISOString(),
              }, { count: "exact" })
              .eq("hotel_id", this.hotelId)
              .eq("is_cancelled", false)
              .in("pms_booking_id", chunk)
            reconciled += count || 0
          }
          if (reconciled > 0) {
            console.log(`[v0] ETL: Reconciliation - phantom cancelled bookings allineati: ${reconciled}`)
          }
        }
      } catch (reconErr) {
        console.error("[v0] ETL: Reconciliation step failed (non-fatal):", reconErr)
      }

      console.log("[v0] ETL: Bookings processing complete", {
        processed: recordsProcessed,
        inserted: recordsInserted,
        updated: recordsUpdated,
        failed: recordsFailed,
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] ETL: Bookings processor error:", errorMessage)
    }

    return {
      success: recordsFailed === 0 && !errorMessage,
      records_processed: recordsProcessed,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_skipped: recordsSkipped,
      records_failed: recordsFailed,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    }
  }
}
