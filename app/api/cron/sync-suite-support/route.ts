import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { projectFederatedSupport } from "@/lib/support-federation/core"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const exportSchema = z.object({
  threads: z.array(z.object({
    tenant_ref: z.string().min(1),
    thread_id: z.string().min(1),
    title: z.string().min(1),
    kind: z.literal("human_support"),
    status: z.enum(["open", "closed"]).optional(),
    source_path: z.string().nullable().optional(),
    messages: z.array(z.object({
      id: z.string().min(1),
      sender: z.enum(["customer", "agent", "system"]),
      sender_name: z.string().nullable().optional(),
      content: z.string().min(1),
      created_at: z.string().nullable().optional(),
    })).max(200),
  })).max(100),
})

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const key = process.env.CUSTOMER_CODE_REGISTRY_KEY_SNT?.trim()
  if (!key) return NextResponse.json({ error: "Santaddeo support sync not configured" }, { status: 503 })

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const exportUrl = new URL("https://www.santaddeo.com/api/integrations/support/v1/export")
  exportUrl.searchParams.set("since", since)

  try {
    const response = await fetch(exportUrl, {
      headers: { "X-4BID-Registry-Key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      console.error("[sync-suite-support] Santaddeo export rejected", { status: response.status })
      return NextResponse.json({ error: "Santaddeo export unavailable" }, { status: 502 })
    }

    const parsed = exportSchema.safeParse(await response.json())
    if (!parsed.success) return NextResponse.json({ error: "Santaddeo export invalid" }, { status: 502 })

    let projected = 0
    let skipped = 0
    let failed = 0
    for (const thread of parsed.data.threads) {
      try {
        const result = await projectFederatedSupport({
          product: "santaddeo",
          tenantRef: thread.tenant_ref,
          threadId: thread.thread_id,
          title: thread.title,
          kind: "human_support",
          status: thread.status,
          sourcePath: thread.source_path,
          messages: thread.messages,
        })
        if (result.ok) projected++
        else skipped++
      } catch (error) {
        failed++
        console.error("[sync-suite-support] projection failed", {
          threadId: thread.thread_id,
          error: error instanceof Error ? error.message : "unknown",
        })
      }
    }

    return NextResponse.json({ ok: failed === 0, candidates: parsed.data.threads.length, projected, skipped, failed })
  } catch (error) {
    console.error("[sync-suite-support] failed", { error: error instanceof Error ? error.message : "unknown" })
    return NextResponse.json({ error: "Support sync failed" }, { status: 500 })
  }
}
