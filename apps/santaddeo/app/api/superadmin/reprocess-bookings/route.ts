import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { PMSImportService } from "@/lib/services/pms-import-service"
import type { PMSBookingImport } from "@/lib/types/database"

/**
 * Reprocess all existing raw bookings from public.scidoo_raw_bookings
 * into public.bookings via PMSImportService.
 * This fixes the historical data gap where raw bookings were stored
 * but never converted to the final bookings table.
 */
export async function POST() {
  try {
    const supabase = await createServiceRoleClient()

    // Get all active hotels
    const { data: hotels, error: hotelsError } = await supabase
      .from("hotels")
      .select("id, name")
      .eq("is_active", true)

    if (hotelsError) {
      return NextResponse.json({ error: hotelsError.message }, { status: 500 })
    }

    const results = []

    for (const hotel of hotels || []) {
      console.log(`[v0] Reprocessing raw bookings for ${hotel.name} (${hotel.id})`)

      // Read ALL raw bookings for this hotel (paginated -- Supabase caps at 1000)
      const PAGE_SIZE = 1000
      let allRawBookings: any[] = []
      let page = 0
      let hasMore = true

      while (hasMore) {
        const { data: pageData, error: rawError } = await supabase
          .from("scidoo_raw_bookings")
          .select("*")
          .eq("hotel_id", hotel.id)
          .order("created_at", { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (rawError) {
          console.error(`[v0] Error reading raw bookings for ${hotel.name}:`, rawError)
          results.push({ hotel: hotel.name, error: rawError.message })
          hasMore = false
          break
        }

        if (pageData && pageData.length > 0) {
          allRawBookings = allRawBookings.concat(pageData)
          hasMore = pageData.length === PAGE_SIZE
          page++
        } else {
          hasMore = false
        }
      }

      const rawBookings = allRawBookings

      if (rawBookings.length === 0) {
        console.log(`[v0] No raw bookings found for ${hotel.name}`)
        results.push({ hotel: hotel.name, raw_count: 0, imported: 0, errors: 0 })
        continue
      }

      console.log(`[v0] Found ${rawBookings.length} raw bookings for ${hotel.name} (${page} pages)`)

      // Safely extract date-only (YYYY-MM-DD) from various formats
      const toDateStr = (d: string | null | undefined): string => {
        if (!d) return new Date().toISOString().split("T")[0]
        return String(d).split("T")[0].split(" ")[0]
      }

      // Convert raw bookings to PMSBookingImport format
      const pmsBookings: PMSBookingImport[] = rawBookings.map((raw) => {
        const isCancelled = raw.status === "annullata" || raw.status === "eliminata" || raw.status === "cancelled"

        // Calculate number of nights from checkin/checkout
        const checkinDate = new Date(toDateStr(raw.checkin_date))
        const checkoutDate = new Date(toDateStr(raw.checkout_date))
        const nights = Math.max(1, Math.round((checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)))

        const totalPrice = Number(raw.total_amount) || 0
        const pricePerNight = nights > 0 ? totalPrice / nights : 0

        // Build guest name from first + last
        const firstName = raw.customer_first_name || ""
        const lastName = raw.customer_last_name || ""
        const guestName = `${firstName} ${lastName}`.trim() || "N/A"

        return {
          pms_booking_id: raw.pms_booking_id || raw.id,
          pms_reservation_number: raw.pms_booking_id || undefined,
          booking_date: toDateStr(raw.booking_date || raw.created_at),
          check_in_date: toDateStr(raw.checkin_date),
          check_out_date: toDateStr(raw.checkout_date),
          room_type_code: String(raw.room_type_code || "0"),
          is_cancelled: isCancelled,
          cancellation_date: isCancelled ? toDateStr(raw.cancellation_date) : undefined,
          cancellation_reason: undefined,
          guest_name: guestName,
          guest_email: raw.customer_email || undefined,
          guest_phone: raw.customer_phone || undefined,
          guest_country: raw.customer_country || undefined,
          number_of_rooms: raw.room_count || 1,
          number_of_nights: nights,
          number_of_guests: raw.guests_count || raw.adults_count || 1,
          price_per_night: pricePerNight,
          total_price: totalPrice,
          channel: raw.channel || "direct",
          is_direct: !raw.channel || raw.channel === "direct" || raw.channel === "website",
          commission_rate: undefined,
        }
      })

      // Import via PMSImportService (which handles upsert + room type mapping)
      const result = await PMSImportService.importBookings(hotel.id, pmsBookings)

      console.log(`[v0] ${hotel.name}: imported ${result.success}/${rawBookings.length}, errors: ${result.errors.length}`)

      // Mark successfully processed raw bookings
      if (result.success > 0) {
        await supabase
          .from("scidoo_raw_bookings")
          .update({ processed: true })
          .eq("hotel_id", hotel.id)
      }

      results.push({
        hotel: hotel.name,
        raw_count: rawBookings.length,
        imported: result.success,
        errors: result.errors.length,
        sample_errors: result.errors.slice(0, 5),
      })
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error("[v0] Reprocess error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
