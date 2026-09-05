/**
 * Normalizza i nomi storici/usati dagli script 3CX per il numero chiamante e
 * per il codice cliente. Il contratto canonico resta piccolo e stabile, ma i
 * call script possono usare alias diversi senza rendere il tenant controllabile
 * dal payload: il tenant continua a provenire esclusivamente dalla credenziale
 * vocale autenticata.
 */
function scalarString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

export function normalizeVoiceCallerAliases(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw

  const body = raw as Record<string, unknown>
  if (scalarString(body.caller_number)) return body

  for (const key of ["caller", "caller_id", "ani"] as const) {
    const value = scalarString(body[key])
    if (value) return { ...body, caller_number: value }
  }

  return body
}

/**
 * Accetta anche i nomi che un flow 3CX/CFD puo' usare quando raccoglie le sette
 * cifre con tastiera DTMF. Se il flow passa il codice con spazi o separatori,
 * per il caso puramente numerico lo compattiamo prima della validazione.
 *
 * Il codice cliente identifica il tenant ma non e' una password: la route resta
 * comunque protetta dalla credenziale server-to-server del centralino.
 */
export function normalizeVoiceSupportAliases(raw: unknown): unknown {
  const normalizedCaller = normalizeVoiceCallerAliases(raw)
  if (!normalizedCaller || typeof normalizedCaller !== "object" || Array.isArray(normalizedCaller)) {
    return normalizedCaller
  }

  const body = normalizedCaller as Record<string, unknown>
  if (scalarString(body.customer_code)) return body

  for (const key of [
    "customer_code_digits",
    "license_digits",
    "licence_digits",
    "license",
    "licence",
    "dtmf_digits",
    "digits",
    "dtmf",
  ] as const) {
    const value = scalarString(body[key])
    if (!value) continue

    const compactDigits = value.replace(/\D/g, "")
    return {
      ...body,
      customer_code: compactDigits.length === 7 ? compactDigits : value,
    }
  }

  return body
}
