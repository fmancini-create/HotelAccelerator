/**
 * Script to trigger Scidoo fiscal sync for Villa I Barronci
 * Run with: npx ts-node scripts/trigger-scidoo-sync.ts
 */

import { createClient } from "@supabase/supabase-js"
import { ScidooSyncService } from "../lib/connectors/scidoo/sync"

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function triggerSync() {
  const hotelId = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca" // Villa I Barronci
  
  console.log("Fetching PMS integration for Villa I Barronci...")
  
  const { data: pmsIntegration, error } = await supabase
    .from("pms_integrations")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("pms_name", "scidoo")
    .single()
  
  if (error || !pmsIntegration) {
    console.error("Error fetching PMS integration:", error)
    process.exit(1)
  }
  
  console.log("PMS Integration found:", pmsIntegration.id)
  console.log("Credentials:", pmsIntegration.credentials)
  
  // Initialize sync service
  const syncService = new ScidooSyncService(
    hotelId,
    pmsIntegration.id,
    pmsIntegration.credentials
  )
  
  // Sync last 30 days of fiscal data
  const dateFrom = new Date()
  dateFrom.setDate(dateFrom.getDate() - 30)
  const dateTo = new Date()
  
  console.log(`Syncing fiscal data from ${dateFrom.toISOString().split("T")[0]} to ${dateTo.toISOString().split("T")[0]}...`)
  
  try {
    const result = await syncService.syncFiscalProduction(
      dateFrom.toISOString().split("T")[0],
      dateTo.toISOString().split("T")[0]
    )
    console.log("Sync result:", result)
  } catch (err) {
    console.error("Sync error:", err)
  }
}

triggerSync()
