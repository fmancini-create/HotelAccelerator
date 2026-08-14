import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getBasesForChannel, setChannelBases } from "@/lib/ai/knowledge-bases"
import { deleteChatWidget, getChatWidget, updateChatWidget } from "@/lib/chat-widgets/repository"
import { getQuotaWidget } from "@/lib/chat-widgets/quota"
import { valutaContrasto } from "@/lib/chat-widgets/appearance"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)

    const widget = await getChatWidget(id, propertyId)
    if (!widget) return NextResponse.json({ error: "Widget non trovato" }, { status: 404 })

    const risolte = await getBasesForChannel(widget.id)
    return NextResponse.json({
      widget,
      // La primaria e' la PRIMA della lista ordinata: decide modalita', soglia e
      // tono. Le altre servono solo al recupero delle informazioni.
      primaryBaseId: risolte.primary?.id ?? null,
      additionalBaseIds: risolte.bases.slice(1).map((b) => b.id),
      resolvedMode: risolte.primary?.mode ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}

interface CorpoModifica {
  name?: string
  siteUrl?: string | null
  isActive?: boolean
  appearance?: Record<string, unknown>
  primaryBaseId?: string | null
  additionalBaseIds?: string[]
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = (await request.json().catch(() => ({}))) as CorpoModifica

    const attuale = await getChatWidget(id, propertyId)
    if (!attuale) return NextResponse.json({ error: "Widget non trovato" }, { status: 404 })

    // Riaccendere un widget consuma quota: senza questo controllo si potrebbe
    // superare il limite spegnendo e riaccendendo.
    if (body.isActive === true && !attuale.isActive) {
      const quota = await getQuotaWidget(propertyId)
      if (!quota.puoCrearne) {
        return NextResponse.json(
          {
            error: `Non puoi riattivare questo widget: hai gia' ${quota.usati} widget attivi su ${quota.limite} disponibili.`,
            code: "quota_esaurita",
            quota,
          },
          { status: 402 },
        )
      }
    }

    // Il contrasto si controlla QUI e non solo nel pannello: chi configura
    // guarda il pannello, non il sito, e una testata illeggibile non la vede.
    if (body.appearance) {
      const primario = String(body.appearance.primaryColor ?? attuale.appearance.primaryColor)
      const testo = String(body.appearance.textColor ?? attuale.appearance.textColor)
      const esito = valutaContrasto(primario, testo)
      if (!esito.leggibile) {
        return NextResponse.json(
          {
            error: `Il testo non sarebbe leggibile sul colore scelto (contrasto ${esito.rapporto}:1, serve almeno 4.5:1). Usa ${esito.consigliato === "#ffffff" ? "il bianco" : "il nero"} come colore del testo, oppure scegli un colore principale piu' ${esito.consigliato === "#ffffff" ? "scuro" : "chiaro"}.`,
            code: "contrasto_insufficiente",
            contrasto: esito,
          },
          { status: 400 },
        )
      }
    }

    const widget = await updateChatWidget(id, propertyId, {
      name: body.name,
      siteUrl: body.siteUrl,
      isActive: body.isActive,
      appearance: body.appearance,
    })

    // Le basi si salvano solo se il corpo le menziona: un PATCH del solo colore
    // non deve azzerare la conoscenza collegata.
    if (body.primaryBaseId !== undefined || body.additionalBaseIds !== undefined) {
      const primaria = body.primaryBaseId ?? null
      const aggiuntive = (body.additionalBaseIds ?? []).filter((b) => UUID.test(b))
      if (primaria !== null && !UUID.test(primaria)) {
        return NextResponse.json({ error: "Base primaria non valida" }, { status: 400 })
      }
      // Ordine = posizione: la primaria in testa. La funzione di database fa
      // cancellazione e inserimento in UNA transazione, cosi' un inserimento
      // fallito non lascia il widget senza conoscenza (muto) con un messaggio
      // d'errore generico.
      const ordinate = primaria ? [primaria, ...aggiuntive.filter((b) => b !== primaria)] : []
      await setChannelBases(widget.id, ordinate, propertyId)
    }

    const risolte = await getBasesForChannel(widget.id)
    return NextResponse.json({
      widget,
      primaryBaseId: risolte.primary?.id ?? null,
      additionalBaseIds: risolte.bases.slice(1).map((b) => b.id),
      resolvedMode: risolte.primary?.mode ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)

    const attuale = await getChatWidget(id, propertyId)
    if (!attuale) return NextResponse.json({ error: "Widget non trovato" }, { status: 404 })

    await deleteChatWidget(id, propertyId)
    return NextResponse.json({ ok: true, quota: await getQuotaWidget(propertyId) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}
