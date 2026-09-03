import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteService } from "@/lib/platform-services"
import { handleServiceError, ValidationError } from "@/lib/errors"
import { richiediOperatore } from "@/lib/inbox/identity"
import { registraAttivita, cancellaBozza, rilasciaBlocco } from "@/lib/inbox/collaboration"
import { canAccessChannel, getChannelAccess } from "@/lib/channel-access"

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { conversationId } = await params
    const body = await request.json()
    const { content, sender_type = "agent", content_type = "text", attachments = [], forward_to, forward_subject } = body

    const supabase = await createClient()
    const service = new InboxWriteService(supabase)
    const operatore = await richiediOperatore(request)

    // Visibility and write permission are deliberately separate: a group may
    // need to read a mailbox for supervision without being allowed to answer.
    if (!operatore.isAdmin) {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("channel, channel_id")
        .eq("id", conversationId)
        .eq("property_id", propertyId)
        .maybeSingle()

      if (!conversation?.channel_id) {
        throw new ValidationError("Canale della conversazione non identificato")
      }

      const channelAccess = await getChannelAccess(request)
      const canWrite = await canAccessChannel(
        channelAccess,
        propertyId,
        conversation.channel,
        conversation.channel_id,
        "write",
      )
      if (!canWrite) throw new ValidationError("Non hai il permesso di rispondere su questo canale")
    }

    const message = await service.sendMessage(
      {
        conversationId,
        propertyId,
        content,
        senderType: sender_type,
        contentType: content_type,
        attachments,
        forwardTo: forward_to,
        forwardSubject: forward_subject,
      },
      operatore.titolare.adminUserId ?? undefined,
      operatore.titolare.label,
    )

    const bersaglio = { kind: "conversation" as const, key: conversationId }
    await registraAttivita({
      propertyId,
      bersaglio,
      titolare: operatore.titolare,
      azione: "message_sent",
      dettagli: { messageId: message.id, canale: "multicanale", inoltrato_a: forward_to ?? null },
    })
    await cancellaBozza(propertyId, bersaglio)
    await rilasciaBlocco({ propertyId, bersaglio, titolare: operatore.titolare })

    return NextResponse.json({ message })
  } catch (error) {
    return handleServiceError(error)
  }
}
