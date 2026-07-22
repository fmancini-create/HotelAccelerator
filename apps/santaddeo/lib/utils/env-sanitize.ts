/**
 * Funzioni di sanitizzazione ENV condivise
 *
 * USARE SEMPRE queste funzioni quando si leggono variabili d'ambiente
 * per Supabase o altri servizi che richiedono header HTTP puliti.
 */

/**
 * Sanitizza URL: trim + rimuove trailing slash
 */
export function sanitizeUrl(value?: string): string {
  return (value || "").trim().replace(/\/+$/, "")
}

/**
 * Sanitizza chiave API/token: rimuove QUALSIASI whitespace
 * (spazi, \n, \r, \t) - questi rompono Headers.append
 */
export function sanitizeKey(value?: string): string {
  return (value || "").trim().replace(/[\r\n\s]+/g, "")
}

/**
 * Oggetto con tutte le env Supabase sanitizzate
 */
export function getSupabaseEnv() {
  return {
    url: sanitizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SANTADDEO_SUPABASE_URL),
    anonKey: sanitizeKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SANTADDEO_SUPABASE_ANON_KEY),
    serviceRoleKey: sanitizeKey(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY),
  }
}

/**
 * Valida che le env Supabase necessarie siano presenti
 * @throws Error se mancano env richieste
 */
export function validateSupabaseEnv(requireServiceRole = false): void {
  const env = getSupabaseEnv()

  if (!env.url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
  }

  if (!env.anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  if (requireServiceRole && !env.serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
  }
}
