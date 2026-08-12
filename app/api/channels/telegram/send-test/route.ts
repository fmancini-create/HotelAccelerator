import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getTelegramChannelForProperty } from "@/lib/telegram/channels"
import { sendTelegramText } from "@/lib/telegram/client"

/**
 * Send a test Telegram message to validate the tenant's bot configuration.
 * The recipient chat id must have started the bot at least once (Telegram bots
 * cannot initiate chats with users who never contacted them).
 */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const { to } = await request.json()
    if (!to || String(to).trim() === "") {
      return NextResponse.json({ error: "Chat ID destinatario mancante" }, { status: 400 })
    }

    const channel = await getTelegramChannelForProperty(supabase, propertyId)
    if (!channel) {
      return NextResponse.json({ error: "Nessun canale Telegram configurato" }, { status: 400 })
    }

    const result = await sendTelegramText(
      channel.credentials,
      String(to).trim(),
      "Messaggio di test da HotelAccelerator. La configurazione Telegram funziona correttamente.",
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
