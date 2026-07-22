import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { PerfContext, storePerfLog } from "@/lib/performance/perf-logger"

async function retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 5, initialDelay = 10000): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error

      // Check if it's a rate limiting error (JSON parse error with "Too Many Requests")
      const isRateLimitError =
        error instanceof SyntaxError ||
        error.message?.includes("Too Many") ||
        error.message?.includes("rate limit") ||
        error.message?.includes("429")

      if (!isRateLimitError || attempt === maxRetries - 1) {
        throw error
      }

      const delay = initialDelay * Math.pow(2, attempt)
      console.log(`[v0] Rate limit detected, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export async function GET(request: NextRequest) {
  const perf = new PerfContext("/api/scidoo/sync-logs", "GET")

  try {
    console.log("[v0] Sync logs API - Starting request")

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")

    console.log("[v0] Sync logs API - Hotel ID:", hotelId)

    if (!hotelId) {
      console.log("[v0] Sync logs API - Missing hotelId")
      const log = perf.finalize(400)
      storePerfLog(log)
      return NextResponse.json({ error: "Missing hotelId" }, { status: 400 })
    }

    perf.setHotelId(hotelId)

    console.log("[v0] Sync logs API - Creating service role client")
    const serviceSupabase = await createServiceRoleClient()

    console.log("[v0] Sync logs API - Querying sync_logs table with retry logic")
    const { data: logs, error } = await perf.measureDb(
      () =>
        retryWithBackoff(async () => {
          return await serviceSupabase
            .from("sync_logs")
            .select("*")
            .eq("hotel_id", hotelId)
            .order("created_at", { ascending: false })
            .limit(10)
        }),
      "SELECT:sync_logs",
    )

    console.log("[v0] Sync logs API - Query result:", {
      logsCount: logs?.length,
      hasError: !!error,
      error: error?.message,
    })

    if (error) {
      console.error("[v0] Error fetching sync logs:", error)
      const log = perf.finalize(500, error.message)
      storePerfLog(log)
      return NextResponse.json({ error: "Failed to fetch sync logs" }, { status: 500 })
    }

    console.log("[v0] Sync logs API - Returning logs:", logs?.length || 0)
    const log = perf.finalize(200)
    storePerfLog(log)
    return NextResponse.json({ logs: logs || [] })
  } catch (error: any) {
    console.error("[v0] Sync logs error:", error)
    const log = perf.finalize(500, error.message)
    storePerfLog(log)
    return NextResponse.json({ error: error.message || "Failed to fetch logs" }, { status: 500 })
  }
}
