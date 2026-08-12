import "server-only"
import { generateText } from "ai"
import { CHAT_MODEL, DEFAULT_CONFIDENCE_THRESHOLD } from "./config"
import { retrieveContext, type RetrievedChunk } from "./retrieval"

export interface ConversationTurn {
  role: "user" | "assistant"
  content: string
}

export interface GenerateReplyResult {
  answer: string | null
  confidence: number
  usedChunks: RetrievedChunk[]
  reason?: "no_match" | "low_confidence" | "ok" | "conversational"
}

/**
 * Resolved AI config for a reply. `baseIds` scopes retrieval across every
 * knowledge base linked to the channel; persona/language/threshold come from
 * the primary base.
 */
export interface ReplyConfig {
  baseIds: string[]
  persona?: string | null
  language?: string
  confidenceThreshold?: number
}

/**
 * Below this similarity a chunk is noise: it is never shown to the model, not
 * even as "possibly related" context, so it cannot seed a wrong claim.
 */
const WEAK_CONTEXT_MIN_SIMILARITY = 0.22

function buildSystemPrompt(config: ReplyConfig, context: string, grounded: boolean): string {
  const persona =
    config.persona?.trim() ||
    "Sei l'assistente virtuale di una struttura ricettiva. Rispondi in modo cortese, professionale e conciso."
  const language = config.language || "it"

  // GROUNDED: the knowledge base confidently covers the question -> answer from it.
  if (grounded) {
    return [
      persona,
      "",
      "REGOLE FONDAMENTALI:",
      `- Rispondi SEMPRE nella lingua del cliente (lingua predefinita: ${language}).`,
      "- Usa ESCLUSIVAMENTE le informazioni presenti nella BASE DI CONOSCENZA qui sotto.",
      "- Se la base di conoscenza non contiene la risposta, NON inventare: dillo educatamente e proponi di mettere in contatto con lo staff.",
      "- Non citare l'esistenza della 'base di conoscenza' né dei 'frammenti': rispondi in modo naturale.",
      "- Sii breve e diretto; adatto a messaggistica (Telegram/WhatsApp) o email.",
      "",
      "BASE DI CONOSCENZA:",
      context || "(nessuna informazione disponibile)",
    ].join("\n")
  }

  // CONVERSATIONAL: no confident match. The assistant must still behave like a
  // human host — greet, acknowledge, ask what the guest needs — while never
  // asserting a fact about the property that isn't in the context above.
  return [
    persona,
    "",
    "REGOLE FONDAMENTALI:",
    `- Rispondi SEMPRE nella lingua del cliente (lingua predefinita: ${language}).`,
    "- CONVERSA in modo naturale e umano: saluta, ringrazia, riconosci quello che dice il cliente, mantieni il filo del discorso e, se la richiesta è vaga, chiedi cortesemente di cosa ha bisogno.",
    "- NON inventare MAI informazioni sulla struttura: orari, prezzi, disponibilità, servizi, politiche, indirizzi. Se non sono nelle INFORMAZIONI DISPONIBILI, non affermarle in nessun modo.",
    "- Se il cliente chiede un'informazione che non hai, ammettilo in una frase senza giri di parole e proponi di far intervenire un membro dello staff.",
    "- Non dire mai che stai consultando documenti, basi di conoscenza o frammenti.",
    "- Massimo 2-3 frasi, tono cordiale, adatto alla messaggistica.",
    "",
    "INFORMAZIONI DISPONIBILI (usa SOLO se davvero pertinenti alla domanda; se non c'entrano, ignorale del tutto):",
    context || "(nessuna)",
  ].join("\n")
}

/**
 * Generate a reply for an incoming customer message.
 *
 * Two regimes, both grounded-by-construction:
 *   - the knowledge base covers the question (top similarity >= threshold) ->
 *     answer strictly from it;
 *   - it does not -> still reply, but in conversational mode: greetings, small
 *     talk and clarifying questions are handled naturally, while any factual
 *     claim about the property is forbidden unless it appears in the context.
 *
 * `answer` is null only when the model returns nothing at all; the caller then
 * decides whether to post the fallback or leave it to a human.
 */
export async function generateReply(
  config: ReplyConfig,
  incomingMessage: string,
  history: ConversationTurn[] = [],
): Promise<GenerateReplyResult> {
  const threshold =
    typeof config.confidenceThreshold === "number" ? config.confidenceThreshold : DEFAULT_CONFIDENCE_THRESHOLD

  const chunks = await retrieveContext(config.baseIds, incomingMessage, {
    minSimilarity: 0, // fetch top matches, then judge with threshold below
  })

  const topSimilarity = chunks.length > 0 ? chunks[0].similarity : 0
  const grounded = topSimilarity >= threshold

  // In conversational mode only clearly-related chunks are surfaced, so a noisy
  // match can never become the basis for an invented answer.
  const contextChunks = grounded ? chunks : chunks.filter((c) => c.similarity >= WEAK_CONTEXT_MIN_SIMILARITY)
  const context = contextChunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n")

  const { text } = await generateText({
    model: CHAT_MODEL,
    system: buildSystemPrompt(config, context, grounded),
    messages: [
      ...history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: incomingMessage },
    ],
  })

  const answer = text.trim()
  if (!answer) {
    return {
      answer: null,
      confidence: topSimilarity,
      usedChunks: contextChunks,
      reason: chunks.length === 0 ? "no_match" : "low_confidence",
    }
  }

  return {
    answer,
    confidence: topSimilarity,
    usedChunks: contextChunks,
    reason: grounded ? "ok" : "conversational",
  }
}
