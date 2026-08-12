import type { SupabaseClient } from "@supabase/supabase-js"
import type { TelegramChannelRow } from "./types"
import type { InboundTelegramMessage } from "./processor"
import { decryptTelegramCredentials } from "./channel-secrets"

/**
 * DUAL-READ: decrypt the secrets nested in `credentials` of a channel just read
 * from the DB. Leaves `config` and every other field untouched.
 */
function withDecryptedCredentials<T extends TelegramChannelRow | null>(channel: T): T {
  if (!channel) return channel
  return {
    ...channel,
    credentials: decryptTelegramCredentials(channel.credentials),
  }
}

/**
 * Resolve the Telegram channel for an incoming webhook by the messaging_channels
 * row id carried in the webhook path (`/webhook/[botId]`). This makes inbound
 * routing multitenant: each tenant has its own bot mapped to its own channel.
 */
export async function getTelegramChannelById(
  supabase: SupabaseClient,
  channelId: string,
): Promise<TelegramChannelRow | null> {
  const { data } = await supabase
    .from("messaging_channels")
    .select("*")
    .eq("id", channelId)
    .eq("channel_type", "telegram")
    .eq("is_active", true)
    .maybeSingle()
  return withDecryptedCredentials((data as TelegramChannelRow) ?? null)
}

/**
 * Fetch a Telegram channel by id scoped to a property (so a tenant can never
 * send through another tenant's bot).
 */
export async function getTelegramChannelByIdForProperty(
  supabase: SupabaseClient,
  propertyId: string,
  channelId: string,
): Promise<TelegramChannelRow | null> {
  const { data } = await supabase
    .from("messaging_channels")
    .select("*")
    .eq("id", channelId)
    .eq("channel_type", "telegram")
    .eq("property_id", propertyId)
    .maybeSingle()
  return withDecryptedCredentials((data as TelegramChannelRow) ?? null)
}

/**
 * Get the DEFAULT active Telegram channel for a property (fallback for outbound
 * sends when a conversation has no specific channel pinned).
 */
export async function getTelegramChannelForProperty(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<TelegramChannelRow | null> {
  const { data } = await supabase
    .from("messaging_channels")
    .select("*")
    .eq("channel_type", "telegram")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return withDecryptedCredentials((data as TelegramChannelRow) ?? null)
}

/**
 * Resolve the Telegram channel to use when replying to a conversation. Prefers
 * the channel the conversation came in on (`metadata.messaging_channel_id`),
 * falling back to the property's default channel.
 */
export async function getTelegramChannelForConversation(
  supabase: SupabaseClient,
  propertyId: string,
  conversation: { metadata?: { messaging_channel_id?: string | null } | null } | null,
): Promise<TelegramChannelRow | null> {
  const pinnedId = conversation?.metadata?.messaging_channel_id
  if (pinnedId) {
    const pinned = await getTelegramChannelByIdForProperty(supabase, propertyId, pinnedId)
    if (pinned && pinned.is_active) return pinned
  }
  return getTelegramChannelForProperty(supabase, propertyId)
}

/**
 * List all Telegram channels for a property (active first, oldest first).
 */
export async function listTelegramChannelsForProperty(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<TelegramChannelRow[]> {
  const { data } = await supabase
    .from("messaging_channels")
    .select("*")
    .eq("channel_type", "telegram")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true })
  return ((data as TelegramChannelRow[]) ?? []).map((row) => withDecryptedCredentials(row))
}

interface ParsedTelegramUpdate {
  messages: InboundTelegramMessage[]
}

/**
 * Parse a Telegram webhook update into a flat list of inbound messages.
 * Tolerant of edited messages and non-text content (mapped to a placeholder).
 */
export function parseTelegramUpdate(body: any): ParsedTelegramUpdate {
  const result: ParsedTelegramUpdate = { messages: [] }
  if (!body || typeof body !== "object") return result

  const msg = body.message ?? body.edited_message
  if (!msg || !msg.chat) return result

  const chatId = String(msg.chat.id)
  const messageId = String(msg.message_id)
  const from = msg.from ?? {}
  const name =
    [from.first_name, from.last_name].filter(Boolean).join(" ").trim() ||
    from.username ||
    msg.chat.title ||
    `Telegram ${chatId}`
  const tsSeconds = Number(msg.date ?? 0)

  result.messages.push({
    // message_id is unique per chat, not globally — combine with chat id.
    externalId: `tg:${chatId}:${messageId}`,
    chatId,
    fromName: name,
    username: from.username || undefined,
    languageCode: from.language_code || undefined,
    body: extractBody(msg),
    messageType: detectType(msg),
    timestamp: tsSeconds ? new Date(tsSeconds * 1000) : new Date(),
    raw: msg,
  })

  return result
}

function detectType(m: any): string {
  if (m.text) return "text"
  if (m.photo) return "image"
  if (m.voice) return "audio"
  if (m.audio) return "audio"
  if (m.video) return "video"
  if (m.document) return "document"
  if (m.location) return "location"
  if (m.contact) return "contact"
  if (m.sticker) return "sticker"
  return "unknown"
}

function extractBody(m: any): string {
  if (m.text) return m.text
  if (m.caption) return m.caption
  switch (detectType(m)) {
    case "image":
      return "[immagine]"
    case "audio":
      return "[messaggio vocale]"
    case "video":
      return "[video]"
    case "document":
      return m.document?.file_name ? `[documento] ${m.document.file_name}` : "[documento]"
    case "location":
      return "[posizione]"
    case "contact":
      return "[contatto]"
    case "sticker":
      return m.sticker?.emoji ? `[sticker] ${m.sticker.emoji}` : "[sticker]"
    default:
      return "[messaggio non testuale]"
  }
}
