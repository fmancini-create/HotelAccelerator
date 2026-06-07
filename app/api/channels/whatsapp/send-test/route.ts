import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getWhatsAppChannelForProperty } from "@/lib/whatsapp/channels"
import { sendWhatsAppText } from "@/lib/whatsapp/client"

/**
 * Send a test WhatsApp message to validate the tenant's credentials.
 * Note: outside the 24h customer-care window, free-form text is only delivered
 * if the recipient has an open session; otherwise Meta returns an error which
 * we surface to the user.
 */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const { to } = await request.json()
    if (!to || String(to).trim() === "") {
      return NextResponse.json({ error: "Numero destinatario mancante" }, { status: 400 })
    }

    const channel = await getWhatsAppChannelForProperty(supabase, propertyId)
    if (!channel) {
      return NextResponse.json({ error: "Nessun canale WhatsApp configurato" }, { status: 400 })
    }

    const result = await sendWhatsAppText(
      channel.config,
      channel.credentials,
      String(to),
      "Messaggio di test da HotelAccelerator. La configurazione WhatsApp funziona correttamente.",
    )

    if (!result.success) {
      await supabase
        .from("messaging_channels")
        .update({ last_error: result.error ?? "Errore invio test" })
        .eq("id", channel.id)
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    await supabase
      .from("messaging_channels")
      .update({ last_outbound_at: new Date().toISOString(), last_error: null })
      .eq("id", channel.id)

    return NextResponse.json({ success: true, externalMessageId: result.externalMessageId })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
