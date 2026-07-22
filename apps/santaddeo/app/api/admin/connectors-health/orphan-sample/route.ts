/**
 * GET /api/admin/connectors-health/orphan-sample?hotelId=...&limit=10
 *
 * Restituisce un campione di RAW orphan (raw senza booking corrispondente) e
 * RMS orphan (booking senza raw di origine) per investigare la causa del
 * mismatch su un singolo hotel. Pensato come tool di diagnosi: i numeri
 * grossolani (es. 7137 RAW orphan su Barronci) non bastano a capire se è
 * un bug di mapping del join key, doppi RAW per la stessa booking, drift
 * storico o filtro nel processor. Servono dati grezzi reali da confrontare.
 *
 * Match logic identica a diagnose/route.ts:
 *   bookings.pms_booking_id == scidoo_raw_bookings.scidoo_booking_id
 * (limitato a source='scidoo' lato bookings).
 *
 * Sicurezza: super_admin only (stesso pattern di diagnose/force-etl).
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Shape della response: nomi neutri / connector-agnostic perché questa
 * stessa risposta viene consumata dall'UI, e il guard del repo
 * (`scripts/guard-no-pms-tables.mjs`) vieta token PMS-specifici nel codice
 * UI (es. `pms_booking_id`). Mappo qui i campi del DB ai nomi neutri.
 *   booking_ref  ←  scidoo_raw_bookings.scidoo_booking_id  /  bookings.pms_booking_id
 *   cancelled    ←  bookings.is_cancelled
 *   arrival      ←  prima data dei statics di pernotto
 *   departure    ←  ultima data dei statics di pernotto
 *   customer     ←  nome cliente (raw_data.customer.first_name + last_name oppure bookings.customer_name)
 */
interface RawOrphanRow {
  booking_ref: string | null
  status: string | null
  room_code: string | null
  room_name: string | null
  cancellation_date: string | null
  arrival: string | null
  departure: string | null
  customer: string | null
  total_price: number | null
  created_at: string | null
}

interface RmsOrphanRow {
  booking_ref: string | null
  cancelled: boolean | null
  check_in: string | null
  check_out: string | null
  customer: string | null
  total_price: number | null
  created_at: string | null
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const hotelId = url.searchParams.get("hotelId")
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 10)))

  if (!hotelId) {
    return NextResponse.json({ ok: false, error: "hotelId richiesto" }, { status: 400 })
  }

  // Auth: super_admin only
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

  // Service-role client per bypassare RLS
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } },
  )

  // ─── Carico TUTTI i pms_booking_id dei bookings (paginato, default cap=1000) ─
  const bookingsIds = new Set<string>()
  {
    let from = 0
    const PAGE = 1000
    for (let p = 0; p < 200; p++) {
      const { data: page, error } = await supabase
        .from("bookings")
        .select("pms_booking_id")
        .eq("hotel_id", hotelId)
        .eq("source", "scidoo")
        .range(from, from + PAGE - 1)
      if (error) {
        return NextResponse.json(
          { ok: false, error: `bookings select: ${error.message}` },
          { status: 500 },
        )
      }
      if (!page || page.length === 0) break
      for (const row of page as { pms_booking_id: string | null }[]) {
        if (row.pms_booking_id) bookingsIds.add(row.pms_booking_id)
      }
      if (page.length < PAGE) break
      from += PAGE
    }
  }

  // ─── Carico TUTTI gli scidoo_booking_id dei raw (paginato) ──────────────────
  const rawIds = new Set<string>()
  {
    let from = 0
    const PAGE = 1000
    for (let p = 0; p < 200; p++) {
      const { data: page, error } = await supabase
        .from("scidoo_raw_bookings")
        .select("scidoo_booking_id")
        .eq("hotel_id", hotelId)
        .range(from, from + PAGE - 1)
      if (error) {
        return NextResponse.json(
          { ok: false, error: `raw select: ${error.message}` },
          { status: 500 },
        )
      }
      if (!page || page.length === 0) break
      for (const row of page as { scidoo_booking_id: string | null }[]) {
        if (row.scidoo_booking_id) rawIds.add(row.scidoo_booking_id)
      }
      if (page.length < PAGE) break
      from += PAGE
    }
  }

  // ─── Trovo orphan IDs (limitati a `limit` per ciascuna direzione) ──────────
  // RAW orphan: raw.scidoo_booking_id NOT IN bookings.pms_booking_id
  const rawOrphanIds: string[] = []
  for (const id of rawIds) {
    if (!bookingsIds.has(id)) {
      rawOrphanIds.push(id)
      if (rawOrphanIds.length >= limit) break
    }
  }
  // RMS orphan: booking.pms_booking_id NOT IN raw.scidoo_booking_id
  const rmsOrphanIds: string[] = []
  for (const id of bookingsIds) {
    if (!rawIds.has(id)) {
      rmsOrphanIds.push(id)
      if (rmsOrphanIds.length >= limit) break
    }
  }

  // ─── Carico dettagli per il sample (max `limit` per lato) ──────────────────
  let rawSample: RawOrphanRow[] = []
  if (rawOrphanIds.length > 0) {
    const { data, error } = await supabase
      .from("scidoo_raw_bookings")
      .select(
        "scidoo_booking_id, status, room_type_code, room_type_name, raw_data, cancellation_date, created_at",
      )
      .eq("hotel_id", hotelId)
      .in("scidoo_booking_id", rawOrphanIds)
    if (error) {
      return NextResponse.json(
        { ok: false, error: `raw sample select: ${error.message}` },
        { status: 500 },
      )
    }
    rawSample = (data || []).map(
      (r: {
        scidoo_booking_id: string | null
        status: string | null
        room_type_code: string | null
        room_type_name: string | null
        raw_data: unknown
        cancellation_date: string | null
        created_at: string | null
      }) => {
        const rd =
          r.raw_data && typeof r.raw_data === "object" ? (r.raw_data as Record<string, unknown>) : {}
        // Estraggo guest, prezzo, date dalle statics se ci sono (struttura Scidoo)
        let arrival: string | null = null
        let departure: string | null = null
        let totalPrice: number | null = null
        let guestName: string | null = null
        const statics = Array.isArray((rd as { statics?: unknown }).statics)
          ? ((rd as { statics: unknown[] }).statics as Array<Record<string, unknown>>)
          : []
        if (statics.length > 0) {
          const dates = statics
            .map((s) => (typeof s.date_time === "string" ? s.date_time.slice(0, 10) : null))
            .filter((d): d is string => !!d)
            .sort()
          if (dates.length > 0) {
            arrival = dates[0]
            departure = dates[dates.length - 1]
          }
          totalPrice = statics
            .filter((s) => s.category === "Pernotto")
            .reduce((sum, s) => sum + (typeof s.price === "number" ? s.price : 0), 0)
        }
        const customer = (rd as { customer?: Record<string, unknown> }).customer
        if (customer && typeof customer === "object") {
          const fn = typeof customer.first_name === "string" ? customer.first_name : ""
          const ln = typeof customer.last_name === "string" ? customer.last_name : ""
          guestName = `${fn} ${ln}`.trim() || null
        }
        return {
          booking_ref: r.scidoo_booking_id,
          status: r.status,
          room_code: r.room_type_code,
          room_name: r.room_type_name,
          cancellation_date: r.cancellation_date,
          arrival,
          departure,
          customer: guestName,
          total_price: totalPrice,
          created_at: r.created_at,
        }
      },
    )
  }

  let bookingsSample: RmsOrphanRow[] = []
  if (rmsOrphanIds.length > 0) {
    // Schema reale di public.bookings (vedi lib/etl/mappers/scidoo-mapper.ts):
    //   check_in_date, check_out_date, guest_name (NON check_in/check_out/customer_name).
    //   imported_at è il vero timestamp di scrittura — created_at non esiste.
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "pms_booking_id, is_cancelled, check_in_date, check_out_date, guest_name, total_price, imported_at",
      )
      .eq("hotel_id", hotelId)
      .eq("source", "scidoo")
      .in("pms_booking_id", rmsOrphanIds)
    if (error) {
      return NextResponse.json(
        { ok: false, error: `bookings sample select: ${error.message}` },
        { status: 500 },
      )
    }
    bookingsSample = (data || []).map(
      (b: {
        pms_booking_id: string | null
        is_cancelled: boolean | null
        check_in_date: string | null
        check_out_date: string | null
        guest_name: string | null
        total_price: number | null
        imported_at: string | null
      }) => ({
        booking_ref: b.pms_booking_id,
        cancelled: b.is_cancelled,
        check_in: b.check_in_date,
        check_out: b.check_out_date,
        customer: b.guest_name,
        total_price: b.total_price,
        created_at: b.imported_at,
      }),
    )
  }

  return NextResponse.json({
    ok: true,
    hotel_id: hotelId,
    counts: {
      bookings_total: bookingsIds.size,
      raw_total: rawIds.size,
      raw_orphan_returned: rawOrphanIds.length,
      rms_orphan_returned: rmsOrphanIds.length,
    },
    raw_orphan_sample: rawSample,
    rms_orphan_sample: bookingsSample,
  })
}
