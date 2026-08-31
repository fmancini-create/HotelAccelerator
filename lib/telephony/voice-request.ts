/**
 * Normalizza i nomi storici/usati dagli script 3CX per il numero chiamante.
 *
 * Il contratto HotelAccelerator resta `caller_number`, ma vecchi call script
 * possono inviare `caller`, `caller_id` o `ani`. Accettarli qui evita di
 * perdere il collegamento della chiamata senza rendere il tenant controllabile
 * dal payload: il tenant continua a provenire esclusivamente dalla credenziale
 * vocale autenticata.
 */
export function normalizeVoiceCallerAliases(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw

  const body = raw as Record<string, unknown>
  const canonical = typeof body.caller_number === "string" ? body.caller_number.trim() : ""
  if (canonical) return body

  for (const key of ["caller", "caller_id", "ani"] as const) {
    const value = body[key]
    if (typeof value === "string" && value.trim()) {
      return { ...body, caller_number: value.trim() }
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return { ...body, caller_number: String(value) }
    }
  }

  return body
}
