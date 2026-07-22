import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { type NextRequest, NextResponse } from "next/server"

// Security: uses cookie-based auth client (respects RLS)
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUserOrDev()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)

    const hotelId = searchParams.get("hotelId")
    const page = Number.parseInt(searchParams.get("page") || "0")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "20")
    // Optional: fetch a single booking by its PMS id (used by Guard detail dialog)
    const pmsBookingId = searchParams.get("pmsBookingId")

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    // Step 1: Query bookings (agnostic table)
    let bookingsQuery = supabase
      .from("bookings")
      .select("*", { count: "exact" })
      .eq("hotel_id", hotelId)
      .order("booking_date", { ascending: false })

    if (pmsBookingId) {
      // Single-booking lookup: no pagination, exact match on pms_booking_id.
      bookingsQuery = bookingsQuery.eq("pms_booking_id", pmsBookingId).limit(1)
    } else {
      bookingsQuery = bookingsQuery.range(page * pageSize, (page + 1) * pageSize - 1)
    }

    const { data: bookingsData, count, error } = await bookingsQuery

    if (error) {
      console.error("[API] Error loading bookings:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Step 2: Fetch matching raw bookings by pms_booking_id -> scidoo_booking_id
    const pmsIds = (bookingsData || []).map((b: any) => String(b.pms_booking_id)).filter(Boolean)
    let rawLookup: Record<string, any> = {}

    if (pmsIds.length > 0) {
      const { data: rawRows } = await supabase
        .from("scidoo_raw_bookings")
        .select("scidoo_booking_id, raw_data, customer_first_name, customer_last_name, customer_email, room_type_name, synced_at")
        .eq("hotel_id", hotelId)
        .in("scidoo_booking_id", pmsIds)

      for (const r of rawRows || []) {
        rawLookup[r.scidoo_booking_id] = r
      }
    }

    // Step 3: Merge and transform
    const bookings = (bookingsData || []).map((b: any) => {
      const raw = rawLookup[String(b.pms_booking_id)] || {}
      const rd = raw.raw_data || {}
      return {
        id: b.id,
        booking_code: b.pms_booking_id || b.id,
        checkin_date: b.check_in_date,
        checkout_date: b.check_out_date,
        booking_created_at: b.booking_date,
        cancelled_at: b.cancellation_date,
        synced_at: raw.synced_at || b.updated_at,
        source_data: {
          internal_id: b.pms_booking_id,
          checkin_date: b.check_in_date,
          checkout_date: b.check_out_date,
          status: b.is_cancelled ? "annullata" : "confermata",
          total_price: b.total_price,
          origin_name: b.channel,
          room_type_name: raw.room_type_name || b.room_type || null,
          assigned_room: rd.assigned_room || rd.room || null,
          creation: b.booking_date,
          cancellation: b.cancellation_date ? { date: b.cancellation_date } : null,
          last_modification: rd.last_modification || null,
          customer: {
            first_name: raw.customer_first_name || rd.customer?.first_name || null,
            last_name: raw.customer_last_name || rd.customer?.last_name || null,
            email: raw.customer_email || rd.customer?.email || null,
            phone: rd.customer?.phone || null,
            mobile: rd.customer?.mobile || null,
            address: rd.customer?.address || null,
            city: rd.customer?.city || null,
            postal_code: rd.customer?.postal_code || null,
            citizenship: rd.customer?.citizenship || null,
          },
          guests: rd.guests || [],
          daily_price: rd.daily_price || {},
          payments: rd.payments || [],
          extras: rd.extras || [],
          notes: rd.notes || null,
          nights: rd.nights || b.number_of_nights || null,
          guest_count: rd.guest_count || null,
        },
      }
    })

    return NextResponse.json({ bookings, totalCount: count || 0 })
  } catch (error: any) {
    console.error("[API] Error:", error.message || error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
