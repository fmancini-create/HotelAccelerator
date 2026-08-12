import { type NextRequest, NextResponse, after } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { indexSource } from "@/lib/ai/ingest"

export const dynamic = "force-dynamic"

const VALID_TYPES = ["text", "pdf", "url", "conversation"] as const

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const baseId = request.nextUrl.searchParams.get("knowledgeBaseId")

    let query = supabase
      .from("knowledge_sources")
      .select(
        "id, type, title, url, file_url, status, error, chunk_count, last_indexed_at, created_at, updated_at, knowledge_base_id",
      )
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })

    if (baseId) query = query.eq("knowledge_base_id", baseId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ sources: data ?? [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()

    const type = body.type as (typeof VALID_TYPES)[number]
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Tipo di fonte non valido" }, { status: 400 })
    }

    const knowledgeBaseId = typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : null
    if (!knowledgeBaseId) {
      return NextResponse.json({ error: "Base di conoscenza mancante" }, { status: 400 })
    }

    // Validate per-type required fields.
    if ((type === "text" || type === "conversation") && !body.content?.trim()) {
      return NextResponse.json({ error: "Il contenuto testuale è obbligatorio" }, { status: 400 })
    }
    if (type === "url" && !isValidUrl(body.url)) {
      return NextResponse.json({ error: "URL non valido" }, { status: 400 })
    }
    if (type === "pdf" && !body.file_url?.trim()) {
      return NextResponse.json({ error: "File PDF mancante" }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Ensure the base belongs to this tenant before attaching a source to it.
    const { data: base } = await supabase
      .from("knowledge_bases")
      .select("id")
      .eq("id", knowledgeBaseId)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (!base) {
      return NextResponse.json({ error: "Base di conoscenza non trovata" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("knowledge_sources")
      .insert({
        property_id: propertyId,
        knowledge_base_id: knowledgeBaseId,
        type,
        title: typeof body.title === "string" ? body.title.slice(0, 300) : null,
        url: type === "url" ? body.url : null,
        file_url: type === "pdf" ? body.file_url : null,
        content: type === "text" || type === "conversation" ? String(body.content).slice(0, 200_000) : null,
        status: "pending",
      })
      .select("id, type, title, url, file_url, status, error, chunk_count, last_indexed_at, created_at")
      .single()

    if (error) throw new Error(error.message)

    // Index after the response is sent so the UI gets an immediate "pending"
    // row and can poll for status. The reindex cron is the safety net.
    after(async () => {
      try {
        await indexSource(data.id, propertyId)
      } catch (err) {
        console.log(`[v0] indexSource after() failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    })

    return NextResponse.json({ source: data }, { status: 201 })
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
