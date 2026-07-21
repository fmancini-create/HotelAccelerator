// ETL Type definitions

export interface ETLJobConfig {
  hotel_id: string
  job_type: "bookings" | "availability" | "rates" | "production" | "fiscal_production" | "full_sync"
  date_from?: string
  date_to?: string
  triggered_by?: string
  triggered_by_user?: string
}

export interface ETLResult {
  success: boolean
  records_processed: number
  records_inserted: number
  records_updated: number
  records_skipped: number
  records_failed: number
  error_message?: string
  duration_ms: number
}

export interface RoomTypeMapping {
  scidoo_room_type_id: string
  santaddeo_room_type_id: string
}
