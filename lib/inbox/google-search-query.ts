import "server-only"

import { generateObject } from "ai"
import { z } from "zod"
import { CHAT_MODEL } from "@/lib/ai/config"

export {
  hasAdvancedSearchSyntax,
  shouldEnableFuzzySearch,
  shouldTrySemanticExpansion,
} from "@/lib/inbox/google-search-policy"

const SearchExpansionSchema = z.object({
  terms: z
    .array(z.string().min(2).max(64))
    .max(8)
    .describe("Sinonimi o brevi frasi equivalenti che potrebbero comparire nei messaggi."),
})

function sanitizeExpansionTerm(value: string): string | null {
  const cleaned = value
    // L'output del modello diventa input di websearch_to_tsquery. Eliminiamo
    // operatori e metacaratteri: l'AI propone CONCETTI, non nuova sintassi.
    .replace(/[|&!():<>"{}\[\]\\]/g, " ")
    .replace(/[^\p{L}\p{N}\s'’]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 56)

  if (cleaned.length < 2) return null
  return cleaned
}

export interface SearchExpansion {
  terms: string[]
  tokensIn: number
  tokensOut: number
}

/**
 * Comprende l'intento della query SENZA inviare al modello il contenuto della
 * Inbox. Solo il testo digitato dall'operatore lascia il server; l'archivio dei
 * messaggi resta nel database e viene interrogato dagli indici PostgreSQL.
 */
export async function expandInboxSearchQuery(query: string, timeoutMs = 1400): Promise<SearchExpansion> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const { object, usage } = await generateObject({
      model: CHAT_MODEL,
      schema: SearchExpansionSchema,
      abortSignal: controller.signal,
      system: [
        "Sei il query-understanding di un motore di ricerca per una Inbox alberghiera multicanale.",
        "NON rispondere alla domanda dell'utente e NON inventare fatti: produci soltanto termini utili alla ricerca.",
        "Restituisci massimo 8 sinonimi o brevi frasi semanticamente equivalenti che potrebbero essere scritte nei messaggi.",
        "Includi varianti comuni del linguaggio hospitality e, quando davvero utile, equivalenti in italiano e inglese.",
        "Esempio: 'vuole disdire la prenotazione' puo' includere 'cancellare prenotazione', 'annullamento prenotazione', 'booking cancellation', 'cancel reservation'.",
        "Non espandere nomi propri, email, numeri, importi, date, codici o identificativi: la ricerca esatta li gestisce gia'.",
        "Non aggiungere concetti solo correlati: ogni termine deve mantenere lo stesso intento della query.",
      ].join("\n"),
      prompt: `Query di ricerca: ${query}`,
    })

    const original = query.trim().toLocaleLowerCase()
    const unique = new Map<string, string>()

    for (const raw of object.terms) {
      const term = sanitizeExpansionTerm(raw)
      if (!term) continue
      const key = term.toLocaleLowerCase()
      if (key === original || unique.has(key)) continue
      unique.set(key, term)
      if (unique.size >= 8) break
    }

    return {
      terms: [...unique.values()],
      tokensIn: usage?.inputTokens ?? 0,
      tokensOut: usage?.outputTokens ?? 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}
