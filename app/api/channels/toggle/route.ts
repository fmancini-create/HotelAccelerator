import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"

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
  "email", "chat", "whatsapp", "telegram", "phone",
  "facebook", "instagram", "twitter", "linkedin",
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
  const body = (await request.json().catch(() => ({}))) as { channel?: string; enabled?: unknown }
  const channel = body.channel as ChannelId | undefined
  const enabled = body.enabled
  if (!channel || !SUPPORTED.includes(channel)) return NextResponse.json({ error: "Canale non supportato" }, { status: 400 })
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "Stato non valido" }, { status: 400 })

  let propertyId: string
  try {
    // La scelta/attivazione del PBX e una impostazione amministrativa. Un
    // operatore che puo usare CRM/chiamate non deve poter cambiare centralino.
    if (channel === "phone") {
      const identity = await requireTenantAdmin(request)
      propertyId = identity.propertyId
    } else {
      propertyId = await getAuthenticatedPropertyId(request)
    }
  } catch (error) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: accessErrorStatus(error) || 401 })
  }

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
      if (!enabled) {
        // Spegni SOLO quello attivo. Aggiornare tutte le righe avrebbe reso
        // ambiguo quale provider ripristinare e, riaccendendo, violerebbe il
        // vincolo di un solo PBX attivo per tenant.
        const { data, error } = await supabase
          .from("telephony_integrations")
          .update({ is_active: false, updated_at: now })
          .eq("property_id", propertyId)
          .eq("is_active", true)
          .select("id")
        if (error) throw error
        updated = data?.length ?? 0
      } else {
        const { data: selected, error: selectedError } = await supabase
          .from("telephony_integrations")
          .select("id, provider")
          .eq("property_id", propertyId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (selectedError) throw selectedError
        if (!selected) return NextResponse.json({ error: "Prima scegli e configura un centralino." }, { status: 404 })
        const { data, error } = await supabase
          .from("telephony_integrations")
          .update({ is_active: true, updated_at: now })
          .eq("id", selected.id)
          .eq("property_id", propertyId)
          .select("id")
        if (error) throw error
        updated = data?.length ?? 0
      }
    }

    if (updated === 0) return NextResponse.json({ error: "Nessuna connessione da modificare per questo canale" }, { status: 404 })
    return NextResponse.json({ ok: true, channel, enabled, updated })
  } catch (error) {
    console.error("[channels] toggle fallito:", channel, error)
    return NextResponse.json({ error: "Modifica non riuscita" }, { status: 500 })
  }
}
