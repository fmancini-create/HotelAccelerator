import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { rigeneraChiaveWidget } from "@/lib/chat-widgets/repository"

export const dynamic = "force-dynamic"

/**
 * Rigenera la chiave pubblica del widget.
 *
 * Serve quando lo snippet e' finito dove non doveva (un sito dismesso, un
 * fornitore che non collabora piu'). Da quel momento il vecchio snippet smette
 * di funzionare: e' l'intento, e va detto in chiaro nel pannello.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const widget = await rigeneraChiaveWidget(id, propertyId)
    return NextResponse.json({ widget })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : message.includes("non trovato") ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
