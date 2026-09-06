import "server-only"

import { generateObject } from "ai"
import { z } from "zod"
import { CHAT_MODEL } from "@/lib/ai/config"

const SearchExpansionSchema = z.object({
  terms: z
    .array(z.string().min(2).max(64))
    .max(8)
    .describe("Sinonimi o brevi frasi equivalenti che potrebbero comparire nei messaggi."),
})

const ADVANCED_OR = /(^|\s)OR(\s|$)/i
const ADVANCED_NEGATION = /(^|\s)-[^\s-]/
const EMAIL_LIKE = /\b[^\s@]+@[^\s@]+\b/
const MOSTLY_NUMERIC = /^[\s+()\-./\d]+$/

/**
 * Virgolette, OR e -term sono sintassi intenzionale dell'utente. In questi casi
 * il parser PostgreSQL `websearch_to_tsquery` deve restare autorevole: fuzzy e
 * AI non devono reintrodurre proprio le parole che l'utente ha escluso.
 */
export function hasAdvancedSearchSyntax(query: string): boolean {
  return query.includes('"') || ADVANCED_OR.test(query) || ADVANCED_NEGATION.test(query)
}

/**
 * Refusi/prefissi servono sul linguaggio naturale. Email, telefoni/codici e
 * query con operatori hanno gia' una semantica precisa e non vanno "corretti".
 */
export function shouldEnableFuzzySearch(query: string): boolean {
  const normalized = query.trim()
  if (normalized.length < 3) return false
  if (hasAdvancedSearchSyntax(normalized)) return false
  if (EMAIL_LIKE.test(normalized) || MOSTLY_NUMERIC.test(normalized)) return false
  return /\p{L}/u.test(normalized)
}

/**
 * Il modello entra solo quando il motore veloce e deterministico e' povero.
 * Cosi' nomi, email, codici e ricerche normali restano nell'ordine delle
 * centinaia di millisecondi, mentre sinonimi/intento sono un fallback utile.
 */
export function shouldTrySemanticExpansion(
  query: string,
  resultCount: number,
  topQuality: number | null | undefined,
): boolean {
  const normalized = query.trim()
  if (normalized.length < 4) return false
  if (hasAdvancedSearchSyntax(normalized)) return false
  if (EMAIL_LIKE.test(normalized) || MOSTLY_NUMERIC.test(normalized)) return false

  return resultCount < 5 || (topQuality ?? 0) < 0.8
}

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
