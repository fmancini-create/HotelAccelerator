import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

// Tables to migrate in order (respecting foreign keys)
const TABLES_TO_MIGRATE = [
  // Independent tables first
  { schema: "public", table: "hotels" },
  { schema: "public", table: "profiles" },
  { schema: "public", table: "room_types" },
  { schema: "public", table: "rooms" },
  { schema: "public", table: "rate_plans" },
  { schema: "public", table: "seasons" },
  { schema: "public", table: "competitors" },
  { schema: "public", table: "market_segments" },
  { schema: "public", table: "distribution_channels" },
  // Dependent tables
  { schema: "public", table: "bookings" },
  { schema: "public", table: "booking_rooms" },
  { schema: "public", table: "guests" },
  { schema: "public", table: "daily_revenue" },
  { schema: "public", table: "daily_occupancy" },
  { schema: "public", table: "forecast_data" },
  { schema: "public", table: "competitor_rates" },
  { schema: "public", table: "events" },
  { schema: "public", table: "pms_connections" },
  { schema: "public", table: "pms_cron_settings" },
  { schema: "public", table: "price_recommendations" },
  { schema: "public", table: "alerts" },
  { schema: "public", table: "dynamic_config" },
  // Connectors schema
  { schema: "connectors", table: "sync_logs" },
  { schema: "connectors", table: "scidoo_bookings" },
  { schema: "connectors", table: "scidoo_rooms" },
  { schema: "connectors", table: "scidoo_room_types" },
  { schema: "connectors", table: "scidoo_rate_plans" },
  { schema: "connectors", table: "scidoo_availability" },
  { schema: "connectors", table: "scidoo_rates" },
]

function getDevSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function getProdSupabase() {
  return createClient(process.env.PROD_SUPABASE_URL!, process.env.PROD_SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: NextRequest) {
  // DISABLED - Return error immediately
  console.error("[MIGRATE] CRITICAL: migrate-dev-to-prod endpoint was called but is disabled for safety")

  return NextResponse.json(
    {
      error: "This endpoint has been disabled for safety",
      reason: "migrate-dev-to-prod can cause data loss by overwriting production data with empty dev data",
      suggestion: "Use the Supabase dashboard or proper migration tools instead",
    },
    { status: 403 },
  )
}

export async function GET() {
  return NextResponse.json({
    status: "disabled",
    reason: "This endpoint has been disabled to prevent accidental data loss",
    message: "DEV → PROD migration is disabled. Production data should only be modified through proper channels.",
  })
}
