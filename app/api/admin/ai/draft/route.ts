import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { generateReply } from "@/lib/ai/generate"
import { getAiSettings } from "@/lib/ai/settings"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET ?conversationId=  -> latest pending AI draft for the conversation, if any.
 * Used by the inbox to surface a suggestion produced in `on_request` mode.
 */
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const conversationId = request.nextUrl.searchParams.get("conversationId")
    if (!conversationId || !UUID.test(conversationId)) {
      return NextResponse.json({ error: "conversationId non valido" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data } = await supabase
      .from("messages")
      .select("id, content, metadata, stored_at")
      .eq("property_id", propertyId)
      .eq("conversation_id", conversationId)
      .eq("status", "draft")
      .order("stored_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({ draft: data ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 500 })
  }
}

/**
 * POST { conversationId } -> generate a fresh reply on demand from the knowledge
 * base and return the text (without storing it). Powers the "Genera con IA"
 * button so the operator can review and edit before sending.
 */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { conversationId } = await request.json()
    if (!conversationId || !UUID.test(conversationId)) {
      return NextResponse.json({ error: "conversationId non valido" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: history } = await supabase
      .from("messages")
      .select("sender_type, content, status, stored_at")
      .eq("conversation_id", conversationId)
      .eq("property_id", propertyId)
      .in("sender_type", ["customer", "agent"])
      .neq("status", "draft")
      .order("stored_at", { ascending: true })
      .limit(20)

    type HistoryRow = { sender_type: string; content: string | null; status: string | null; stored_at: string | null }
    const rows = (history ?? []) as HistoryRow[]
    const turns = rows
      .filter((m) => typeof m.content === "string" && (m.content as string).trim())
      .map((m) => ({
        role: m.sender_type === "customer" ? ("user" as const) : ("assistant" as const),
        content: m.content as string,
      }))

    // Last customer message is the query to answer.
    const lastCustomer = [...rows].reverse().find((m) => m.sender_type === "customer")
    const incoming = (lastCustomer?.content as string) || ""
    if (!incoming.trim()) {
      return NextResponse.json({ error: "Nessun messaggio del cliente a cui rispondere" }, { status: 400 })
    }

    const settings = await getAiSettings(propertyId)
    const result = await generateReply(propertyId, incoming, turns, settings)

    if (!result.answer) {
      return NextResponse.json(
        { text: null, reason: result.reason ?? "no_answer", confidence: result.confidence },
        { status: 200 },
      )
    }
    return NextResponse.json({
      text: result.answer,
      confidence: result.confidence,
      sourceIds: result.usedChunks.map((c) => c.source_id),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 500 })
  }
}

/**
 * DELETE ?draftId= -> discard a stored AI draft.
 */
export async function DELETE(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const draftId = request.nextUrl.searchParams.get("draftId")
    if (!draftId || !UUID.test(draftId)) {
      return NextResponse.json({ error: "draftId non valido" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", draftId)
      .eq("property_id", propertyId)
      .eq("status", "draft")

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 500 })
  }
}
