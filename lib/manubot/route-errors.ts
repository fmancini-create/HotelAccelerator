/**
 * Mappatura degli errori ManuBot in CATEGORIE GENERICHE per il client.
 *
 * Perché esiste: le route ManuBot restituivano `error.message` grezzo, quindi
 * un chiamante poteva leggere messaggi interni come
 * "Login Manubot fallito: Invalid login credentials" oppure testi di errore di
 * Supabase. Viola la regola "errori interni mai esposti": il client riceve solo
 * una categoria, il messaggio reale resta nei log del server.
 *
 * Le categorie sono un insieme CHIUSO e stabile, così la UI può ragionarci
 * sopra senza fare parsing di stringhe:
 *  - auth_failed            login a ManuBot rifiutato (credenziali non valide)
 *  - tenant_not_configured  configurazione della property assente/incoerente
 *                           (es. URL Supabase non ammessa per l'ambiente)
 *  - env_missing            variabile ambiente obbligatoria non impostata
 *  - network_error          ManuBot non raggiungibile o risposta non valida
 *  - permission_error       autenticati ma senza permessi sulla risorsa
 *  - internal_error         tutto il resto
 *
 * NB: queste categorie descrivono errori VERSO ManuBot (upstream). Gli errori di
 * autorizzazione del chiamante sulla nostra route (`unauthorized`/`forbidden`)
 * sono gestiti dal guard e non passano da qui.
 */

import { ManubotEnvironmentError } from "@/lib/manubot/environment-guard"

export type ManubotErrorCategory =
  | "auth_failed"
  | "tenant_not_configured"
  | "env_missing"
  | "network_error"
  | "permission_error"
  | "internal_error"

/**
 * Classifica un errore sconosciuto in una delle categorie.
 * NON restituisce mai il messaggio originale.
 */
export function categorizeManubotError(error: unknown): ManubotErrorCategory {
  // Guard prod/dev: URL Supabase non ammessa per l'ambiente corrente.
  if (error instanceof ManubotEnvironmentError) return "tenant_not_configured"

  const raw = error instanceof Error ? error.message : String(error ?? "")
  const msg = raw.toLowerCase()

  // Env mancante: `requireEnv` in lib/manubot.ts lancia questo testo.
  if (msg.includes("variabile ambiente") || msg.includes("configurazione manubot mancante")) {
    return "env_missing"
  }

  // Credenziali rifiutate dall'auth di ManuBot.
  if (
    msg.includes("login manubot fallito") ||
    msg.includes("invalid login credentials") ||
    msg.includes("invalid_grant") ||
    msg.includes("email not confirmed") ||
    msg.includes("401")
  ) {
    return "auth_failed"
  }

  // Autenticati ma non autorizzati sulla risorsa (incluse policy RLS).
  if (
    msg.includes("row-level") ||
    msg.includes("row level") ||
    msg.includes("permission denied") ||
    msg.includes("not authorized") ||
    msg.includes("forbidden") ||
    msg.includes("403")
  ) {
    return "permission_error"
  }

  // Rete/trasporto o risposta non utilizzabile da parte di ManuBot.
  if (
    msg.includes("fetch failed") ||
    msg.includes("errore fetch") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("socket") ||
    msg.includes("unexpected token") // HTML/testo dove era atteso JSON
  ) {
    return "network_error"
  }

  return "internal_error"
}

/**
 * Logga il messaggio reale lato server (mai in risposta al client).
 * Non stampa mai password, token o valori di env: solo `error.message`, che nel
 * codice ManuBot è già costruito senza segreti.
 */
export function logManubotError(scope: string, error: unknown, category: ManubotErrorCategory): void {
  console.error(
    `[v0] ${scope}: ${category} — ${error instanceof Error ? error.message : "unknown error"}`,
  )
}
