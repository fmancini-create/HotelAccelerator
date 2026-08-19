import { getChatWidgetByPublicKey } from "@/lib/chat-widgets/repository"
import { jsonCors, rispostaPreflight } from "@/lib/chat-widgets/cors"

export const dynamic = "force-dynamic"

/**
 * Configurazione del widget, letta dal sito del cliente prima di disegnarlo.
 *
 * Rotta PUBBLICA e senza sessione: l'unica credenziale e' la chiave nell'URL.
 * Per questo restituisce SOLO cio' che finirebbe comunque a schermo (colori,
 * testi, posizione) e mai `property_id`, l'id interno del canale o le basi di
 * conoscenza collegate: sono informazioni che aiuterebbero soltanto chi cerca
 * di indovinare altri identificativi.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params
  const widget = await getChatWidgetByPublicKey(publicKey)

  // Chiave sconosciuta o rigenerata: 404 senza dettagli, cosi' una chiave
  // tentata a caso non riceve indizi su cosa esista.
  if (!widget) return jsonCors({ error: "Widget non trovato" }, { status: 404 })

  return jsonCors({
    // Lo stato spento non e' un errore: il caricatore lo usa per non disegnare
    // nulla, e il messaggio "offline" resta disponibile per chi vuole mostrarlo.
    isActive: widget.isActive,
    appearance: widget.appearance,
  })
}

export async function OPTIONS() {
  return rispostaPreflight()
}
