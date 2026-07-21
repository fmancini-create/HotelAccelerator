/**
 * Validatore Partita IVA italiana (12/05/2026).
 *
 * La P.IVA italiana e' una stringa di 11 cifre con checksum tramite
 * algoritmo di Luhn modificato (cifre in posizione pari raddoppiate,
 * con riduzione modulare se >= 10). Questo validatore controlla la
 * struttura (lunghezza + checksum), NON l'esistenza nel registro
 * dell'Agenzia delle Entrate (richiederebbe chiamata esterna).
 *
 * Casi accettati come "valid":
 *   - 11 cifre con checksum corretto
 *   - prefisso "IT" opzionale (case insensitive, viene strippato)
 *   - eventuali spazi/punti vengono ignorati
 *
 * Esempi:
 *   isValidItalianVat("IT00448660399") -> true
 *   isValidItalianVat("00448660399")    -> true
 *   isValidItalianVat("18066481005")    -> true (checksum corretto, ma
 *                                              potrebbe non essere una
 *                                              P.IVA realmente assegnata)
 *   isValidItalianVat("12345678901")    -> false
 */

export type VatValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; reason: string }

/** Normalizza la P.IVA: maiuscolo, no spazi/punti, strip prefisso IT */
export function normalizeItalianVat(input: string): string {
  if (!input) return ""
  return input
    .toUpperCase()
    .replace(/[\s.-]/g, "")
    .replace(/^IT/, "")
}

/**
 * Verifica strutturale + checksum Luhn della P.IVA italiana.
 * Ritorna oggetto descrittivo per messaggi UI mirati.
 */
export function validateItalianVat(input: string): VatValidationResult {
  if (!input || !input.trim()) {
    return { valid: false, reason: "La partita IVA è obbligatoria" }
  }
  const normalized = normalizeItalianVat(input)
  if (!/^\d+$/.test(normalized)) {
    return { valid: false, reason: "La partita IVA può contenere solo cifre (e l'eventuale prefisso IT)" }
  }
  if (normalized.length !== 11) {
    return {
      valid: false,
      reason: `La partita IVA italiana deve essere di 11 cifre (attuali: ${normalized.length})`,
    }
  }
  let sum = 0
  for (let i = 0; i < 11; i++) {
    let digit = Number.parseInt(normalized[i]!, 10)
    if (i % 2 === 1) {
      // posizioni pari (1-based) -> indice dispari (0-based): raddoppia
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  if (sum % 10 !== 0) {
    return {
      valid: false,
      reason: "La partita IVA non è valida (checksum errato). Verifica le cifre.",
    }
  }
  return { valid: true, normalized }
}

/** Shortcut booleano */
export function isValidItalianVat(input: string): boolean {
  return validateItalianVat(input).valid
}
