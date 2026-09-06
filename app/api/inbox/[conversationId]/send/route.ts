import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { richiediOperatore } from "@/lib/inbox/identity"
import { registraAttivita, cancellaBozza } from "@/lib/inbox/collaboration"
import { assicuraAccessoScrittura, concludiLavorazioneDopoInvio } from "@/lib/inbox/coassignment"
import { sendFederatedSupportReply } from "@/lib/support-federation/outbound"

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { conversationId } = await params
    const body = await request.json()
    const { content, sender_type = "agent", content_type = "text", attachments = [], forward_to, forward_subject } = body

    const supabase = await createClient()
    const service = new InboxWriteService(supabase)
    const operatore = await richiediOperatore(request)
    const bersaglio = { kind: "conversation" as const, key: conversationId }

    // Il blocco e' una regola server-side, non soltanto un accorgimento grafico.
    // Se un altro operatore sta lavorando la conversazione, l'invio viene
    // rifiutato salvo coassegnazione esplicita ancora legata al lock attivo.
    const accesso = await assicuraAccessoScrittura({
      propertyId,
      target: bersaglio,
      actor: operatore.titolare,
    })

    const federatedMessage = await sendFederatedSupportReply({
      conversationId,
      propertyId,
      content,
      actorName: operatore.titolare.label,
      actorId: operatore.titolare.adminUserId,
    })

    const message = federatedMessage ?? await service.sendMessage(
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

    await registraAttivita({
      propertyId,
      bersaglio,
      titolare: operatore.titolare,
      azione: "message_sent",
      dettagli: {
        messageId: message.id,
        canale: federatedMessage ? "suite_support" : "multicanale",
        inoltrato_a: forward_to ?? null,
        collaboration_role: accesso.role,
      },
    })
    await cancellaBozza(propertyId, bersaglio)
    await concludiLavorazioneDopoInvio({
      propertyId,
      target: bersaglio,
      actor: operatore.titolare,
      holderKey: accesso.holderKey,
    })

    return NextResponse.json({ message })
  } catch (error) {
    return handleServiceError(error)
  }
}
