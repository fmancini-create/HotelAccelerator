/**
 * Intestazioni CORS per gli endpoint pubblici del widget.
 *
 * Il widget gira sul sito del cliente (www.miohotel.it) e chiama questa
 * piattaforma: sono origini diverse, quindi senza CORS il browser blocca ogni
 * risposta. L'origine e' `*` di proposito, perche' lo stesso widget puo' essere
 * installato su domini che non conosciamo in anticipo (sottodomini, staging,
 * landing page): una lista chiusa lo farebbe smettere di funzionare senza che
 * nessuno sappia perche'.
 *
 * Quello che rende sicuro `*` qui e' che queste rotte NON usano cookie di
 * sessione: l'autorizzazione e' la chiave pubblica del widget nell'URL, e le
 * risposte contengono solo i dati di quella conversazione. Per questo non va
 * mai aggiunto `Access-Control-Allow-Credentials`: con credenziali, `*`
 * permetterebbe a un sito qualunque di leggere dati usando la sessione di chi
 * lo visita.
 */
export const INTESTAZIONI_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

/** Risposta al preflight. Il browser lo invia prima di ogni POST con JSON:
 *  senza questa rotta il messaggio del visitatore non parte nemmeno. */
export function rispostaPreflight(): Response {
  return new Response(null, { status: 204, headers: INTESTAZIONI_CORS })
}

/** JSON con le intestazioni CORS gia' applicate. */
export function jsonCors(corpo: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(corpo), {
    status: init?.status ?? 200,
    headers: { ...INTESTAZIONI_CORS, "Content-Type": "application/json" },
  })
}
