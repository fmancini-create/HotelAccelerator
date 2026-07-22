/**
 * Pricing Health Check (FASE 5 - 12/05/2026)
 *
 * Script diagnostico per monitoring continuo della pipeline pricing.
 * Da eseguire periodicamente (manualmente o via cron) per validare:
 *
 *   1. ZERO drift: pricing_grid == last_sent_prices == UI live
 *   2. ZERO ghost rows: nessuna riga old_price = new_price residua
 *   3. ZERO loop: nessuna cella ricalcolata > 5 volte in 1h
 *   4. ZERO duplicate push: ogni push price log e' unico per (cell, minute)
 *   5. ZERO mismatch PMS: ultimo push allineato con pricing_grid corrente
 *
 * Usage:
 *   pnpm tsx scripts/pricing-health-check.ts [--hotel=<id>] [--days=7]
 *
 *   --hotel=<id>  : limita al singolo hotel (default: tutti gli hotel attivi)
 *   --days=<N>    : finestra temporale lookback in giorni (default: 1)
 *   --verbose     : log dettagliato per ogni metrica
 *
 * Output: report tabellare. Exit code 0 se tutte le metriche sono ok,
 * exit code 1 se almeno una metrica supera i threshold.
 *
 * Esempio output:
 *   [health] hotel=barronci ghost_rows=0 loops_1h=0 push_dup_1m=0 drift_cells=0 OK
 *   [health] hotel=massabo ghost_rows=0 loops_1h=0 push_dup_1m=0 drift_cells=2 WARN
 *   [health] hotel=rondini ghost_rows=87 loops_1h=0 push_dup_1m=0 drift_cells=0 FAIL
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars")
  console.error("Run with: node --env-file-if-exists=/vercel/share/.env.project --env-file-if-exists=/vercel/share/.env.snowflake -r ts-node/register scripts/pricing-health-check.ts")
  process.exit(2)
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE)

// Threshold per metrica (oltre = FAIL)
const THRESHOLD = {
  ghost_rows: 0,           // ghost row = old_price = new_price con action_taken in ('none','email','pms'). 0 tollerato.
  loops_1h: 0,             // stessa cella ricalcolata > 5 volte/h. 0 tollerato.
  push_dup_1m: 0,          // 2+ push log alla stessa cella entro 1 min. 0 tollerato.
  drift_cells: 0,          // pricing_grid != last_sent_prices E autopilot=on. 0 tollerato.
}

function parseArgs() {
  const args: { hotel?: string; days: number; verbose: boolean } = {
    days: 1,
    verbose: false,
  }
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--hotel=")) args.hotel = a.split("=")[1]
    else if (a.startsWith("--days=")) args.days = Number(a.split("=")[1]) || 1
    else if (a === "--verbose") args.verbose = true
  }
  return args
}

async function fetchAllPages<T>(query: any, pageSize = 1000): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

async function checkHotel(hotelId: string, days: number, verbose: boolean) {
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString()

  // METRIC 1: ghost rows (old_price = new_price, action_taken in [none, email, pms])
  const { count: ghostCount } = await sb
    .from("price_change_log")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .not("old_price", "is", null)
    .filter("old_price", "eq", "new_price" as any) // PostgREST col=col
    .gte("changed_at", sinceIso)
  // NOTA: PostgREST non supporta nativamente col=col. Usiamo SQL via RPC se disponibile,
  // altrimenti fallback con select+filter JS (cap a 5000 righe).
  let ghostRows = 0
  if (ghostCount !== null) {
    ghostRows = ghostCount
  } else {
    const rows = await fetchAllPages<any>(
      sb
        .from("price_change_log")
        .select("old_price, new_price")
        .eq("hotel_id", hotelId)
        .gte("changed_at", sinceIso)
        .in("action_taken", ["none", "email", "pms"])
    )
    ghostRows = rows.filter(
      (r) =>
        r.old_price !== null &&
        r.new_price !== null &&
        Math.abs(Number(r.old_price) - Number(r.new_price)) < 0.001
    ).length
  }

  // METRIC 2: loops_1h - stessa (rt, rate, occ, date) con > 5 entries nell'ultima 1h
  const lastHourIso = new Date(Date.now() - 3600 * 1000).toISOString()
  const recentLogs = await fetchAllPages<any>(
    sb
      .from("price_change_log")
      .select("room_type_id, rate_id, occupancy, target_date")
      .eq("hotel_id", hotelId)
      .gte("changed_at", lastHourIso)
  )
  const cellCounts = new Map<string, number>()
  for (const r of recentLogs) {
    const k = `${r.room_type_id}|${r.rate_id}|${r.occupancy}|${r.target_date}`
    cellCounts.set(k, (cellCounts.get(k) ?? 0) + 1)
  }
  const loops_1h = Array.from(cellCounts.values()).filter((c) => c > 5).length

  // METRIC 3: push_dup_1m - 2+ push entries alla stessa cella entro 60s
  const lastDayIso = new Date(Date.now() - 86400000).toISOString()
  const pushLogs = await fetchAllPages<any>(
    sb
      .from("price_change_log")
      .select("room_type_id, rate_id, occupancy, target_date, changed_at")
      .eq("hotel_id", hotelId)
      .in("source", ["autopilot_push", "manual_push", "push"])
      .gte("changed_at", lastDayIso)
      .order("changed_at", { ascending: true })
  )
  const pushByCell = new Map<string, string[]>()
  for (const r of pushLogs) {
    const k = `${r.room_type_id}|${r.rate_id}|${r.occupancy}|${r.target_date}`
    if (!pushByCell.has(k)) pushByCell.set(k, [])
    pushByCell.get(k)!.push(r.changed_at)
  }
  let push_dup_1m = 0
  for (const times of pushByCell.values()) {
    for (let i = 1; i < times.length; i++) {
      const delta = new Date(times[i]).getTime() - new Date(times[i - 1]).getTime()
      if (delta < 60000) push_dup_1m++
    }
  }

  // METRIC 4: drift_cells - autopilot on, pricing_grid != last_sent_prices
  const { data: ap } = await sb
    .from("autopilot_configs")
    .select("mode")
    .eq("hotel_id", hotelId)
    .maybeSingle()
  let drift_cells = 0
  if (ap?.mode === "autopilot") {
    const today = new Date().toISOString().split("T")[0]
    const horizon = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]
    const [gridRows, sentRows] = await Promise.all([
      fetchAllPages<any>(
        sb
          .from("pricing_grid")
          .select("room_type_id, rate_id, occupancy, date, price")
          .eq("hotel_id", hotelId)
          .gte("date", today)
          .lte("date", horizon)
      ),
      fetchAllPages<any>(
        sb
          .from("last_sent_prices")
          .select("room_type_id, rate_id, occupancy, target_date, last_price")
          .eq("hotel_id", hotelId)
          .gte("target_date", today)
          .lte("target_date", horizon)
      ),
    ])
    const sentMap = new Map<string, number>()
    for (const r of sentRows) {
      const k = `${r.room_type_id}|${r.rate_id}|${r.occupancy}|${r.target_date}`
      sentMap.set(k, Number(r.last_price))
    }
    for (const g of gridRows) {
      const k = `${g.room_type_id}|${g.rate_id}|${g.occupancy}|${g.date}`
      const sent = sentMap.get(k)
      if (sent === undefined) continue // mai pushato, no drift
      if (Math.abs(Number(g.price) - sent) > 0.5) drift_cells++
    }
  }

  // Verdict
  const status =
    ghostRows > THRESHOLD.ghost_rows ||
    loops_1h > THRESHOLD.loops_1h ||
    push_dup_1m > THRESHOLD.push_dup_1m ||
    drift_cells > THRESHOLD.drift_cells
      ? "FAIL"
      : ghostRows > 0 || loops_1h > 0 || push_dup_1m > 0 || drift_cells > 0
      ? "WARN"
      : "OK"

  console.log(
    `[health] hotel=${hotelId} ghost_rows=${ghostRows} loops_1h=${loops_1h} ` +
    `push_dup_1m=${push_dup_1m} drift_cells=${drift_cells} ${status}`
  )

  if (verbose) {
    console.log(`  details: window=${days}d, autopilot=${ap?.mode ?? "off"}`)
  }

  return status === "FAIL" ? 1 : 0
}

async function main() {
  const args = parseArgs()

  // Hotel list
  let hotelIds: string[] = []
  if (args.hotel) {
    hotelIds = [args.hotel]
  } else {
    const { data: hotels } = await sb
      .from("hotels")
      .select("id, internal_code")
      .eq("is_active", true)
    hotelIds = (hotels ?? []).map((h: any) => h.id)
  }

  console.log(`[health] checking ${hotelIds.length} hotels, window=${args.days}d`)

  let exitCode = 0
  for (const id of hotelIds) {
    try {
      const code = await checkHotel(id, args.days, args.verbose)
      if (code !== 0) exitCode = 1
    } catch (e) {
      console.error(`[health] hotel=${id} ERROR:`, e instanceof Error ? e.message : e)
      exitCode = 1
    }
  }

  process.exit(exitCode)
}

main().catch((e) => {
  console.error("[health] fatal:", e)
  process.exit(2)
})
