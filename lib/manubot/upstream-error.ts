/**
 * Errore di una risposta NON ok proveniente da ManuBot (upstream).
 *
 * PERCHÉ ESISTE: il client (lib/manubot.ts) lanciava messaggi senza lo status
 * HTTP — es. "Errore fetch asset Manubot". `categorizeManubotError` classifica
 * cercando sottostringhe, quindi quel testo cadeva nel ramo "errore fetch" e
 * diventava `network_error`. Risultato: un 401 o un 403 di ManuBot arrivavano
 * alla UI travestiti da problema di rete, e lo status upstream non finiva in
 * NESSUN log. Diagnosticare era impossibile senza indovinare.
 *
 * Qui lo status viaggia come CAMPO NUMERICO, non dentro il messaggio. È una
 * differenza sostanziale: classificare su `err.status === 401` è deterministico,
 * mentre `msg.includes("401")` è ambiguo (un body che cita "401" su una risposta
 * 500 verrebbe classificato come problema di autenticazione).
 *
 * SICUREZZA: l'estratto del body è troncato e passato da `redactSecrets`. Non
 * viene MAI catturato l'header Authorization, né token, password o valori di
 * env — solo il corpo della risposta di ManuBot, che è già un errore generico.
 * L'estratto resta comunque nei soli log del server: le route restituiscono al
 * client unicamente una categoria chiusa.
 */

/** Massima lunghezza dell'estratto di body conservato (caratteri). */
const MAX_BODY_SNIPPET = 200

/**
 * Oscura i pattern che potrebbero somigliare a un segreto.
 *
 * È una rete di sicurezza per DIFESA IN PROFONDITÀ: i body di errore di ManuBot
 * sono generici (`{"error":"Non autenticato"}`), ma se un giorno un endpoint
 * restituisse per sbaglio un token in chiaro, non deve finire nei log. Meglio
 * un log meno leggibile che un segreto persistito.
 */
export function redactSecrets(input: string): string {
  // L'ORDINE CONTA. La regola sullo schema Bearer deve venire PRIMA di quella
  // sulle chiavi sensibili: `authorization` è tra le chiavi, e il suo valore
  // viene catturato fino al primo spazio. Su `Authorization: Bearer <token>`
  // quella regola sostituirebbe solo la parola "Bearer" e lascerebbe il token
  // in chiaro subito dopo. Verificato con un test: invertendo l'ordine il token
  // sopravviveva alla redazione.
  return (
    input
      // JWT (tre segmenti base64url separati da punto): copre gli access_token
      // Supabase, che iniziano per "eyJ".
      .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[REDACTED_JWT]")
      // Schema Bearer, nel caso comparisse in un messaggio d'errore riflesso.
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      // Valori associati a chiavi sensibili, in JSON o querystring.
      .replace(
        /("?(?:password|passwd|pwd|token|access_token|refresh_token|apikey|api_key|api_token|secret|authorization)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^,&\s}]+)/gi,
        '$1"[REDACTED]"',
      )
  )
}

/**
 * Legge il body di una risposta non ok in modo sicuro.
 *
 * Non lancia MAI: se il body è già consumato, illeggibile o la connessione cade
 * a metà, si restituisce una stringa vuota. Un errore nella diagnostica non deve
 * mascherare l'errore che stiamo diagnosticando — sarebbe un secondo bug sopra
 * il primo.
 */
export async function readSafeBodySnippet(res: Response): Promise<string> {
  try {
    const text = await res.text()
    if (!text) return ""
    return redactSecrets(text).slice(0, MAX_BODY_SNIPPET).replace(/\s+/g, " ").trim()
  } catch {
    return ""
  }
}

export class ManubotUpstreamError extends Error {
  /** Status HTTP restituito da ManuBot (o dall'auth Supabase per il login). */
  readonly status: number
  /** Path upstream chiamato, senza host e senza querystring. */
  readonly path: string
  /** Estratto del body, troncato e ripulito. Può essere stringa vuota. */
  readonly bodySnippet: string
  /**
   * true se l'errore arriva dalla fase di LOGIN (auth Supabase di ManuBot) e non
   * da una rotta dati. Serve perché Supabase risponde 400 a credenziali non
   * valide: senza questo flag un 400 di login finirebbe tra gli errori generici
   * invece che in `auth_failed`.
   */
  readonly isLoginPhase: boolean

  constructor(args: {
    operation: string
    status: number
    path: string
    bodySnippet?: string
    isLoginPhase?: boolean
  }) {
    // Il messaggio include lo status in forma leggibile per i log. La
    // classificazione però NON lo rilegge da qui: usa il campo `status`.
    const snippet = args.bodySnippet ? ` — ${args.bodySnippet}` : ""
    super(`ManuBot ${args.operation} failed with status ${args.status}${snippet}`)
    this.name = "ManubotUpstreamError"
    this.status = args.status
    this.path = args.path
    this.bodySnippet = args.bodySnippet ?? ""
    this.isLoginPhase = args.isLoginPhase ?? false
  }
}

/**
 * Costruisce un ManubotUpstreamError da una Response non ok.
 * `operation` è un'etichetta breve usata nel messaggio (es. "assets", "team").
 */
export async function upstreamErrorFromResponse(
  operation: string,
  path: string,
  res: Response,
  options?: { isLoginPhase?: boolean },
): Promise<ManubotUpstreamError> {
  const bodySnippet = await readSafeBodySnippet(res)
  return new ManubotUpstreamError({
    operation,
    status: res.status,
    path,
    bodySnippet,
    isLoginPhase: options?.isLoginPhase,
  })
}
