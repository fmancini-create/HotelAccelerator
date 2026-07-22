/**
 * RMS Canonical Types
 *
 * REGOLE ARCHITETTURALI:
 * 1. Il codice applicativo (dashboard, report, KPI) legge SOLO da tabelle/interfacce CANONICHE rms_*
 * 2. Mai query dirette su scidoo_raw_* o tabelle PMS specifiche dalla UI
 * 3. I connector PMS normalizzano i dati e scrivono SEMPRE su tabelle canoniche
 * 4. Se manca un campo PMS, il connector imposta default sensati (null), non fa crashare la UI
 */

// Booking normalizzato - usato dalla dashboard
export interface BookingCanonical {
  id: string
  hotel_id: string
  booking_id: string // ID originale del PMS
  check_in: string // YYYY-MM-DD
  check_out: string // YYYY-MM-DD
  total_amount: number
  guest_name: string | null
  guest_email: string | null
  channel: string | null
  status: string
  num_guests: number
  room_type_id: string | null // ID interno RMS
  notes: string | null
  is_cancelled: boolean
  cancellation_date: string | null
  created_at: string
  updated_at: string
}

// Room Type normalizzato
export interface RoomTypeCanonical {
  id: string
  hotel_id: string
  name: string
  code: string // Codice interno RMS
  pms_code: string | null // Codice del PMS (per mapping)
  total_rooms: number
  capacity: number
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

// Availability normalizzata
export interface AvailabilityCanonical {
  id: string
  hotel_id: string
  room_type_id: string
  date: string // YYYY-MM-DD
  total_rooms: number
  rooms_available: number
  rooms_sold: number
  rooms_out_of_service: number
  created_at: string
  updated_at: string
}

// Rate normalizzata
export interface RateCanonical {
  id: string
  hotel_id: string
  room_type_id: string
  date: string // YYYY-MM-DD
  rate_amount: number
  rate_type: string // "bar", "ota", etc.
  min_stay: number
  created_at: string
  updated_at: string
}

// Guest normalizzato
export interface GuestCanonical {
  id: string
  hotel_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  nationality: string | null
  created_at: string
  updated_at: string
}

// Helper per validare che una query NON usi tabelle PMS
export function assertNoPmsTables(sqlOrTableName: string): void {
  const pmsPatterns = [
    /scidoo_raw_/i,
    /bookings_full/i, // View legacy
    /\bpms_raw_/i,
  ]

  for (const pattern of pmsPatterns) {
    if (pattern.test(sqlOrTableName)) {
      console.warn(`[RMS] WARNING: Query contains PMS-specific table: ${sqlOrTableName}`)
      // In dev, could throw: throw new Error(`Query non permessa: contiene tabella PMS (${sqlOrTableName})`)
    }
  }
}
