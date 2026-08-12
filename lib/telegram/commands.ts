import type { TelegramChannelRow } from "./types"

/**
 * Rule-based autopilot for the Telegram channel (Layer 2).
 *
 * This is the deterministic layer that runs BEFORE any AI brain: it handles
 * slash commands and a welcome message. The real conversational AI lives in
 * ManuBot (separate repo) and will be wired through `requestManubotReply` in a
 * later step — this file is the single seam where that connection lands.
 */

export interface AutopilotDecision {
  /** Text to send back to the guest, or null to stay silent (hand off to inbox). */
  reply: string | null
  /** Why we replied (for logs/telemetry). */
  reason: "command_start" | "command_help" | "command_unknown" | "silent"
}

const HELP_TEXT = [
  "Ecco cosa posso fare:",
  "",
  "/start – messaggio di benvenuto",
  "/help – mostra questo aiuto",
  "",
  "Scrivi pure la tua richiesta: un membro del nostro staff ti risponderà al più presto.",
].join("\n")

function welcomeText(channel: TelegramChannelRow): string {
  const name = channel.display_name?.trim()
  const who = name ? ` di ${name}` : ""
  return [
    `Ciao! Sono l'assistente${who}.`,
    "",
    "Puoi scrivermi qui la tua richiesta e ti aiuteremo il prima possibile.",
    "Digita /help per vedere i comandi disponibili.",
  ].join("\n")
}

/**
 * Decide the rule-based reply for an inbound Telegram text.
 *
 * Only runs when autopilot is enabled on the channel. Slash commands always get
 * a deterministic answer; any other message stays silent here so it lands in the
 * operator inbox (until the ManuBot brain is connected).
 */
export function computeAutopilotReply(text: string, channel: TelegramChannelRow): AutopilotDecision {
  const trimmed = (text || "").trim()
  const lower = trimmed.toLowerCase()

  // Telegram commands can arrive as "/start@botname" in groups.
  const command = lower.startsWith("/") ? lower.split(/[\s@]/)[0] : null

  if (command === "/start") {
    return { reply: welcomeText(channel), reason: "command_start" }
  }
  if (command === "/help") {
    return { reply: HELP_TEXT, reason: "command_help" }
  }
  if (command) {
    return {
      reply: "Comando non riconosciuto. Digita /help per l'elenco dei comandi.",
      reason: "command_unknown",
    }
  }

  // Non-command messages: stay silent (operator handles it in the inbox).
  return { reply: null, reason: "silent" }
}

/**
 * FUTURE SEAM — conversational AI brain (ManuBot).
 *
 * When ManuBot exposes a conversational endpoint, this is where an inbound guest
 * message gets forwarded and a natural-language reply returned. For now it is a
 * no-op returning null, so the channel gracefully falls back to the operator
 * inbox. Kept as an explicit function so wiring the brain is a one-file change.
 */
export async function requestManubotReply(_params: {
  propertyId: string
  channel: TelegramChannelRow
  conversationId: string
  contactId: string
  text: string
}): Promise<string | null> {
  return null
}
