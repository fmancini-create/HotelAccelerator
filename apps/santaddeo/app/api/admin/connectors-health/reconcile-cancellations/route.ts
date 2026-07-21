/**
 * POST /api/admin/connectors-health/reconcile-cancellations
 *
 * Riallinea retroattivamente `bookings.is_cancelled` allo `status` del
 * corrispondente `scidoo_raw_bookings`.
 *
 * Perché serve: il fix #1 (PR `fix(scidoo): remove broken reactivation
 * detection`) corregge la regola SOLO per le prenotazioni rifluite dal
 * sync DOPO il deploy. Le prenotazioni cancellate da tempo non vengono
 * più ri-scaricate da Scidoo, quindi i loro record in `bookings`
 * restano col valore vecchio sbagliato a vita. Questo endpoint chiude
 * il gap.
 *
 * Sicurezza:
 *  - super_admin only
 *  - dry-run di default: ritorna SOLO i conteggi senza scrivere nulla
 *  - per applicare: body { apply: true } esplicito
 *  - per restringere a un hotel: body { hotel_id: "..." } o ?hotel_id=...
 *
 * Risposta (sia dry-run che apply): per ogni hotel
 *  - to_activate:    bookings is_cancelled=true ma raw status≠'annullata'
 *  - to_cancel:      bookings is_cancelled=false ma raw status='annullata'
 *  - applied_activate / applied_cancel: solo in modalità apply
 *  - errors: eventuali errori per chunk
 */
import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// Reconciliation è più pesante del diagnose: 4 hotel × ~40k righe + UPDATE batch
export const maxDuration = 120

const PAGE_SIZE = 1000
const UPDATE_CHUNK = 200

interface RawIdRow {
  scidoo_booking_id: string
  status: string | null
}
interface BookingIdRow {
  id: string
  pms_booking_id: string
  is_cancelled: boolean
}

interface HotelReconcile {
  hotel_id: string
  hotel_name: string
  scanned_raw: number
  scanned_bookings: number
  to_activate: number // bookings is_cancelled=true ma raw status≠'annullata'
  to_cancel: number // bookings is_cancelled=false ma raw status='annullata'
  applied_activate?: number
  applied_cancel?: number
  errors?: string[]
  durationMs: number
}

async function fetchAllPaged<T>(
  fetcher: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (let i = 0; i < 100; i++) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await fetcher(from, to)
    if (error) throw new Error(`Pagination error: ${JSON.stringify(error)}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

interface HotelReconcileExtended extends HotelReconcile {
  /** Campioni delle prime 5 prenotazioni che dovevano essere aggiornate.
   * Utile per investigare se l'UPDATE non sta persistendo: dopo apply
   * possiamo confrontare lo stato pre e post, se uguale c'e' un problema
   * (RLS, trigger, ecc.).
   * Chiave `pms_ref` per allinearsi al guard UI (vedi page.tsx).
   */
  samples_to_cancel?: Array<{ booking_id: string; pms_ref: string }>
  samples_to_activate?: Array<{ booking_id: string; pms_ref: string }>
  /** Verifica post-update: ricarico gli stessi id e controllo se is_cancelled
   * e' stato effettivamente modificato. Smoking gun per RLS/trigger issues.
   */
  verify_after_update?: {
    cancel_persisted: number
    cancel_not_persisted: number
    activate_persisted: number
    activate_not_persisted: number
  }
}

async function reconcileHotel(
  supabase: ReturnType<typeof createServiceClient>,
  hotel: { id: string; name: string },
  apply: boolean,
): Promise<HotelReconcileExtended> {
  const start = Date.now()

  // Pull degli ID raw (scidoo_booking_id + status) e dei bookings (id, pms_booking_id, is_cancelled)
  const [rawRows, bookingRows] = await Promise.all([
    fetchAllPaged<RawIdRow>((from, to) =>
      supabase
        .from("scidoo_raw_bookings")
        .select("scidoo_booking_id, status")
        .eq("hotel_id", hotel.id)
        .range(from, to),
    ),
    fetchAllPaged<BookingIdRow>((from, to) =>
      supabase
        .from("bookings")
        .select("id, pms_booking_id, is_cancelled")
        .eq("hotel_id", hotel.id)
        .eq("source", "scidoo")
        .range(from, to),
    ),
  ])

  // Indicizzo i raw per scidoo_booking_id → status
  const rawById = new Map<string, RawIdRow>()
  for (const r of rawRows) {
    if (r.scidoo_booking_id) rawById.set(r.scidoo_booking_id, r)
  }

  // Mappa pms_booking_id <-> bookings.id per i sample
  const pmsByBookingId = new Map<string, string>()

  // Identifico i bookings da aggiornare
  const toActivate: string[] = [] // bookings.id da settare is_cancelled=false
  const toCancel: string[] = [] // bookings.id da settare is_cancelled=true

  for (const b of bookingRows) {
    const r = rawById.get(b.pms_booking_id)
    if (!r) continue // rms orphan: non possiamo decidere senza raw
    const rawIsCancelled = (r.status || "").toLowerCase() === "annullata"
    if (rawIsCancelled && !b.is_cancelled) {
      toCancel.push(b.id)
      pmsByBookingId.set(b.id, b.pms_booking_id)
    } else if (!rawIsCancelled && b.is_cancelled) {
      toActivate.push(b.id)
      pmsByBookingId.set(b.id, b.pms_booking_id)
    }
  }

  const result: HotelReconcileExtended = {
    hotel_id: hotel.id,
    hotel_name: hotel.name,
    scanned_raw: rawRows.length,
    scanned_bookings: bookingRows.length,
    to_activate: toActivate.length,
    to_cancel: toCancel.length,
    durationMs: 0,
  }

  // Sample: prime 5 prenotazioni di ciascun gruppo, utile in dry-run per
  // capire CHI verra' aggiornato (booking_id + pms_booking_id).
  if (toCancel.length > 0) {
    result.samples_to_cancel = toCancel.slice(0, 5).map((id) => ({
      booking_id: id,
      pms_ref: pmsByBookingId.get(id) || "?",
    }))
  }
  if (toActivate.length > 0) {
    result.samples_to_activate = toActivate.slice(0, 5).map((id) => ({
      booking_id: id,
      pms_ref: pmsByBookingId.get(id) || "?",
    }))
  }

  if (!apply) {
    result.durationMs = Date.now() - start
    return result
  }

  // ─── Apply: UPDATE in chunk ──────────────────────────────────────────────
  const errors: string[] = []
  let appliedActivate = 0
  let appliedCancel = 0

  const chunks = (ids: string[]): string[][] => {
    const out: string[][] = []
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK) out.push(ids.slice(i, i + UPDATE_CHUNK))
    return out
  }

  // FIX 30/04/2026: log diagnostico per capire perche' la persistenza non
  // sembra funzionare in produzione. Se appliedX > 0 ma il count del DB
  // resta invariato, e' RLS / trigger.
  console.log(
    `[v0] reconcile-cancellations APPLY ${hotel.name}: toActivate=${toActivate.length} toCancel=${toCancel.length}`,
  )

  for (const chunk of chunks(toActivate)) {
    const { error, count } = await supabase
      .from("bookings")
      .update({ is_cancelled: false, updated_at: new Date().toISOString() }, { count: "exact" })
      .in("id", chunk)
    if (error) {
      errors.push(`activate chunk: ${error.message}`)
      console.error(`[v0] reconcile activate chunk error ${hotel.name}:`, error)
    } else {
      // FIX 30/04/2026: prima si faceva `count ?? chunk.length` come
      // fallback ottimistico, mascherando casi in cui il DB ritornava 0.
      // Ora usiamo SOLO il count reale del DB. Se 0, l'UPDATE non e' andato
      // a buon fine (probabile RLS/trigger) e l'utente lo vede subito.
      appliedActivate += count ?? 0
      console.log(
        `[v0] reconcile activate ${hotel.name}: chunk ${chunk.length} → count=${count}`,
      )
    }
  }
  for (const chunk of chunks(toCancel)) {
    const { error, count } = await supabase
      .from("bookings")
      .update({ is_cancelled: true, updated_at: new Date().toISOString() }, { count: "exact" })
      .in("id", chunk)
    if (error) {
      errors.push(`cancel chunk: ${error.message}`)
      console.error(`[v0] reconcile cancel chunk error ${hotel.name}:`, error)
    } else {
      appliedCancel += count ?? 0
      console.log(
        `[v0] reconcile cancel ${hotel.name}: chunk ${chunk.length} → count=${count}`,
      )
    }
  }

  // ─── Verify: ricarico subito gli stessi id e controllo se la modifica
  //     e' davvero persistita. Se persisted=0 ma applied>0, e' RLS.
  if (toActivate.length > 0 || toCancel.length > 0) {
    let cancelPersisted = 0
    let cancelNotPersisted = 0
    let activatePersisted = 0
    let activateNotPersisted = 0
    const verifyChunks = (ids: string[]): string[][] => {
      const out: string[][] = []
      for (let i = 0; i < ids.length; i += UPDATE_CHUNK) out.push(ids.slice(i, i + UPDATE_CHUNK))
      return out
    }
    for (const chunk of verifyChunks(toCancel)) {
      const { data: rows } = await supabase
        .from("bookings")
        .select("id, is_cancelled")
        .in("id", chunk)
      for (const row of (rows || []) as { id: string; is_cancelled: boolean }[]) {
        if (row.is_cancelled === true) cancelPersisted++
        else cancelNotPersisted++
      }
    }
    for (const chunk of verifyChunks(toActivate)) {
      const { data: rows } = await supabase
        .from("bookings")
        .select("id, is_cancelled")
        .in("id", chunk)
      for (const row of (rows || []) as { id: string; is_cancelled: boolean }[]) {
        if (row.is_cancelled === false) activatePersisted++
        else activateNotPersisted++
      }
    }
    result.verify_after_update = {
      cancel_persisted: cancelPersisted,
      cancel_not_persisted: cancelNotPersisted,
      activate_persisted: activatePersisted,
      activate_not_persisted: activateNotPersisted,
    }
    console.log(
      `[v0] reconcile VERIFY ${hotel.name}: cancel ${cancelPersisted}/${toCancel.length} persisted, activate ${activatePersisted}/${toActivate.length} persisted`,
    )
  }

  result.applied_activate = appliedActivate
  result.applied_cancel = appliedCancel
  if (errors.length > 0) result.errors = errors
  result.durationMs = Date.now() - start
  return result
}

export async function POST(request: Request) {
  // Auth: super_admin only
  const { user, supabase: authClient } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { data: profile } = await authClient.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // Body parsing (tollerante: anche query params)
  let body: { apply?: boolean; hotel_id?: string } = {}
  try {
    body = (await request.json()) || {}
  } catch {
    // ignore: body opzionale
  }
  const url = new URL(request.url)
  const apply = body.apply === true
  const onlyHotel = body.hotel_id || url.searchParams.get("hotel_id") || null

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } },
  )

  const { data: integrations, error: integErr } = await supabase
    .from("pms_integrations")
    .select("hotel_id, hotels(id, name)")
    .eq("pms_name", "scidoo")
  if (integErr) {
    return NextResponse.json({ error: "integrations_query_failed", detail: integErr.message }, { status: 500 })
  }

  const hotels = (integrations || [])
    .map((row: { hotel_id: string; hotels: { id: string; name: string } | null }) => ({
      id: row.hotels?.id || row.hotel_id,
      name: row.hotels?.name || "Hotel sconosciuto",
    }))
    .filter((h) => (onlyHotel ? h.id === onlyHotel : true))

  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  // Sequenziale: gli UPDATE chunk sono già paralleli internamente al chunk;
  // evitiamo di sovraccaricare il DB con 4 hotel in parallelo che fanno UPDATE.
  const results: HotelReconcileExtended[] = []
  for (const h of hotels) {
    results.push(await reconcileHotel(supabase, h, apply))
  }
  results.sort((a, b) => a.hotel_name.localeCompare(b.hotel_name))

  // Audit minimale via console (visibile nei logs Vercel)
  if (apply) {
    const totalApplied = results.reduce(
      (acc, r) => acc + (r.applied_activate ?? 0) + (r.applied_cancel ?? 0),
      0,
    )
    const totalErrors = results.reduce((acc, r) => acc + (r.errors?.length ?? 0), 0)
    console.log("[v0] reconcile-cancellations applied:", {
      triggered_by: user.id,
      only_hotel: onlyHotel,
      totalApplied,
      totalErrors,
      perHotel: results.map((r) => ({
        hotel: r.hotel_name,
        applied_activate: r.applied_activate,
        applied_cancel: r.applied_cancel,
        errors: r.errors?.length ?? 0,
      })),
    })
  }

  return NextResponse.json({
    ok: true,
    apply,
    computedAt: startedAt,
    totalDurationMs: Date.now() - t0,
    hotels: results,
  })
}
