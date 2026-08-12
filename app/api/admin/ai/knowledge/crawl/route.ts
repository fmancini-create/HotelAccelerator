import { type NextRequest, NextResponse, after } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { discoverSiteUrls } from "@/lib/ai/extract"
import { indexSource } from "@/lib/ai/ingest"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_PAGES = 100

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()

    if (!isValidUrl(body.url)) {
      return NextResponse.json({ error: "URL non valido" }, { status: 400 })
    }

    const requested = Number(body.maxPages)
    const maxPages = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), MAX_PAGES) : 50

    // Discover pages (sitemap first, link-crawl fallback).
    const urls = await discoverSiteUrls(body.url, maxPages)
    if (urls.length === 0) {
      return NextResponse.json(
        { error: "Nessuna pagina trovata. Verifica l'URL o aggiungi le pagine manualmente." },
        { status: 422 },
      )
    }

    const supabase = createServiceClient()

    // Skip URLs already present for this tenant to avoid duplicates.
    const { data: existing } = await supabase
      .from("knowledge_sources")
      .select("url")
      .eq("property_id", propertyId)
      .eq("type", "url")
    const existingUrls = new Set(
      ((existing ?? []) as { url: string | null }[]).map((r) => r.url).filter(Boolean),
    )

    const toCreate = urls.filter((u) => !existingUrls.has(u))
    if (toCreate.length === 0) {
      return NextResponse.json({ created: 0, discovered: urls.length, sources: [] })
    }

    const { data: inserted, error } = await supabase
      .from("knowledge_sources")
      .insert(
        toCreate.map((u) => ({
          property_id: propertyId,
          type: "url" as const,
          url: u,
          title: null,
          status: "pending" as const,
        })),
      )
      .select("id")

    if (error) throw new Error(error.message)

    const ids = ((inserted ?? []) as { id: string }[]).map((r) => r.id)

    // Index with limited concurrency after the response is sent. The reindex
    // cron picks up anything still pending if this run is cut short.
    after(async () => {
      const CONCURRENCY = 3
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const batch = ids.slice(i, i + CONCURRENCY)
        await Promise.all(
          batch.map((id) =>
            indexSource(id, propertyId).catch((err) =>
              console.log(`[v0] crawl indexSource failed (${id}): ${err instanceof Error ? err.message : String(err)}`),
            ),
          ),
        )
      }
    })

    return NextResponse.json({ created: ids.length, discovered: urls.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

function isValidUrl(value: unknown): boolean {
  if (typeof value !== "string") return false
  try {
    const u = new URL(value)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}
