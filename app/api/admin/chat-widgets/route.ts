import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getBasesForChannel } from "@/lib/ai/knowledge-bases"
import { conteggioConversazioniPerWidget, createChatWidget, listChatWidgets } from "@/lib/chat-widgets/repository"
import { getQuotaWidget } from "@/lib/chat-widgets/quota"

export const dynamic = "force-dynamic"

/** Elenco dei widget della struttura, con basi collegate, uso e quota. */
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const [widgets, quota] = await Promise.all([listChatWidgets(propertyId), getQuotaWidget(propertyId)])

    const conteggi = await conteggioConversazioniPerWidget(
      propertyId,
      widgets.map((w) => w.id),
    )

    // Le basi collegate a ciascun widget: nel pannello si vede subito quale
    // widget risponde con quale conoscenza, senza aprirli uno per uno.
    const conBasi = await Promise.all(
      widgets.map(async (w) => {
        const risolte = await getBasesForChannel(w.id)
        return {
          ...w,
          conversations: conteggi[w.id] ?? 0,
          primaryBase: risolte.primary ? { id: risolte.primary.id, name: risolte.primary.name, mode: risolte.primary.mode } : null,
          additionalBases: risolte.bases.slice(1).map((b) => ({ id: b.id, name: b.name })),
        }
      }),
    )

    return NextResponse.json({ widgets: conBasi, quota })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}

/** Crea un widget. Rifiuta con 402 quando la quota e' esaurita. */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = (await request.json().catch(() => ({}))) as { name?: string; siteUrl?: string | null }

    const nome = String(body.name ?? "").trim()
    if (!nome) return NextResponse.json({ error: "Il nome del widget e' obbligatorio" }, { status: 400 })

    // Il controllo sta PRIMA della creazione: creare e poi accorgersi del limite
    // lascerebbe un widget a metà, contato ma non pagato.
    const quota = await getQuotaWidget(propertyId)
    if (!quota.puoCrearne) {
      return NextResponse.json(
        {
          error: `Hai raggiunto il limite di ${quota.limite} widget attivi (${quota.inclusi} inclusi nel piano${quota.extra > 0 ? ` + ${quota.extra} acquistati` : ""}). Puoi aggiungere un widget extra oppure spegnere o eliminare uno di quelli esistenti.`,
          code: "quota_esaurita",
          quota,
        },
        { status: 402 },
      )
    }

    const widget = await createChatWidget(propertyId, { name: nome, siteUrl: body.siteUrl ?? null })
    return NextResponse.json({ widget, quota: await getQuotaWidget(propertyId) }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}
