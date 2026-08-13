import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

/**
 * Accende/spegne un canale di comunicazione dalla scheda in /admin/channels.
 *
 * Perche' una rotta server e non un update dal browser: le tabelle dei canali
 * contengono credenziali (token dei bot, chiavi email) e sono chiuse al ruolo
 * anonimo. Un update dal client verrebbe scartato dalle policy e la scheda
 * mostrerebbe "fatto" senza aver cambiato nulla.
 *
 * Ogni canale ha la propria rappresentazione dello stato, verificata sullo
 * schema reale e NON supposta:
 *   email     -> email_channels.is_active
 *   whatsapp  -> messaging_channels.is_active (channel_type = 'whatsapp')
 *   telegram  -> messaging_channels.is_active (channel_type = 'telegram')
 *   chat      -> embed_scripts.status: la tabella NON ha is_active, e il CHECK
 *                ammette solo 'draft' | 'active' | 'paused', quindi spento =
 *                'paused' ('inactive' sarebbe stato RIFIUTATO dal vincolo).
 *   phone     -> telephony_integrations.is_active
 */

type ChannelId = "email" | "chat" | "whatsapp" | "telegram" | "phone"

const SUPPORTED: ChannelId[] = ["email", "chat", "whatsapp", "telegram", "phone"]

export async function POST(request: NextRequest) {
  // getAuthenticatedPropertyId LANCIA quando la sessione manca: senza questo
  // try un utente non autenticato riceverebbe un 500 invece di un 401.
  let propertyId: string
  try {
    propertyId = await getAuthenticatedPropertyId(request)
  } catch {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { channel?: string; enabled?: unknown }
  const channel = body.channel as ChannelId | undefined
  const enabled = body.enabled

  if (!channel || !SUPPORTED.includes(channel)) {
    return NextResponse.json({ error: "Canale non supportato" }, { status: 400 })
  }
  // Solo booleano: una stringa "false" sarebbe "truthy" e accenderebbe il
  // canale mentre l'utente lo sta spegnendo.
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Stato non valido" }, { status: 400 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  try {
    let updated = 0

    if (channel === "email") {
      const { data, error } = await supabase
        .from("email_channels")
        .update({ is_active: enabled, updated_at: now })
        .eq("property_id", propertyId)
        .select("id")
      if (error) throw error
      updated = data?.length ?? 0
    } else if (channel === "whatsapp" || channel === "telegram") {
      const { data, error } = await supabase
        .from("messaging_channels")
        .update({ is_active: enabled, updated_at: now })
        .eq("property_id", propertyId)
        .eq("channel_type", channel)
        .select("id")
      if (error) throw error
      updated = data?.length ?? 0
    } else if (channel === "chat") {
      const { data, error } = await supabase
        .from("embed_scripts")
        .update({ status: enabled ? "active" : "paused", updated_at: now })
        .eq("property_id", propertyId)
        .select("id")
      if (error) throw error
      updated = data?.length ?? 0
    } else {
      const { data, error } = await supabase
        .from("telephony_integrations")
        .update({ is_active: enabled, updated_at: now })
        .eq("property_id", propertyId)
        .select("id")
      if (error) throw error
      updated = data?.length ?? 0
    }

    // Zero righe = nessuna connessione configurata: NON e' un successo, altrimenti
    // la scheda mostrerebbe "Attivo" per un canale che non esiste.
    if (updated === 0) {
      return NextResponse.json(
        { error: "Nessuna connessione da modificare per questo canale" },
        { status: 404 },
      )
    }

    return NextResponse.json({ ok: true, channel, enabled, updated })
  } catch (error) {
    console.error("[v0] toggle canale fallito:", channel, error)
    return NextResponse.json({ error: "Modifica non riuscita" }, { status: 500 })
  }
}
