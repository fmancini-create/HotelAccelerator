import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { richiediOperatore } from "@/lib/inbox/identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TERMINAL = new Set([
  "sent",
  "declined",
  "failed_template",
  "failed_delivery",
  "delivery_unknown",
  "expired",
])

export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await richiediOperatore(request)
    const pendingId = request.nextUrl.searchParams.get("pendingId")?.trim() || ""

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pendingId)) {
      return NextResponse.json({ error: "Richiesta WhatsApp non valida." }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("whatsapp_pending_messages")
      .select("id, status, last_error, created_at, updated_at")
      .eq("id", pendingId)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: "Richiesta WhatsApp non trovata per questa struttura." }, { status: 404 })
    }

    return NextResponse.json({
      id: data.id,
      status: data.status,
      error: data.last_error,
      terminal: TERMINAL.has(data.status),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    })
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile leggere lo stato WhatsApp." },
      { status },
    )
  }
}
