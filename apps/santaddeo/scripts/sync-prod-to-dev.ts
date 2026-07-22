/**
 * Script to sync data from PROD Supabase to DEV Supabase
 * Run with: npx ts-node scripts/sync-prod-to-dev.ts
 * 
 * Required env vars:
 * - SUPABASE_URL (PROD)
 * - SUPABASE_SERVICE_ROLE_KEY (PROD)
 * - DEV_SUPABASE_URL (DEV)
 * - DEV_SUPABASE_SERVICE_ROLE_KEY (DEV)
 */

import { createClient } from "@supabase/supabase-js"

// Tables in dependency order
const TABLES = [
  // Level 1: No dependencies
  "hotels",
  "organizations",
  
  // Level 2: Depends on hotels
  "pms_integrations", 
  "room_types",
  "rates",
  // "occupancy_bands", // PROTECTED - user config, never delete
  "last_minute_levels",
  "autopilot_configs",
  "pricing_configs",
  
  // Level 3: Depends on room_types/rates
  "daily_availability",
  "daily_production",
  "pricing_grid",
  "pricing_algo_params",
  "bookings",
  
  // Level 4: Logs and queues
  "price_change_log",
  "price_push_log",
  "price_guard_checks",
  "last_sent_prices",
  "pricing_recalc_queue",
  "autopilot_price_changes",
  
  // Level 5: Raw data
  "scidoo_raw_bookings",
  "scidoo_raw_availability", 
  "scidoo_raw_rates",
  "scidoo_raw_room_types",
  "scidoo_raw_fiscal_production_legacy",
  
  // Level 6: ETL/Sync
  "etl_jobs",
  "sync_jobs",
  "sync_logs",
]

async function syncTable(
  prodClient: ReturnType<typeof createClient>,
  devClient: ReturnType<typeof createClient>,
  tableName: string
): Promise<{ table: string; status: string; copied?: number; error?: string }> {
  try {
    console.log(`[${tableName}] Fetching from PROD...`)
    
    // Fetch all data from PROD (in batches for large tables)
    let allData: any[] = []
    let offset = 0
    const batchSize = 1000
    
    while (true) {
      const { data, error } = await prodClient
        .from(tableName)
        .select("*")
        .range(offset, offset + batchSize - 1)
      
      if (error) {
        return { table: tableName, status: "skipped", error: error.message }
      }
      
      if (!data || data.length === 0) break
      
      allData = [...allData, ...data]
      offset += batchSize
      
      if (data.length < batchSize) break
    }
    
    if (allData.length === 0) {
      console.log(`[${tableName}] Empty table, skipping`)
      return { table: tableName, status: "empty", copied: 0 }
    }
    
    console.log(`[${tableName}] Fetched ${allData.length} rows`)
    
    // Delete existing data in DEV
    console.log(`[${tableName}] Clearing DEV table...`)
    const { error: deleteError } = await devClient
      .from(tableName)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
    
    if (deleteError) {
      // Try with created_at for tables without id
      await devClient.from(tableName).delete().gte("created_at", "1900-01-01")
    }
    
    // Insert in batches
    console.log(`[${tableName}] Inserting into DEV...`)
    const insertBatchSize = 500
    let totalInserted = 0
    
    for (let i = 0; i < allData.length; i += insertBatchSize) {
      const batch = allData.slice(i, i + insertBatchSize)
      
      const { error: insertError } = await devClient
        .from(tableName)
        .insert(batch)
      
      if (insertError) {
        console.error(`[${tableName}] Insert error at batch ${i}:`, insertError.message)
        // Try upsert as fallback
        const { error: upsertError } = await devClient
          .from(tableName)
          .upsert(batch, { onConflict: "id" })
        
        if (upsertError) {
          return { table: tableName, status: "error", error: upsertError.message }
        }
      }
      
      totalInserted += batch.length
      console.log(`[${tableName}] Progress: ${totalInserted}/${allData.length}`)
    }
    
    console.log(`[${tableName}] Success: ${totalInserted} rows copied`)
    return { table: tableName, status: "success", copied: totalInserted }
    
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error(`[${tableName}] Error:`, message)
    return { table: tableName, status: "error", error: message }
  }
}

async function main() {
  const PROD_URL = process.env.SUPABASE_URL
  const PROD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const DEV_URL = process.env.DEV_SUPABASE_URL
  const DEV_KEY = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY
  
  if (!PROD_URL || !PROD_KEY || !DEV_URL || !DEV_KEY) {
    console.error("Missing environment variables!")
    console.error("Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEV_SUPABASE_URL, DEV_SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }
  
  console.log("=".repeat(60))
  console.log("SANTADDEO - Sync PROD to DEV")
  console.log("=".repeat(60))
  console.log(`PROD: ${PROD_URL}`)
  console.log(`DEV: ${DEV_URL}`)
  console.log("=".repeat(60))
  
  const prodClient = createClient(PROD_URL, PROD_KEY, {
    auth: { persistSession: false }
  })
  
  const devClient = createClient(DEV_URL, DEV_KEY, {
    auth: { persistSession: false }
  })
  
  const results: any[] = []
  
  for (const table of TABLES) {
    const result = await syncTable(prodClient, devClient, table)
    results.push(result)
  }
  
  console.log("\n" + "=".repeat(60))
  console.log("SYNC RESULTS")
  console.log("=".repeat(60))
  
  const success = results.filter(r => r.status === "success")
  const errors = results.filter(r => r.status === "error")
  const skipped = results.filter(r => r.status === "skipped")
  const empty = results.filter(r => r.status === "empty")
  
  console.log(`Success: ${success.length}`)
  console.log(`Errors: ${errors.length}`)
  console.log(`Skipped: ${skipped.length}`)
  console.log(`Empty: ${empty.length}`)
  console.log(`Total rows copied: ${success.reduce((sum, r) => sum + (r.copied || 0), 0)}`)
  
  if (errors.length > 0) {
    console.log("\nErrors:")
    errors.forEach(r => console.log(`  - ${r.table}: ${r.error}`))
  }
  
  console.log("\n" + "=".repeat(60))
}

main().catch(console.error)
