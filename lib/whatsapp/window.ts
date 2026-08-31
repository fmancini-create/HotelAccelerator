import type { SupabaseClient } from "@supabase/supabase-js"

export const WHATSAPP_CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000

export interface WhatsAppWindowState {
  isOpen: boolean
  lastInboundAt: string | null
  expiresAt: string | null
  remainingMs: number
}

/**
 * Resolve the 24h WhatsApp customer-care window for one exact tenant
 * conversation. Never use messaging_channels.last_inbound_at here: that field
 * is shared by every guest who writes to the business number and would let one
 * guest accidentally open the window for another.
 */
export async function getWhatsAppWindowState(
  supabase: SupabaseClient,
  propertyId: string,
  conversationId: string,
  now = new Date(),
): Promise<WhatsAppWindowState> {
  const { data, error } = await supabase
    .from("messages")
    .select("received_at, created_at")
    .eq("property_id", propertyId)
    .eq("conversation_id", conversationId)
    .eq("sender_type", "customer")
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) throw error

  let latest = 0
  for (const row of data ?? []) {
    const raw = row.received_at || row.created_at
    if (!raw) continue
    const ts = new Date(raw).getTime()
    if (Number.isFinite(ts) && ts > latest) latest = ts
  }

  if (!latest) {
    return { isOpen: false, lastInboundAt: null, expiresAt: null, remainingMs: 0 }
  }

  const expires = latest + WHATSAPP_CUSTOMER_CARE_WINDOW_MS
  const remainingMs = Math.max(0, expires - now.getTime())
  return {
    isOpen: remainingMs > 0,
    lastInboundAt: new Date(latest).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    remainingMs,
  }
}
