// SANTADDEO Database Types

export type UserRole = "super_admin" | "consultant" | "property_admin" | "sub_user"

export type OrganizationType = "hotel" | "hotel_group" | "consultant"

export type PMSName =
  | "ericsoft_suite_3"
  | "ericsoft_suite_4"
  | "bedzzle"
  | "hotel_cinquestelle"
  | "room_cloud"
  | "clock_software"
  | "wubook"
  | "hotelappz"
  | "slope"
  | "hoteltime"
  | "roomkeys"
  | "passepartout_welcome"
  | "hotel_2000"
  | "fidelio_suite8"
  | "hotel_2000_evolution"
  | "hotelcube_smart"
  | "leonardo"
  | "nuconga"
  | "cloud_hotel"
  | "scidoo" // Added Scidoo PMS
  | "brig" // BRiG: bridge unico verso 10+ PMS (Bedzzle, Cloudbeds, Mews, Octorate, Opera, Passepartout, ecc.)

export type BookingChannel = "direct" | "ota" | "gds" | "other"

export type BookingStatus = "confirmed" | "cancelled" | "checked_in" | "checked_out" | "no_show"

export type AlertSeverity = "green" | "orange" | "red"

export type AlertMetric = "occupancy_rate" | "revpar" | "revpor" | "cancellation_rate" | "revenue"

export type AlertOperator = "less_than" | "greater_than" | "equals"

export type AcceleratorPlanType = "fixed_fee" | "commission"

export type AlgorithmType = "basic" | "advanced"

export interface Organization {
  id: string
  name: string
  type: OrganizationType
  company_name: string | null // Added company info fields
  vat_number: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: UserRole
  organization_id: string | null
  setup_completed: boolean // Added setup_completed flag
  phone: string | null // Added personal and contact information fields
  mobile: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  tax_code: string | null
  birth_date: string | null
  job_title: string | null
  department: string | null
  notes: string | null
  is_active: boolean
  invited_by: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export type HotelType =
  | "hotel"
  | "resort"
  | "boutique"
  | "bb"
  | "agriturismo"
  | "casa_vacanze"
  | "appartamenti"
  | "residence"
  | "villaggio"
  | "camping"
  | "hostel"
  | "altro"

export interface Hotel {
  id: string
  organization_id: string
  name: string
  total_rooms: number
  address: string | null
  city: string | null
  country: string | null
  // 12/05/2026: anagrafica estesa per onboarding completo (telefono/sito web,
  // contatto pubblico, tipologia struttura, categoria stelle, regione/provincia).
  // Tutti nullable per backward compat con hotel esistenti prima della migration
  // `add_hotel_contact_categorization`.
  phone: string | null
  website: string | null
  contact_email: string | null
  hotel_type: HotelType | null
  stars: number | null
  region: string | null
  province: string | null
  timezone: string
  currency: string
  created_at: string
  updated_at: string
}

export interface RoomType {
  id: string
  hotel_id: string
  name: string
  code: string | null
  description: string | null
  total_rooms: number
  base_price: number | null
  max_occupancy: number
  created_at: string
  updated_at: string
}

export type IntegrationMode = "api" | "gsheets"

export interface PMSIntegration {
  id: string
  hotel_id: string
  pms_name: PMSName
  integration_mode: IntegrationMode
  api_key: string | null
  api_secret: string | null
  endpoint_url: string | null
  config: Record<string, any>
  is_active: boolean
  last_sync_at: string | null
  // Google Sheets fields
  gsheet_spreadsheet_id: string | null
  gsheet_spreadsheet_url: string | null
  gsheet_service_account_email: string | null
  gsheet_last_sync_at: string | null
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  hotel_id: string
  room_type_id: string | null

  // PMS identifiers
  pms_booking_id: string | null
  pms_reservation_number: string | null

  // Booking dates
  booking_date: string
  booking_datetime: string
  check_in_date: string
  check_out_date: string

  // Cancellation
  is_cancelled: boolean
  cancellation_date: string | null
  cancellation_datetime: string | null
  cancellation_reason: string | null

  // Pick-up times (auto-calculated)
  booking_pickup_days: number | null
  cancellation_pickup_days: number | null

  // Guest data
  guest_name: string
  guest_email: string | null
  guest_phone: string | null
  guest_country: string | null
  guest_notes: string | null

  // Booking details
  number_of_rooms: number
  number_of_nights: number
  number_of_guests: number

  // Pricing (IVA included)
  price_per_night: number
  total_price: number

  // Sales channel
  channel: string | null
  is_direct: boolean
  commission_rate: number | null
  commission_amount: number | null

  // Metadata
  source: string
  imported_at: string
  created_at: string
  updated_at: string

  is_frozen: boolean
  frozen_at: string | null
}

export interface BookingFull extends Booking {
  // Same structure as Booking, but stored in bookings_full table
}

export interface DailyRoomAvailability {
  id: string
  hotel_id: string
  room_type_id: string
  date: string

  total_rooms: number
  rooms_out_of_service: number
  rooms_available: number

  source: string
  imported_at: string
  created_at: string
  updated_at: string
}

export interface DailyRoomOccupancy {
  id: string
  hotel_id: string
  room_type_id: string
  date: string

  rooms_occupied: number
  rooms_sold: number
  occupancy_rate: number | null

  source: string
  calculated_at: string
  created_at: string
  updated_at: string
}

export interface DailyRoomRevenue {
  id: string
  hotel_id: string
  room_type_id: string
  date: string

  total_revenue: number
  direct_revenue: number
  intermediated_revenue: number

  adr: number | null
  revpor: number | null
  revpar: number | null

  source: string
  calculated_at: string
  created_at: string
  updated_at: string
}

export interface HotelDailySummary {
  hotel_id: string
  date: string

  // Availability
  total_rooms_available: number
  total_rooms_out_of_service: number

  // Occupancy
  total_rooms_occupied: number
  occupancy_rate: number

  // Revenue
  total_revenue: number
  direct_revenue: number
  intermediated_revenue: number
  avg_adr: number
  revpor: number
  revpar: number
}

export interface AlertRule {
  id: string
  hotel_id: string | null
  organization_id: string | null

  name: string
  description: string | null

  metric: AlertMetric
  operator: AlertOperator
  threshold: number

  severity: AlertSeverity

  send_email: boolean
  send_notification: boolean

  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Alert {
  id: string
  hotel_id: string
  alert_rule_id: string | null

  severity: AlertSeverity
  title: string
  message: string
  metric_value: number | null

  is_read: boolean
  is_dismissed: boolean

  created_at: string
}

export interface AcceleratorSubscription {
  id: string
  hotel_id: string

  plan_type: AcceleratorPlanType

  fixed_fee_per_room: number | null
  commission_percentage: number | null

  algorithm_type: AlgorithmType
  auto_pilot: boolean

  is_active: boolean
  started_at: string
  ended_at: string | null

  trial_start_at: string | null
  trial_end_at: string | null
  payment_status: "pending" | "active" | "failed" | "cancelled"
  payment_method: string | null
  next_billing_date: string | null
  billing_cycle: "monthly" | "yearly"
  last_payment_date: string | null
  notes: string | null

  created_at: string
  updated_at: string
}

export interface PricingRecommendation {
  id: string
  hotel_id: string
  room_type_id: string | null

  date: string
  recommended_price: number
  current_price: number | null

  algorithm_type: string
  confidence_score: number | null
  factors: Record<string, any>

  applied: boolean
  applied_at: string | null

  created_at: string
}

export interface Invoice {
  id: string
  organization_id: string
  hotel_id: string | null

  invoice_number: string

  subtotal: number
  tax: number
  total: number

  period_start: string
  period_end: string

  status: "draft" | "pending" | "paid" | "cancelled"

  due_date: string | null
  paid_at: string | null

  created_at: string
  updated_at: string
}

export interface Partner {
  id: string
  user_id: string

  partner_code: string

  registration_commission_rate: number
  service_commission_rate: number

  total_referrals: number
  total_earnings: number

  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PartnerReferral {
  id: string
  partner_id: string
  hotel_id: string

  referral_type: "registration" | "service_upgrade"

  amount: number
  commission_rate: number
  commission_amount: number

  status: "pending" | "approved" | "paid"

  created_at: string
  paid_at: string | null
}

// KPI Calculation Types
export interface KPIMetrics {
  revpor: number // Revenue Per Occupied Room
  revpar: number // Revenue Per Available Room
  occupancy_rate: number
  adr: number // Average Daily Rate
  cancellation_rate: number
}

export interface DashboardData {
  today: HotelDailySummary
  last24h: {
    bookings: Booking[]
    total_bookings: number
    total_room_nights: number
    total_revenue: number
    avg_revpor: number
    avg_pickup_time: number
  }
  last24hCancellations: {
    cancellations: Booking[]
    total_cancellations: number
    total_room_nights: number
    lost_revenue: number
    avg_revpor: number
    avg_pickup_time: number
  }
  yearComparison: {
    revenue_change: number
    revenue_change_percent: number
    room_nights_change: number
    room_nights_change_percent: number
    revpor_change: number
    revpor_change_percent: number
    revpar_change: number
    revpar_change_percent: number
  }
  currentPeriod: {
    daily: HotelDailySummary[]
    by_room_type: {
      room_type: RoomType
      availability: DailyRoomAvailability[]
      occupancy: DailyRoomOccupancy[]
      revenue: DailyRoomRevenue[]
    }[]
  }
  alerts: Alert[]
}

export interface PMSBookingImport {
  pms_booking_id: string
  pms_reservation_number?: string
  booking_date: string | null
  check_in_date: string
  check_out_date: string
  room_type_code?: string
  guest_name: string
  guest_email?: string
  guest_phone?: string
  guest_country?: string
  number_of_rooms: number
  number_of_nights: number
  number_of_guests: number
  price_per_night: number
  total_price: number
  channel: string
  is_direct: boolean
  commission_rate?: number
  is_cancelled: boolean
  cancellation_date?: string | null
  cancellation_reason?: string
}

export interface PMSAvailabilityImport {
  date: string
  room_type_code: string
  total_rooms: number
  rooms_out_of_service: number
  rooms_available?: number // Added rooms_available field for direct availability from PMS
}

export interface BookingMetrics {
  total_bookings: number
  total_cancellations: number
  total_room_nights: number
  cancelled_room_nights: number
  total_revenue: number
  lost_revenue: number
  avg_booking_pickup_time: number
  avg_cancellation_pickup_time: number
  cancellation_rate: number
  cancellation_rate_on_room_nights: number
}

export interface PeriodComparison {
  current: HotelDailySummary
  previous: HotelDailySummary
  revenue_change: number
  revenue_change_percent: number
  room_nights_change: number
  room_nights_change_percent: number
  revpor_change: number
  revpor_change_percent: number
  revpar_change: number
  revpar_change_percent: number
  occupancy_change: number
  occupancy_change_percent: number
}

export interface ConsultantHotel {
  id: string
  consultant_id: string
  hotel_id: string
  can_manage: boolean
  can_view_financials: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TeamInvitation {
  id: string
  organization_id: string
  email: string
  role: UserRole
  invited_by: string
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface AccessibleHotel {
  hotel_id: string
  hotel_name: string
  organization_id: string
  organization_name: string
  access_type: "organization" | "consultant"
}

export interface UserPropertyMap {
  id: string
  user_id: string
  hotel_id: string
  can_manage: boolean
  can_view_financials: boolean
  can_sync_data: boolean
  can_manage_team: boolean
  assigned_by: string | null
  assigned_at: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ConsultantKPI {
  id: string
  consultant_id: string
  hotel_id: string
  period_start: string
  period_end: string
  total_revenue: number
  revenue_growth_percent: number | null
  avg_occupancy_rate: number | null
  occupancy_improvement_percent: number | null
  avg_adr: number | null
  adr_improvement_percent: number | null
  avg_revpar: number | null
  revpar_improvement_percent: number | null
  performance_score: number | null
  calculated_at: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DailyProduction {
  id: string
  hotel_id: string
  date: string
  total_rooms: number
  rooms_occupied: number
  rooms_available: number
  rooms_out_of_service: number
  total_revenue: number
  direct_revenue: number
  intermediated_revenue: number
  occupancy_rate: number | null
  adr: number | null
  revpar: number | null
  revpor: number | null
  is_frozen: boolean
  frozen_at: string | null
  source: string
  calculated_at: string
  created_at: string
  updated_at: string
}

export interface DailyAvailability {
  id: string
  hotel_id: string
  room_type_id: string | null
  date: string
  total_rooms: number
  rooms_out_of_service: number
  rooms_available: number
  is_frozen: boolean
  frozen_at: string | null
  source: string
  imported_at: string
  created_at: string
  updated_at: string
}

export interface DailyOccupancy {
  id: string
  hotel_id: string
  room_type_id: string | null
  date: string
  rooms_occupied: number
  rooms_sold: number
  occupancy_rate: number | null
  is_frozen: boolean
  frozen_at: string | null
  source: string
  calculated_at: string
  created_at: string
  updated_at: string
}

export interface SyncJob {
  id: string
  hotel_id: string
  pms_integration_id: string
  status: "pending" | "in_progress" | "completed" | "failed"
  start_date: string
  end_date: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  stats: Record<string, any>
  initial_sync: boolean // Added initial_sync flag
  sync_type: "initial" | "incremental" | "hard_resync" // Added sync_type
  created_at: string
  updated_at: string
  created_by: string | null
}
