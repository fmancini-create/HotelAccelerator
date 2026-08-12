import "server-only"
import { generateObject } from "ai"
import { z } from "zod"
import { CHAT_MODEL, DEFAULT_CONFIDENCE_THRESHOLD } from "./config"
import { attachSourceMeta, retrieveContext, type RetrievedChunk } from "./retrieval"
import type { HandoffContact } from "./handoff"

export interface ConversationTurn {
  role: "user" | "assistant"
  content: string
}

export interface GenerateReplyResult {
  answer: string | null
  confidence: number
  usedChunks: RetrievedChunk[]
  reason?: "no_match" | "low_confidence" | "ok" | "conversational"
  /** The guest asked to be put in touch with a human. */
  staffRequested: boolean
  /** Contact details gathered anywhere in the conversation. */
  contact: HandoffContact
}

/**
 * Structured reply.
 *
 * The handoff signal comes from the model itself rather than from keyword
 * matching on the text: phrasings like "ok mi metta in contatto", "preferisco
 * parlare con qualcuno" or a plain "sì" after an offer have no reliable
 * keyword, and a keyword list would also fire on sentences that merely mention
 * the staff.
 */
const replySchema = z.object({
  reply: z.string().describe("Il messaggio da inviare al cliente."),
  staff_requested: z
    .boolean()
    .describe(
      "true se il cliente ha chiesto o accettato di essere messo in contatto con una persona dello staff, oppure se la richiesta richiede per forza un intervento umano. false per semplici domande informative.",
    ),
  contact: z
    .object({
      // One field, copied verbatim. Asking the model to split was measured
      // losing data: given "Mario Rossi" it returned first_name "Mario" and
      // dropped "Rossi" entirely, so the assistant kept asking for a surname
      // the guest had already written. Splitting is trivial for code and
      // apparently not for the model, so code does it (see normalizeContact).
      full_name: z
        .string()
        .nullable()
        .describe(
          "Il nome del cliente COPIATO ESATTAMENTE come lo ha scritto, nome e cognome insieme se li ha scritti entrambi (es. 'Mario Rossi'). Non dividere e non omettere nulla. null se non lo ha indicato.",
        ),
      email: z.string().nullable().describe("Email del cliente se l'ha indicata, altrimenti null."),
      phone: z.string().nullable().describe("Telefono del cliente se l'ha indicato, altrimenti null."),
    })
    .describe("Dati di contatto raccolti in QUALSIASI punto della conversazione, non solo nell'ultimo messaggio."),
})

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

/** Upper bound on chunks handed to the model after merging both retrievals. */
const MERGED_CONTEXT_MAX_CHUNKS = 8

/**
 * Build a second, context-aware retrieval query.
 *
 * A follow-up like "prego mi dica", "sì grazie" or "e il prezzo?" carries no
 * searchable content on its own: embedding it alone either misses everything or
 * — worse — lands on an unrelated chunk with a deceptively passable score.
 * Prefixing the recent turns restores the subject of the conversation.
 */
function buildContextualQuery(incomingMessage: string, history: ConversationTurn[]): string | null {
  const recent = history.slice(-4).filter((t) => t.content.trim())
  if (recent.length === 0) return null
  // Cap each turn so a long earlier reply cannot drown out the new message.
  const parts = recent.map((t) => t.content.trim().slice(0, 300))
  return [...parts, incomingMessage].join("\n")
}

/** Merge two retrievals, keeping the best similarity per chunk. */
function mergeChunks(a: RetrievedChunk[], b: RetrievedChunk[]): RetrievedChunk[] {
  const best = new Map<string, RetrievedChunk>()
  for (const chunk of [...a, ...b]) {
    const existing = best.get(chunk.id)
    if (!existing || chunk.similarity > existing.similarity) best.set(chunk.id, chunk)
  }
  return [...best.values()].sort((x, y) => y.similarity - x.similarity).slice(0, MERGED_CONTEXT_MAX_CHUNKS)
}

/**
 * Safety net over the model's extraction.
 *
 * Measured: given "Mario Rossi, mario.rossi@example.com, 3351234567" the model
 * returned first_name "Mario" and last_name null, so the assistant asked again
 * for a surname the guest had already written. The instruction in the schema
 * helps but cannot be trusted on its own, so a full name arriving in a single
 * field is split here: the last token becomes the surname.
 */
function normalizeContact(raw: {
  full_name: string | null
  email: string | null
  phone: string | null
}): HandoffContact {
  const trim = (v: string | null) => {
    const t = v?.trim()
    return t ? t : null
  }

  const full = trim(raw.full_name)
  const parts = full ? full.split(/\s+/).filter(Boolean) : []

  return {
    firstName: parts[0] ?? null,
    // Everything after the first token: handles "Maria Teresa De Rossi" without
    // guessing where the surname starts.
    lastName: parts.length >= 2 ? parts.slice(1).join(" ") : null,
    email: trim(raw.email),
    phone: trim(raw.phone),
  }
}

/**
 * Shared rule for both regimes.
 *
 * The assistant used to promise "la metto in contatto con lo staff" with no
 * contact details and nothing registered anywhere. Now the details are the
 * precondition: without a way to reach the guest, the staff cannot answer, so
 * the promise must not be made yet.
 */
const STAFF_HANDOFF_RULE = [
  "- CONTATTO CON LO STAFF: se il cliente chiede (o accetta) di essere messo in contatto con una persona, PRIMA raccogli nome, cognome, email e telefono.",
  "  Chiedi in UNA sola frase i dati che mancano, senza rielencare quelli che ti ha già dato.",
  "  NON dire MAI di aver inoltrato la richiesta, di averla presa in carico o che lo staff risponderà: la conferma viene aggiunta dal sistema solo quando la richiesta è stata registrata davvero.",
  "  Quando hai già nome, cognome e un recapito, limitati a un breve ringraziamento senza promesse e senza richiedere dati che il cliente ti ha già dato.",
].join("\n")

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
      "- PERTINENZA: rispondi SOLO all'argomento che il cliente ha chiesto. Se le informazioni qui sotto riguardano un argomento diverso, NON usarle e non cambiare discorso: chiedi un chiarimento oppure ammetti di non avere quel dato.",
      "- COERENZA: ciò che hai già detto in questa conversazione resta valido. Non contraddirlo e non negarlo. Se il cliente chiede di approfondire un argomento che hai già trattato, riprendi il filo di quel discorso.",
      "- LINK: quando il cliente chiede dove prenotare o dove trovare qualcosa, fornisci l'indirizzo web completo indicato nella riga '(fonte: ...)' della sezione pertinente. Non inventare MAI un indirizzo che non sia scritto qui sotto, e non limitarti a dire che lo indirizzerai: dai il link.",
      "- Se hai proposto due alternative e il cliente risponde in modo ambiguo (es. 'sì grazie'), chiedi quale preferisce invece di scegliere al posto suo.",
      STAFF_HANDOFF_RULE,
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
    "- COERENZA: ciò che hai già detto in questa conversazione resta valido. Non contraddirlo e non negarlo mai. Se il cliente ti chiede di proseguire su un argomento che hai già trattato (es. 'prego mi dica', 'sì grazie'), riprendi quel filo invece di dire che non hai informazioni.",
    "- Se il cliente chiede un'informazione che non hai MAI dato e che non è nelle INFORMAZIONI DISPONIBILI, ammettilo in una frase senza giri di parole e proponi di far intervenire un membro dello staff.",
    "- LINK: se una fonte pertinente riporta un indirizzo web nella riga '(fonte: ...)' e il cliente chiede dove prenotare o dove trovare qualcosa, forniscilo per intero. Non inventare MAI un indirizzo che non sia scritto qui sotto.",
    "- Se hai proposto due alternative e il cliente risponde in modo ambiguo (es. 'sì grazie'), chiedi quale preferisce invece di scegliere al posto suo.",
    STAFF_HANDOFF_RULE,
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

  // Two retrievals in parallel: the message on its own (best for a
  // self-contained question) and the message prefixed with the recent turns
  // (best for follow-ups such as "prego mi dica"). Keeping the strongest match
  // from either means a follow-up no longer loses the subject of the thread.
  const contextualQuery = buildContextualQuery(incomingMessage, history)
  const [directChunks, contextualChunks] = await Promise.all([
    retrieveContext(config.baseIds, incomingMessage, { minSimilarity: 0 }),
    contextualQuery
      ? retrieveContext(config.baseIds, contextualQuery, { minSimilarity: 0 })
      : Promise.resolve([] as RetrievedChunk[]),
  ])
  const chunks = mergeChunks(directChunks, contextualChunks)

  const topSimilarity = chunks.length > 0 ? chunks[0].similarity : 0
  const grounded = topSimilarity >= threshold

  // In conversational mode only clearly-related chunks are surfaced, so a noisy
  // match can never become the basis for an invented answer.
  const contextChunks = await attachSourceMeta(
    grounded ? chunks : chunks.filter((c) => c.similarity >= WEAK_CONTEXT_MIN_SIMILARITY),
  )
  // The origin page travels with each excerpt: it is the only place the actual
  // web address survives, so the assistant can hand out a real link instead of
  // promising a redirect it cannot perform.
  const context = contextChunks
    .map((c, i) => {
      const origin = [c.source_title?.trim(), c.source_url?.trim()].filter(Boolean).join(" — ")
      return origin ? `[${i + 1}] (fonte: ${origin})\n${c.content}` : `[${i + 1}] ${c.content}`
    })
    .join("\n\n")

  const { object } = await generateObject({
    model: CHAT_MODEL,
    schema: replySchema,
    system: buildSystemPrompt(config, context, grounded),
    messages: [
      ...history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: incomingMessage },
    ],
  })

  const contact = normalizeContact(object.contact)

  const answer = object.reply.trim()
  if (!answer) {
    return {
      answer: null,
      confidence: topSimilarity,
      usedChunks: contextChunks,
      reason: chunks.length === 0 ? "no_match" : "low_confidence",
      staffRequested: object.staff_requested,
      contact,
    }
  }

  return {
    answer,
    confidence: topSimilarity,
    usedChunks: contextChunks,
    reason: grounded ? "ok" : "conversational",
    staffRequested: object.staff_requested,
    contact,
  }
}
