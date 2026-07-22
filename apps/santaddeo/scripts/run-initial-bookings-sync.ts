// Script to run initial bookings sync
// Execute with: npx tsx scripts/run-initial-bookings-sync.ts

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function runInitialSync() {
  const hotelId = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca" // Villa I Barronci

  console.log("Starting initial bookings sync...")

  // Get PMS integration
  const { data: pmsIntegration, error: pmsError } = await supabase
    .from("pms_integrations")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("pms_name", "scidoo")
    .eq("is_active", true)
    .maybeSingle()

  if (pmsError || !pmsIntegration) {
    console.error("PMS integration not found:", pmsError)
    process.exit(1)
  }

  const apiKey = pmsIntegration.api_key

  // Calculate date range: 2 years back + 1 year forward
  const today = new Date()
  const startDate = new Date(today)
  startDate.setFullYear(startDate.getFullYear() - 2)
  const endDate = new Date(today)
  endDate.setFullYear(endDate.getFullYear() + 1)

  const startDateStr = startDate.toISOString().split("T")[0]
  const endDateStr = endDate.toISOString().split("T")[0]

  console.log(`Fetching bookings from ${startDateStr} to ${endDateStr}`)

  // Call the API endpoint
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  
  try {
    const response = await fetch(`${baseUrl}/api/scidoo/sync-module`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hotelId,
        module: "bookings",
        startDate: startDateStr,
        endDate: endDateStr,
      }),
    })

    const result = await response.json()
    console.log("Sync result:", result)
  } catch (error) {
    console.error("Error calling sync API:", error)
    process.exit(1)
  }
}

runInitialSync()
