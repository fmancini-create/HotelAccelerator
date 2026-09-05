import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { richiediOperatore } from "@/lib/inbox/identity"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { applyContactAccess, canReadContactRecord, resolveContactAccess } from "@/lib/crm/contact-access"

/**
 * Recipient lookup for the Inbox composer. The address book is tenant-scoped,
 * but private/group contacts keep the same visibility here as in the CRM.
 */
export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await richiediOperatore(request)
    const identity = await getCallerIdentity(request)
    if (!identity) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })

    const q = request.nextUrl.searchParams.get("q")?.trim() || ""
    const channel = request.nextUrl.searchParams.get("channel")?.trim() || "email"
    const safe = q.replace(/[,%()]/g, " ").trim()
    const supabase = createServiceClient()
    const access = await resolveContactAccess(supabase, { ...identity, propertyId })

    if (channel === "telegram") {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, contact_name, last_message_at, metadata, contact:contacts(id,name,email,phone,whatsapp_id,visibility_scope,owner_user_id)",
        )
        .eq("property_id", propertyId)
        .eq("channel", "telegram")
        .order("last_message_at", { ascending: false })
        .limit(80)
      if (error) throw error

      const needle = safe.toLowerCase()
      const seen = new Set<string>()
      const contacts = (data ?? [])
        .map((row: any) => {
          const chatId = String(row.metadata?.telegram_chat_id || row.metadata?.chat_id || "").trim()
          const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact
          if (contact && !canReadContactRecord(contact, access)) return null
          return {
            id: contact?.id || `telegram:${chatId}`,
            name: contact?.name || row.contact_name || `Telegram ${chatId}`,
            email: contact?.email || null,
            phone: contact?.phone || null,
            whatsapp_id: contact?.whatsapp_id || null,
            telegram_chat_id: chatId || null,
          }
        })
        .filter(Boolean)
        .filter((item: any) => {
          if (!item.telegram_chat_id || seen.has(item.telegram_chat_id)) return false
          seen.add(item.telegram_chat_id)
          if (!needle) return true
          return [item.name, item.telegram_chat_id, item.phone, item.email]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle))
        })
        .slice(0, 20)

      return NextResponse.json({ contacts })
    }

    let query = applyContactAccess(
      supabase
        .from("contacts")
        .select("id, name, email, phone, whatsapp_id")
        .eq("property_id", propertyId)
        .order("updated_at", { ascending: false })
        .limit(20),
      access,
    )

    if (safe) {
      query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,whatsapp_id.ilike.%${safe}%`)
    }

    const { data, error } = await query
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
