import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { richiediOperatore } from "@/lib/inbox/identity"

/**
 * Minimal contact lookup for the Inbox composer. It deliberately does not use
 * the CRM API: Inbox is a baseline area and an operator may be allowed to send
 * messages without being granted the full CRM section.
 */
export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await richiediOperatore(request)
    const q = request.nextUrl.searchParams.get("q")?.trim() || ""
    if (q.length < 2) return NextResponse.json({ contacts: [] })

    const safe = q.replace(/[,%()]/g, " ").trim()
    if (!safe) return NextResponse.json({ contacts: [] })

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, email, phone, whatsapp_id")
      .eq("property_id", propertyId)
      .or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,whatsapp_id.ilike.%${safe}%`)
      .order("updated_at", { ascending: false })
      .limit(12)

    if (error) throw error
    return NextResponse.json({ contacts: data ?? [] })
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ricerca contatti non riuscita" },
      { status },
    )
  }
}
