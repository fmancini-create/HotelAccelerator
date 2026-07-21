/**
 * sync-bookings-to-dev.mjs
 * 
 * Copia le bookings dalla produzione al dev in batch da 500 alla volta.
 * 
 * Uso: node scripts/sync-bookings-to-dev.mjs
 */

import { createClient } from '@supabase/supabase-js'

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const PROD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEV_URL = process.env.DEV_SUPABASE_URL
const DEV_KEY = process.env.DEV_SUPABASE_ANON_KEY

if (!PROD_URL || !PROD_KEY || !DEV_URL || !DEV_KEY) {
  console.error('[v0] Variabili di ambiente mancanti!')
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', !!PROD_URL)
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', !!PROD_KEY)
  console.error('  DEV_SUPABASE_URL:', !!DEV_URL)
  console.error('  DEV_SUPABASE_ANON_KEY:', !!DEV_KEY)
  process.exit(1)
}

const prod = createClient(PROD_URL, PROD_KEY)
const dev = createClient(DEV_URL, DEV_KEY)

const BATCH_SIZE = 500
const TABLES_TO_SYNC = [
  'bookings',
  'daily_availability',
  'daily_production',
  'daily_occupancy',
  'daily_data',
  'scidoo_raw_bookings',
  'scidoo_raw_availability',
  'scidoo_raw_rates',
  'scidoo_raw_room_types',
  'scidoo_raw_minstay',
  'rates',
  'revenue_objectives',
  // 'occupancy_bands',       // PROTECTED - user config, never delete
  // 'occupancy_band_groups', // PROTECTED - user config, never delete
  'last_minute_bands',
  'last_minute_levels',
  'kpi_thresholds',
  'room_type_rate_limits',
  'accelerator_subscriptions',
  'hotel_bindings',
  'autopilot_configs',
  'system_settings',
  'features',
  'rms_canonical_codes',
  'pms_providers',
]

async function getCount(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
  if (error) {
    console.error(`[v0] Errore count ${table}:`, error.message)
    return 0
  }
  return count || 0
}

async function syncTable(tableName) {
  console.log(`\n[v0] ====== Sincronizzando: ${tableName} ======`)

  const totalProd = await getCount(prod, tableName)
  console.log(`[v0] Totale record in produzione: ${totalProd}`)

  if (totalProd === 0) {
    console.log(`[v0] Tabella vuota, skip.`)
    return
  }

  // Svuota la tabella dev prima di ricaricare
  const { error: deleteError } = await dev.from(tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) {
    console.warn(`[v0] Warning delete ${tableName}:`, deleteError.message)
  }

  let offset = 0
  let totalInserted = 0
  let errors = 0

  while (offset < totalProd) {
    const { data, error } = await prod
      .from(tableName)
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      console.error(`[v0] Errore lettura batch ${offset}-${offset + BATCH_SIZE}:`, error.message)
      errors++
      offset += BATCH_SIZE
      continue
    }

    if (!data || data.length === 0) break

    const { error: insertError } = await dev
      .from(tableName)
      .upsert(data, { onConflict: 'id', ignoreDuplicates: false })

    if (insertError) {
      console.error(`[v0] Errore inserimento batch ${offset}:`, insertError.message)
      errors++
    } else {
      totalInserted += data.length
      console.log(`[v0] ${tableName}: inseriti ${totalInserted}/${totalProd}`)
    }

    offset += BATCH_SIZE

    // Piccola pausa per non sovraccaricare le API
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`[v0] ${tableName}: completato. Inseriti: ${totalInserted}, Errori: ${errors}`)
}

async function main() {
  console.log('[v0] ==============================')
  console.log('[v0] SYNC PRODUZIONE -> DEV')
  console.log('[v0] ==============================')
  console.log(`[v0] Prod: ${PROD_URL}`)
  console.log(`[v0] Dev:  ${DEV_URL}`)
  console.log(`[v0] Tabelle da sincronizzare: ${TABLES_TO_SYNC.length}`)
  console.log('[v0] ==============================\n')

  const startTime = Date.now()
  let successCount = 0
  let failCount = 0

  for (const table of TABLES_TO_SYNC) {
    try {
      await syncTable(table)
      successCount++
    } catch (err) {
      console.error(`[v0] ERRORE FATALE su ${table}:`, err.message)
      failCount++
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  console.log('\n[v0] ==============================')
  console.log('[v0] SYNC COMPLETATO')
  console.log(`[v0] Tabelle OK: ${successCount}`)
  console.log(`[v0] Tabelle con errori: ${failCount}`)
  console.log(`[v0] Tempo totale: ${elapsed}s`)
  console.log('[v0] ==============================')
}

main().catch(err => {
  console.error('[v0] Errore fatale:', err)
  process.exit(1)
})
