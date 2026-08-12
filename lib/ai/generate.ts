import "server-only"
import { generateText } from "ai"
import { CHAT_MODEL } from "./config"
import { retrieveContext, type RetrievedChunk } from "./retrieval"
import { getAiSettings, type AiAgentSettings } from "./settings"

export interface ConversationTurn {
  role: "user" | "assistant"
  content: string
}

export interface GenerateReplyResult {
  answer: string | null
  confidence: number
  usedChunks: RetrievedChunk[]
  reason?: "no_match" | "low_confidence" | "ok"
}

function buildSystemPrompt(settings: AiAgentSettings, context: string): string {
  const persona =
    settings.persona?.trim() ||
    "Sei l'assistente virtuale di una struttura ricettiva. Rispondi in modo cortese, professionale e conciso."

  return [
    persona,
    "",
    "REGOLE FONDAMENTALI:",
    `- Rispondi SEMPRE nella lingua del cliente (lingua predefinita: ${settings.language}).`,
    "- Usa ESCLUSIVAMENTE le informazioni presenti nella BASE DI CONOSCENZA qui sotto.",
    "- Se la base di conoscenza non contiene la risposta, NON inventare: dillo educatamente e proponi di mettere in contatto con lo staff.",
    "- Non citare l'esistenza della 'base di conoscenza' né dei 'frammenti': rispondi in modo naturale.",
    "- Sii breve e diretto; adatto a messaggistica (Telegram/WhatsApp) o email.",
    "",
    "BASE DI CONOSCENZA:",
    context || "(nessuna informazione disponibile)",
  ].join("\n")
}

/**
 * Generate a grounded reply for an incoming customer message.
 *
 * Returns `answer: null` (with a reason) when there is no relevant knowledge or
 * the best match is below the tenant's confidence threshold — the caller then
 * decides whether to stay silent, post the fallback, or leave it to a human.
 * This is the guardrail against the AI inventing answers.
 */
export async function generateReply(
  propertyId: string,
  incomingMessage: string,
  history: ConversationTurn[] = [],
  settingsOverride?: AiAgentSettings,
): Promise<GenerateReplyResult> {
  const settings = settingsOverride ?? (await getAiSettings(propertyId))

  const chunks = await retrieveContext(propertyId, incomingMessage, {
    minSimilarity: 0, // fetch top matches, then judge with threshold below
  })

  const topSimilarity = chunks.length > 0 ? chunks[0].similarity : 0

  if (chunks.length === 0) {
    return { answer: null, confidence: 0, usedChunks: [], reason: "no_match" }
  }
  if (topSimilarity < settings.confidence_threshold) {
    return { answer: null, confidence: topSimilarity, usedChunks: chunks, reason: "low_confidence" }
  }

  const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n")

  const { text } = await generateText({
    model: CHAT_MODEL,
    system: buildSystemPrompt(settings, context),
    messages: [
      ...history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: incomingMessage },
    ],
  })

  return {
    answer: text.trim(),
    confidence: topSimilarity,
    usedChunks: chunks,
    reason: "ok",
  }
}
