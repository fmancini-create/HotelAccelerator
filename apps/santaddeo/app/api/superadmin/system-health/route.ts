import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isAnyCircuitOpen } from "@/lib/services/scidoo-client"

export const dynamic = "force-dynamic"

/**
 * Validates that the current user is a super_admin.
 * Returns the user profile or a 401/403 NextResponse.
 */
async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) }
  }
  const admin = await createServiceRoleClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  const role = profile?.role?.toLowerCase()
  if (role !== "super_admin" && role !== "superadmin") {
    return { error: NextResponse.json({ error: "Accesso riservato ai super admin" }, { status: 403 }) }
  }
  return { user }
}

export async function GET() {
  const auth = await requireSuperAdmin()
  if ("error" in auth && auth.error) return auth.error

  const admin = await createServiceRoleClient()

  // Measure DB latency with a simple ping
  const dbStart = Date.now()
  let dbConnected = true
  try {
    await admin.from("hotels").select("id").limit(1)
  } catch {
    dbConnected = false
  }
  const dbLatency = Date.now() - dbStart

  // Measure Redis latency
  let redisConnected = false
  let redisLatency = 0
  try {
    const { Redis } = await import("@upstash/redis")
    const redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
    const rStart = Date.now()
    await redis.ping()
    redisLatency = Date.now() - rStart
    redisConnected = true
  } catch {
    // Redis not available
  }

  // Run all queries in parallel
  const [
    syncResult,
    emailLogsResult,
    emailCountResult,
    email7dCountResult,
    tableCountsResult,
    dbSizeResult,
    hotelsResult,
  ] = await Promise.all([
    // Sync status per hotel -- last successful sync from sync_logs
    admin
      .from("sync_logs")
      .select("hotel_id, sync_type, status, completed_at, records_processed, error_message")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(200),

    // Last 10 email_logs
    admin
      .from("email_logs")
      .select("id, hotel_id, alert_type, recipient_email, success, sent_at, message")
      .order("sent_at", { ascending: false })
      .limit(10),

    // Total emails in last 24h
    admin
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),

    // Total emails in last 7d
    admin
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

    // Row counts via RPC (count is approximate but fast via reltuples)
    admin.rpc("get_table_row_counts"),

    // Database size
    admin.rpc("get_database_size"),

    // All active hotels
    admin
      .from("hotels")
      .select("id, name, pms_connector")
      .order("name"),
  ])

  // Build hotel sync map: per hotel, get the most recent completed sync
  const hotels = hotelsResult.data || []
  const syncLogs = syncResult.data || []

  // Group sync logs by hotel, pick latest per hotel
  const hotelSyncMap = new Map<string, {
    lastSync: string
    minutesAgo: number
    status: "green" | "yellow" | "red"
    syncType: string
    recordsProcessed: number
  }>()

  for (const log of syncLogs) {
    if (!hotelSyncMap.has(log.hotel_id)) {
      const completedAt = new Date(log.completed_at)
      const minutesAgo = Math.round((Date.now() - completedAt.getTime()) / 60000)
      hotelSyncMap.set(log.hotel_id, {
        lastSync: log.completed_at,
        minutesAgo,
        status: minutesAgo <= 30 ? "green" : minutesAgo <= 120 ? "yellow" : "red",
        syncType: log.sync_type,
        recordsProcessed: log.records_processed || 0,
      })
    }
  }

  // Build sync status per hotel with circuit breaker
  const hotelHealthList = await Promise.all(
    hotels.map(async (hotel: { id: string; name: string; pms_connector?: string }) => {
      const sync = hotelSyncMap.get(hotel.id)
      let circuitOpen = false
      try {
        circuitOpen = await isAnyCircuitOpen(hotel.id)
      } catch {
        // ignore
      }
      const statusMap: Record<string, "ok" | "warning" | "critical"> = {
        green: "ok", yellow: "warning", red: "critical",
      }
      return {
        hotelId: hotel.id,
        hotelName: hotel.name,
        pmsConnector: hotel.pms_connector || "N/A",
        lastSyncMinutesAgo: sync?.minutesAgo ?? null,
        circuitBreakerOpen: circuitOpen,
        syncStatus: statusMap[sync?.status || "red"] || "critical",
      }
    })
  )

  // Table counts array for the client
  const tableCounts: { table_name: string; row_count: number }[] = []
  if (tableCountsResult.data && Array.isArray(tableCountsResult.data)) {
    for (const row of tableCountsResult.data) {
      tableCounts.push({ table_name: row.table_name, row_count: row.row_count })
    }
  }

  // Database size
  let dbSize = "N/A"
  if (dbSizeResult.data && typeof dbSizeResult.data === "string") {
    dbSize = dbSizeResult.data
  } else if (dbSizeResult.data && Array.isArray(dbSizeResult.data) && dbSizeResult.data[0]) {
    dbSize = dbSizeResult.data[0].size || "N/A"
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    database: {
      connected: dbConnected,
      latencyMs: dbLatency,
      size: dbSize,
      tableCounts,
    },
    redis: {
      connected: redisConnected,
      latencyMs: redisLatency,
    },
    hotels: hotelHealthList,
    email: {
      last24h: emailCountResult.count || 0,
      last7d: email7dCountResult.count || 0,
      provider: "Resend",
    },
    crons: [
      { name: "sync-and-etl", lastRun: null, status: "unknown" },
      { name: "sync-modules", lastRun: null, status: "unknown" },
      { name: "connector-health", lastRun: null, status: "unknown" },
      { name: "cleanup-logs", lastRun: null, status: "unknown" },
      { name: "calculate-k-values", lastRun: null, status: "unknown" },
      { name: "freeze-data", lastRun: null, status: "unknown" },
    ],
  })
}
