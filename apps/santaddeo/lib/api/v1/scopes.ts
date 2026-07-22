/**
 * Platform API v1 -- Scopes
 *
 * Ogni API key ha un array di scopes che determina quali endpoint puo' chiamare.
 * Il formato e' "resource:action" (es. "hotels:read", "bookings:write").
 * Lo scope "admin" da' accesso totale.
 */

export const API_SCOPES = {
  // Hotels
  "hotels:read": "Leggere la lista e i dettagli degli hotel",
  "hotels:write": "Creare e modificare hotel",

  // Production
  "production:read": "Leggere dati di produzione giornaliera",

  // Fiscal Production
  "fiscal:read": "Leggere produzione fiscale (corrispettivi, fatture, documenti)",

  // Bookings
  "bookings:read": "Leggere prenotazioni",
  "bookings:write": "Creare e modificare prenotazioni",

  // Guests
  "guests:read": "Leggere dati ospiti",

  // Channels
  "channels:read": "Leggere dati per canale di vendita",

  // Departments
  "departments:read": "Leggere revenue per reparto/segmento",

  // Availability
  "availability:read": "Leggere disponibilita' camere",

  // Webhooks
  "webhooks:read": "Leggere le configurazioni webhook",
  "webhooks:write": "Creare e gestire webhook",

  // Admin
  "admin": "Accesso completo a tutte le risorse",
} as const

export type ApiScope = keyof typeof API_SCOPES

/**
 * Alias per compatibilita' con software esterni che usano naming diverso.
 * Esempio: "properties:read" (usato da HotelProfitAI) -> "hotels:read" (nostro scope).
 */
const SCOPE_ALIASES: Record<string, string> = {
  "properties:read": "hotels:read",
  "properties:write": "hotels:write",
  "reservations:read": "bookings:read",
  "reservations:write": "bookings:write",
}

/**
 * Verifica se un set di scopes copre lo scope richiesto.
 * Lo scope "admin" soddisfa qualsiasi richiesta.
 * Supporta alias per compatibilita' con software esterni.
 */
export function hasScope(grantedScopes: string[], requiredScope: ApiScope): boolean {
  if (grantedScopes.includes("admin")) return true
  if (grantedScopes.includes(requiredScope)) return true
  // Check aliases: if the granted scopes include an alias that maps to the required scope
  for (const scope of grantedScopes) {
    if (SCOPE_ALIASES[scope] === requiredScope) return true
  }
  return false
}

/**
 * Verifica se un set di scopes copre ALMENO UNO degli scopes richiesti.
 */
export function hasAnyScope(grantedScopes: string[], requiredScopes: ApiScope[]): boolean {
  if (grantedScopes.includes("admin")) return true
  return requiredScopes.some((s) => grantedScopes.includes(s))
}
