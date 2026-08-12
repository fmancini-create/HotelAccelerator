import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { indexSource } from "@/lib/ai/ingest"

// Safety net for the AI knowledge base.
//
// New sources are indexed inline via after() when created, but that can fail
// (transient embedding/network errors, a cold PDF fetch, a timed-out crawl) and
// leave a source stuck in "pending" or "error". This cron periodically resumes
// those so the knowledge base becomes consistent without manual re-indexing.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BUDGET_MS = 50_000

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const startedAt = Date.now()
  const supabase = createServiceClient()

  // Resume sources that never finished indexing. Cap per run; the next run
  // continues where this one left off.
  const { data: pending, error } = await supabase
    .from("knowledge_sources")
    .select("id, property_id, status, updated_at")
    .in("status", ["pending", "error"])
    .order("updated_at", { ascending: true })
    .limit(25)

  if (error) {
    console.error("[v0][reindex-knowledge] DB error:", error.message)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  let processed = 0
  let failed = 0
  for (const source of pending ?? []) {
    if (Date.now() - startedAt >= BUDGET_MS) break
    try {
      await indexSource(source.id, source.property_id)
      processed++
    } catch (e) {
      failed++
      console.log(`[v0][reindex-knowledge] source ${source.id} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: pending?.length ?? 0,
    processed,
    failed,
    tookMs: Date.now() - startedAt,
  })
}
