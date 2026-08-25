import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { PREZZO_WIDGET_EXTRA_CENTESIMI, getQuotaWidget } from "@/lib/chat-widgets/quota"

/**
 * POST /api/admin/chat-widgets/checkout
 *
 * Avvia il pagamento per UN widget chat aggiuntivo.
 *
 * Ricalcato sul flusso dei numeri WhatsApp extra, gia' in produzione: il
 * pagamento non crea il widget, alza soltanto la quota. Il cliente poi lo crea
 * dal pannello quando vuole, e lo configura con calma.
 *
 * Il prezzo arriva SEMPRE dal server (`PREZZO_WIDGET_EXTRA_CENTESIMI`): se lo
 * accettassimo dal corpo della richiesta, chiunque potrebbe comprarsi un widget
 * per un centesimo modificando la chiamata dal browser.
 */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    const supabase = createServiceClient()
    const { data: struttura } = await supabase
      .from("properties")
      .select("id, name, billing_email")
      .eq("id", propertyId)
      .single()

    if (!struttura) {
      return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })
    }

    const quota = await getQuotaWidget(propertyId)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Widget chat aggiuntivo",
              description:
                "Una chat in piu' da mettere su un altro sito, con basi di conoscenza e aspetto propri.",
            },
            unit_amount: PREZZO_WIDGET_EXTRA_CENTESIMI,
            recurring: { interval: "month" as const },
          },
          quantity: 1,
        },
      ],
      customer_email: struttura.billing_email || undefined,
      metadata: {
        propertyId,
        project: "hotelaccelerator",
        // Questa etichetta e' cio' che il webhook usa per riconoscere l'acquisto:
        // deve restare identica alla stringa attesa la'.
        kind: "chat_widget_extra",
        quantity: "1",
        propertyName: struttura.name,
        // Utile in assistenza: dice quanti widget aveva al momento dell'acquisto.
        widgetPrimaAcquisto: String(quota.limite),
      },
      subscription_data: {
        metadata: { propertyId, kind: "chat_widget_extra", project: "hotelaccelerator" },
      },
      success_url: `${appUrl}/admin/channels/chat?acquisto=ok`,
      cancel_url: `${appUrl}/admin/channels/chat?acquisto=annullato`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      custom_fields: [
        {
          key: "codice_sdi",
          label: { type: "custom", custom: "Codice SDI (se disponibile)" },
          type: "text",
          optional: false,
        },
        {
          key: "pec",
          label: { type: "custom", custom: "PEC (alternativa al Codice SDI)" },
          type: "text",
          optional: true,
        },
      ],
      locale: "it",
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    console.error("[v0] acquisto widget chat: apertura pagamento fallita:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pagamento non avviato" },
      { status: 500 },
    )
  }
}
