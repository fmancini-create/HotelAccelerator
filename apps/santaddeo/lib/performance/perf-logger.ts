/**
 * Performance Logger for SANTADDEO
 * Persists API performance logs to Supabase (perf_api_logs table)
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

export interface PerfLog {
  route: string
  method: string
  totalMs: number
  dbMs: number
  nonDbMs: number
  coldStart: boolean
  hotelId?: string
  status: number
  error?: string
  created_at?: string
  // New fields
  actor?: string      // user email or "anonymous"
  runtime?: string    // "edge" | "nodejs"
  region?: string     // Vercel region (e.g. "iad1")
  bytesOut?: number   // response body size in bytes
  cacheHit?: boolean  // whether a cache was hit
}

// Track cold starts (module-level, resets on each cold start)
let isFirstInvocation = true

export function isColdStart(): boolean {
  if (isFirstInvocation) {
    isFirstInvocation = false
    return true
  }
  return false
}

// Performance context for a single request
export class PerfContext {
  private startTime: number
  private dbTime = 0
  private route: string
  private method: string
  private hotelId?: string
  private coldStart: boolean
  private actor?: string
  private runtime?: string
  private region?: string
  private bytesOut?: number
  private cacheHit?: boolean

  constructor(route: string, method: string) {
    this.startTime = performance.now()
    this.route = route
    this.method = method
    this.coldStart = isColdStart()
    // Auto-detect region from Vercel headers (set in with-perf wrapper)
    this.runtime = typeof EdgeRuntime !== "undefined" ? "edge" : "nodejs"
  }

  setHotelId(hotelId: string) { this.hotelId = hotelId }
  setUserId(userId: string) { this.actor = userId } // Alias for setActor
  setActor(actor: string) { this.actor = actor }
  setRegion(region: string) { this.region = region }
  setBytesOut(bytes: number) { this.bytesOut = bytes }
  setCacheHit(hit: boolean) { this.cacheHit = hit }

  /** Wrap a database call to measure its time */
  async measureDb<T>(fn: () => Promise<T>, _queryName?: string): Promise<T> {
    const start = performance.now()
    try {
      const result = await fn()
      this.dbTime += performance.now() - start
      return result
    } catch (error) {
      this.dbTime += performance.now() - start
      throw error
    }
  }

  /** Finalize the log and return it */
  finalize(status: number, error?: string): PerfLog {
    const totalMs = performance.now() - this.startTime
    return {
      route: this.route,
      method: this.method,
      totalMs: Math.round(totalMs * 100) / 100,
      dbMs: Math.round(this.dbTime * 100) / 100,
      nonDbMs: Math.round((totalMs - this.dbTime) * 100) / 100,
      coldStart: this.coldStart,
      hotelId: this.hotelId,
      status,
      error,
      actor: this.actor,
      runtime: this.runtime,
      region: this.region,
      bytesOut: this.bytesOut,
      cacheHit: this.cacheHit,
    }
  }
}

/** Persist a PerfLog to the perf_api_logs table (fire-and-forget) */
export async function storePerfLog(log: PerfLog): Promise<void> {
  try {
    const supabase = await createServiceRoleClient()
    await supabase.from("perf_api_logs").insert({
      route: log.route,
      method: log.method,
      total_ms: log.totalMs,
      db_ms: log.dbMs,
      non_db_ms: log.nonDbMs,
      cold_start: log.coldStart,
      hotel_id: log.hotelId || null,
      status: log.status,
      error: log.error || null,
      actor: log.actor || null,
      runtime: log.runtime || null,
      region: log.region || null,
      bytes_out: log.bytesOut || null,
      cache_hit: log.cacheHit ?? null,
    })
  } catch {
    // Never let perf logging break the actual request
  }
}

/** Calculate percentiles from a sorted array of numbers */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}
