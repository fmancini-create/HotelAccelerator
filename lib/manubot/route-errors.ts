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
 *                           (es. URL Supabase o company mapping non validi)
 *  - env_missing            variabile ambiente obbligatoria non impostata
 *  - network_error          ManuBot non raggiungibile o risposta non valida
 *  - permission_error       autenticati ma senza permessi sulla risorsa
 *  - not_found              endpoint o risorsa inesistente su ManuBot (404)
 *  - upstream_error         ManuBot ha risposto con un errore proprio (5xx e
 *                           altri status non riconducibili ai casi sopra)
 *  - internal_error         tutto il resto
 *
 * NB: queste categorie descrivono errori VERSO ManuBot (upstream). Gli errori di
 * autorizzazione del chiamante sulla nostra route (`unauthorized`/`forbidden`)
 * sono gestiti dal guard e non passano da qui.
 */

import { ManubotEnvironmentError } from "@/lib/manubot/environment-guard"
import { ManubotUpstreamError } from "@/lib/manubot/upstream-error"

export type ManubotErrorCategory =
  | "auth_failed"
  | "tenant_not_configured"
  | "env_missing"
  | "network_error"
  | "permission_error"
  | "not_found"
  | "upstream_error"
  | "internal_error"

/**
 * Classifica un errore sconosciuto in una delle categorie.
 * NON restituisce mai il messaggio originale.
 */
export function categorizeManubotError(error: unknown): ManubotErrorCategory {
  // Guard prod/dev: URL Supabase non ammessa per l'ambiente corrente.
  if (error instanceof ManubotEnvironmentError) return "tenant_not_configured"

  // STATUS UPSTREAM: ha la priorità su qualunque analisi del testo.
  // Il match su sottostringa resta sotto come fallback, ma è intrinsecamente
  // ambiguo: un body che cita "401" dentro una risposta 500 verrebbe
  // classificato come errore di autenticazione. Con lo status numerico la
  // classificazione è deterministica.
  if (error instanceof ManubotUpstreamError) {
    // Fase di login: Supabase risponde 400 alle credenziali non valide, quindi
    // non basta guardare il 401.
    if (error.isLoginPhase) {
      return error.status === 400 || error.status === 401 || error.status === 403
        ? "auth_failed"
        : "upstream_error"
    }
    if (error.status === 401) return "auth_failed"
    if (error.status === 403) return "permission_error"
    if (error.status === 404) return "not_found"
    // 5xx e ogni altro status non riconducibile ai casi sopra: l'errore è di
    // ManuBot, non nostro, e va tenuto distinguibile da un problema di rete.
    return "upstream_error"
  }

  const raw = error instanceof Error ? error.message : String(error ?? "")
  const msg = raw.toLowerCase()

  // Configurazione tenant incompleta: il mapping `manubot_company_id` e' parte
  // del confine di sicurezza S2S, non una env globale. Va quindi mostrato come
  // tenant non configurato invece che come errore interno generico.
  if (msg.includes("configurazione manubot tenant incompleta")) {
    return "tenant_not_configured"
  }

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
 *
 * Per gli errori upstream registra anche STATUS e PATH, che prima non finivano
 * in nessun log: senza di essi un `network_error` era indistinguibile da un 401,
 * e la diagnosi si riduceva a indovinare.
 *
 * Non stampa mai password, token, header Authorization o valori di env.
 * L'estratto di body è già passato da `redactSecrets` alla creazione
 * dell'errore, quindi qui non transita nulla di sensibile.
 */
export function logManubotError(scope: string, error: unknown, category: ManubotErrorCategory): void {
  if (error instanceof ManubotUpstreamError) {
    console.error(
      `[v0] ${scope}: ${category} — upstream ${error.path} status=${error.status}` +
        (error.bodySnippet ? ` body="${error.bodySnippet}"` : " body=<vuoto>"),
    )
    return
  }
  console.error(
    `[v0] ${scope}: ${category} — ${error instanceof Error ? error.message : "unknown error"}`,
  )
}
