import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { richiediOperatore } from "@/lib/inbox/identity"
import { registraAttivita, cancellaBozza, rilasciaBlocco } from "@/lib/inbox/collaboration"

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { conversationId } = await params
    const body = await request.json()

    // `sender_id` NON viene piu' letto dal corpo della richiesta: l'autore di un
    // messaggio non puo' essere dichiarato da chi invia, altrimenti sarebbe
    // possibile firmare una risposta col nome di un collega. Si ricava dalla
    // sessione verificata qui sotto.
    const { content, sender_type = "agent", content_type = "text", attachments = [], forward_to, forward_subject } = body

    const supabase = await createClient()
    const service = new InboxWriteService(supabase)

    // Chi sta scrivendo davvero. Era il pezzo mancante: il servizio salva
    // l'autore dal secondo parametro (`actorId`), che nessuno passava, mentre il
    // campo del corpo veniva ignorato. Per questo in tutto l'archivio i
    // messaggi inviati risultavano senza autore.
    const operatore = await richiediOperatore(request)

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

    // Il messaggio e' partito: la lavorazione e' finita. Va chiuso il ciclo,
    // altrimenti il messaggio resterebbe offuscato per i colleghi anche dopo la
    // risposta, e la bozza appena spedita ricomparirebbe come da completare.
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
