const ADVANCED_OR = /(^|\s)OR(\s|$)/i
const ADVANCED_NEGATION = /(^|\s)-[^\s-]/
const EMAIL_LIKE = /\b[^\s@]+@[^\s@]+\b/
const MOSTLY_NUMERIC = /^[\s+()\-./\d]+$/

/**
 * Virgolette, OR e -term sono sintassi intenzionale dell'utente. In questi casi
 * `websearch_to_tsquery` deve restare autorevole: fuzzy e AI non devono
 * reintrodurre parole che l'utente ha escluso o allargare una frase esatta.
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
 * Nomi, email, codici e ricerche normali restano sul percorso indicizzato.
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
