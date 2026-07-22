// Google Sheets Data Mapper
// Maps raw GSheet rows to the canonical PMS import format

import type {
  GSheetAvailabilityRow,
  GSheetBookingRow,
  GSheetRateRow,
} from "./client"
import type {
  PMSAvailabilityImport,
  PMSBookingImport,
} from "@/lib/types/database"

/**
 * Normalize date strings from Google Sheets
 * Handles: serial numbers, DD/MM/YYYY, DD/MM/YYYY HH:MM:SS, DD-MM-YYYY, YYYY-MM-DD
 */
function normalizeDate(dateStr: string | number): string {
  if (!dateStr) return ""

  // If it's a number (Google Sheets serial date), convert it
  if (typeof dateStr === "number") {
    const epoch = new Date(1899, 11, 30)
    const date = new Date(epoch.getTime() + dateStr * 86400000)
    return date.toISOString().split("T")[0]
  }

  const str = String(dateStr).trim()
  if (!str) return ""

  // Already in ISO format (with optional time)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split("T")[0]

  // DD/MM/YYYY or DD/MM/YYYY HH:MM:SS (with optional time part)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
    const datePart = str.split(" ")[0]
    const parts = datePart.split("/")
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`
  }

  // DD-MM-YYYY or DD-MM-YYYY HH:MM:SS (dash-separated European format)
  if (/^\d{1,2}-\d{1,2}-\d{4}/.test(str)) {
    const datePart = str.split(" ")[0]
    const parts = datePart.split("-")
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`
  }

  // Try native Date parsing as last resort
  try {
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0]
    }
  } catch { /* ignore */ }

  // Return empty string (falsy) so callers know parsing failed
  return ""
}

/**
 * Parse boolean values from GSheets (could be "SI", "NO", "TRUE", "FALSE", 1, 0)
 */
function parseBool(val: any): boolean {
  if (typeof val === "boolean") return val
  if (typeof val === "number") return val !== 0
  const str = String(val).toLowerCase().trim()
  return ["si", "true", "1", "yes", "vero"].includes(str)
}

/**
 * Parse number, defaulting to 0
 */
function parseNum(val: any): number {
  if (typeof val === "number") return val
  const parsed = Number.parseFloat(String(val).replace(",", "."))
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Map GSheet availability rows to canonical availability imports
 */
export function mapAvailability(rows: GSheetAvailabilityRow[]): PMSAvailabilityImport[] {
  return rows
    .filter((row) => row.data && row.codice_camera)
    .map((row) => ({
      date: normalizeDate(row.data),
      room_type_code: String(row.codice_camera).trim(),
      total_rooms: parseNum(row.camere_totali),
      rooms_out_of_service: parseNum(row.camere_fuori_servizio),
      rooms_available: parseNum(row.camere_disponibili),
    }))
}

/**
 * Map GSheet booking rows to canonical booking imports
 */
export function mapBookings(rows: GSheetBookingRow[]): PMSBookingImport[] {
  return rows
    .filter((row) => row.id_prenotazione && row.check_in)
    .map((row) => {
      const checkIn = normalizeDate(row.check_in)
      const checkOut = normalizeDate(row.check_out)
      const rawBookingDate = normalizeDate(row.data_prenotazione)

      // NEVER silently replace booking_date with check_in_date
      if (!rawBookingDate && row.data_prenotazione) {
        console.warn("[GSheets Mapper] booking_date parse failed, leaving NULL", {
          rawValue: row.data_prenotazione,
          bookingId: row.id_prenotazione,
        })
      }
      // Fallback: NULL (not today, not check_in). DB column is nullable.
      const bookingDate = rawBookingDate || null

      // Calculate nights
      let numNights = parseNum(row.num_notti)
      if (numNights === 0 && checkIn && checkOut) {
        const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime()
        numNights = Math.max(1, Math.round(diff / 86400000))
      }

      const isCancelled = parseBool(row.cancellata)
      const isDirect = parseBool(row.diretto)

      return {
        pms_booking_id: String(row.id_prenotazione).trim(),
        booking_date: bookingDate,
        check_in_date: checkIn,
        check_out_date: checkOut,
        room_type_code: String(row.codice_camera).trim(),
        guest_name: String(row.nome_ospite || "").trim(),
        guest_email: String(row.email_ospite || "").trim() || undefined,
        guest_phone: String(row.telefono_ospite || "").trim() || undefined,
        guest_country: String(row.paese_ospite || "").trim() || undefined,
        number_of_rooms: Math.max(1, parseNum(row.num_camere)),
        number_of_nights: numNights,
        number_of_guests: Math.max(1, parseNum(row.num_ospiti)),
        price_per_night: parseNum(row.prezzo_notte),
        total_price: parseNum(row.prezzo_totale),
        channel: String(row.canale || "direct").trim(),
        is_direct: isDirect,
        commission_rate: parseNum(row.commissione_perc),
        is_cancelled: isCancelled,
        cancellation_date: isCancelled ? normalizeDate(row.data_cancellazione) || undefined : undefined,
        cancellation_reason: isCancelled ? String(row.motivo_cancellazione || "").trim() || undefined : undefined,
      }
    })
}

/**
 * Map GSheet rate rows to a structured format
 */
export interface MappedRate {
  date: string
  room_type_code: string
  rate_name: string
  price: number
  min_stay: number
}

export function mapRates(rows: GSheetRateRow[]): MappedRate[] {
  return rows
    .filter((row) => row.data && row.codice_camera)
    .map((row) => ({
      date: normalizeDate(row.data),
      room_type_code: String(row.codice_camera).trim(),
      rate_name: String(row.nome_tariffa || "Standard").trim(),
      price: parseNum(row.prezzo),
      min_stay: Math.max(1, parseNum(row.soggiorno_minimo)),
    }))
}
