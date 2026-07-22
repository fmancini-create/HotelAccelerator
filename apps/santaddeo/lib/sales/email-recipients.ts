/**
 * Helper condivisi per i destinatari aggiuntivi (Cc/Ccn) delle email venditore.
 *
 * L'utente puo' inserire piu' indirizzi separati da virgola, punto e virgola,
 * spazio o a-capo. Qui li normalizziamo in un array di email valide, in
 * minuscolo e deduplicate. Usato lato server dalle route di invio e (per la
 * validazione leggera) lato client.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** True se la stringa e' un indirizzo email sintatticamente valido. */
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/**
 * Normalizza un input (stringa "a@x.it, b@y.it" o array) in un elenco di email
 * valide, lowercase, senza duplicati. Gli indirizzi non validi vengono scartati.
 */
export function parseRecipientList(input?: string | string[] | null): string[] {
  if (!input) return []
  const raw = Array.isArray(input) ? input.join(",") : String(input)
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

/**
 * Ritorna gli indirizzi sintatticamente NON validi presenti nell'input (per
 * mostrare un avviso in UI). Ignora i campi vuoti.
 */
export function findInvalidRecipients(input?: string | null): string[] {
  if (!input) return []
  const invalid: string[] = []
  for (const part of String(input).split(/[\s,;]+/)) {
    const email = part.trim()
    if (!email) continue
    if (!EMAIL_RE.test(email)) invalid.push(email)
  }
  return invalid
}
