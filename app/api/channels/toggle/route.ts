import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

/** Accende/spegne un canale di comunicazione dalla scheda /admin/channels. */
type ChannelId =
  | "email"
  | "chat"
  | "whatsapp"
  | "telegram"
  | "phone"
  | "facebook"
  | "instagram"
  | "twitter"
  | "linkedin"

const SUPPORTED: ChannelId[] = [
  "email",
  "chat",
  "whatsapp",
  "telegram",
  "phone",
  "facebook",
  "instagram",
  "twitter",
  "linkedin",
]

const MESSAGING_CHANNEL_TYPE: Partial<Record<ChannelId, string>> = {
  whatsapp: "whatsapp",
  telegram: "telegram",
  facebook: "messenger",
  instagram: "instagram",
  twitter: "x",
  linkedin: "linkedin",
}

export async function POST(request: NextRequest) {
  let propertyId: string
  try {
    propertyId = await getAuthenticatedPropertyId(request)
  } catch {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { channel?: string; enabled?: unknown }
  const channel = body.channel as ChannelId | undefined
  const enabled = body.enabled
  if (!channel || !SUPPORTED.includes(channel)) return NextResponse.json({ error: "Canale non supportato" }, { status: 400 })
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "Stato non valido" }, { status: 400 })

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  try {
    let updated = 0
    if (channel === "email") {
      const { data, error } = await supabase.from("email_channels").update({ is_active: enabled, updated_at: now }).eq("property_id", propertyId).select("id")
      if (error) throw error
      updated = data?.length ?? 0
    } else if (MESSAGING_CHANNEL_TYPE[channel]) {
      const { data, error } = await supabase
        .from("messaging_channels")
        .update({ is_active: enabled, updated_at: now })
        .eq("property_id", propertyId)
        .eq("channel_type", MESSAGING_CHANNEL_TYPE[channel])
        .select("id")
      if (error) throw error
      updated = data?.length ?? 0
    } else if (channel === "chat") {
      const { data, error } = await supabase.from("embed_scripts").update({ status: enabled ? "active" : "paused", updated_at: now }).eq("property_id", propertyId).select("id")
      if (error) throw error
      updated = data?.length ?? 0
    } else {
      const { data, error } = await supabase.from("telephony_integrations").update({ is_active: enabled, updated_at: now }).eq("property_id", propertyId).select("id")
      if (error) throw error
      updated = data?.length ?? 0
    }

    if (updated === 0) {
      return NextResponse.json({ error: "Nessuna connessione da modificare per questo canale" }, { status: 404 })
    }
    return NextResponse.json({ ok: true, channel, enabled, updated })
  } catch (error) {
    console.error("[v0] toggle canale fallito:", channel, error)
    return NextResponse.json({ error: "Modifica non riuscita" }, { status: 500 })
  }
}
