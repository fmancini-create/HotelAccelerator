import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { leggiOperatore } from "@/lib/inbox/identity"

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
    const operatore = await leggiOperatore(request)

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
      operatore.adminUserId ?? undefined,
      operatore.label,
    )

    return NextResponse.json({ message })
  } catch (error) {
    return handleServiceError(error)
  }
}
