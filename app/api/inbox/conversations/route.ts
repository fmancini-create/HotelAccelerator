import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxReadService } from "@/lib/platform-services"
import type { ConversationListOptions, GmailLabel } from "@/lib/types/inbox-read.types"
import { handleServiceError } from "@/lib/errors"

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Inbox conversations API called")

    const propertyId = await getAuthenticatedPropertyId(request)
    console.log("[v0] Property ID:", propertyId)

    const supabase = await createClient()
    const service = new InboxReadService(supabase)

    const { searchParams } = new URL(request.url)

    const mode = (searchParams.get("mode") as "smart" | "gmail") || "smart"
    const gmailLabel = searchParams.get("gmail_label") as GmailLabel | null

    const options: ConversationListOptions = {
      status: (searchParams.get("status") as any) || "open",
      channel: (searchParams.get("channel") as any) || undefined,
      limit: Number.parseInt(searchParams.get("limit") || "50"),
      offset: Number.parseInt(searchParams.get("offset") || "0"),
      search: searchParams.get("search") || undefined,
      filter: (searchParams.get("filter") as any) || undefined,
      mode,
      gmail_label: gmailLabel || undefined,
    }

    console.log("[v0] Inbox options:", options)

    const conversations = await service.listConversations(propertyId, options)
    console.log("[v0] Found conversations:", conversations.length)

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error("[v0] Inbox conversations error:", error)
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)

    const supabase = await createClient()
    const body = await request.json()

    const { channel, contact_id, subject, metadata } = body

    let contactId = contact_id

    if (!contactId && body.contact) {
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("property_id", propertyId)
        .or(`email.eq.${body.contact.email},phone.eq.${body.contact.phone}`)
        .single()

      if (existingContact) {
        contactId = existingContact.id
      } else {
        const { data: newContact, error: contactError } = await supabase
          .from("contacts")
          .insert({ ...body.contact, property_id: propertyId })
          .select()
          .single()

        if (contactError) {
          return NextResponse.json({ error: contactError.message }, { status: 500 })
        }
        contactId = newContact.id
      }
    }

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        channel,
        contact_id: contactId,
        subject,
        metadata: metadata || {},
        property_id: propertyId,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("[v0] Inbox conversations POST error:", error)
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
