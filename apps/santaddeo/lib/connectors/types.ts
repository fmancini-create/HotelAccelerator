// Type definitions for PMS connectors

export interface PMSConfig {
  pms_name: string
  api_key: string
  endpoint_url: string
  property_id?: string
  config?: Record<string, unknown>
}

export interface SyncResult {
  success: boolean
  records_fetched: number
  records_inserted: number
  records_updated: number
  records_failed: number
  error_message?: string
  duration_ms: number
}

export interface ScidooConfig extends PMSConfig {
  pms_name: "scidoo"
  property_id: string
}

export interface ScidooBooking {
  id: string
  reservation_number: string
  booking_date: string
  checkin_date: string
  checkout_date: string
  status: string
  guest_name?: string
  guest_email?: string
  guest_phone?: string
  room_type_id?: string
  total_price?: number
  channel?: string
  [key: string]: unknown
}

export interface ScidooAvailability {
  room_type_id: string
  date: string
  rooms_available: number
  [key: string]: unknown
}

export interface ScidooRate {
  rate_id: string
  room_type_id: string
  date: string
  price: number
  [key: string]: unknown
}

export interface ScidooFiscalProduction {
  date: string
  total_revenue: number
  [key: string]: unknown
}

export interface ScidooRoomType {
  id: number
  name: string
  description?: string
  size?: number
  capacity: number
  capacity_default: number
  additional_beds: number
  rooms: number
  active_flag: boolean
  [key: string]: unknown
}

export interface ScidooMinStay {
  room_type_id: number
  rate_id: number | string // 0 means global
  date: string
  minstay: number
  cta: boolean // Close to arrival
  ctd: boolean // Close to departure
  [key: string]: unknown
}
