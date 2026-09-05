import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { richiediOperatore } from "@/lib/inbox/identity"

function pickRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * Resolve every known outbound destination for the contact behind a conversation.
 *
 * The reply composer is intentionally channel-agnostic: an email thread can add
 * WhatsApp, a WhatsApp conversation can add email, and Telegram is offered only
 * when HotelAccelerator has already seen a Telegram chat for the same contact.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const operatore = await richiediOperatore(request)
    const propertyId = operatore.propertyId
    const { conversationId } = await params
    const supabase = createServiceClient()

    const { data: conversation, error } = await supabase
      .from("conversations")
      .select(
        "id, channel, subject, contact_id, contact_email, contact_name, metadata, contact:contacts(id,name,email,phone,whatsapp_id)",
      )
      .eq("property_id", propertyId)
      .eq("id", conversationId)
      .maybeSingle()

    if (error) throw error
    if (!conversation) {
      return NextResponse.json({ error: "Conversazione non trovata." }, { status: 404 })
    }

    let contact = pickRelation<any>((conversation as any).contact)
    let contactId = (conversation as any).contact_id || contact?.id || null

    let email = String(
      contact?.email ||
        (conversation as any).contact_email ||
        (conversation as any).metadata?.email ||
        (conversation as any).metadata?.from ||
        "",
    ).trim()

    let whatsapp = String(
      contact?.whatsapp_id ||
        contact?.phone ||
        (conversation as any).metadata?.phone ||
        (conversation as any).metadata?.from_phone ||
        "",
    ).trim()

    // Imported email conversations are not always linked to contacts yet. When
    // an exact email exists in the tenant address book, bind only for the purpose
    // of destination resolution; this endpoint never mutates the conversation.
    if (!contactId && email) {
      const { data: byEmail } = await supabase
        .from("contacts")
        .select("id,name,email,phone,whatsapp_id")
        .eq("property_id", propertyId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle()

      if (byEmail) {
        contact = byEmail
        contactId = byEmail.id
        email = String(byEmail.email || email).trim()
        whatsapp = String(byEmail.whatsapp_id || byEmail.phone || whatsapp).trim()
      }
    }

    let telegram = String(
      (conversation as any).channel === "telegram"
        ? (conversation as any).metadata?.telegram_chat_id || (conversation as any).metadata?.chat_id || ""
        : "",
    ).trim()

    if (!telegram && contactId) {
      const { data: telegramConversations, error: telegramError } = await supabase
        .from("conversations")
        .select("metadata")
        .eq("property_id", propertyId)
        .eq("channel", "telegram")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(20)

      if (telegramError) throw telegramError

      telegram = String(
        (telegramConversations ?? [])
          .map((row: any) => row.metadata?.telegram_chat_id || row.metadata?.chat_id || "")
          .find((value: string) => String(value).trim()) || "",
      ).trim()
    }

    return NextResponse.json({
      conversationId,
      primaryChannel: (conversation as any).channel,
      subject: (conversation as any).subject || null,
      contact: {
        id: contactId,
        name: contact?.name || (conversation as any).contact_name || null,
      },
      destinations: {
        email: email || null,
        whatsapp: whatsapp || null,
        telegram: telegram || null,
      },
    })
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile risolvere i destinatari della risposta." },
      { status },
    )
  }
}
