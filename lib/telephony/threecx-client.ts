import "server-only"

/**
 * Client per la Call Control API di 3CX v20.
 *
 * Autenticazione: OAuth2 `client_credentials` su `/connect/token`, poi Bearer.
 * L'app va creata nella console 3CX (Admin Console -> Integrations -> API).
 *
 * NOTA SUI LIMITI, dichiarati perche' cambiano cosa e' possibile:
 *  - Le chiamate in USCITA si originano sull'interno dell'operatore: il suo
 *    telefono/app squilla, l'operatore risponde e 3CX chiama il numero. Non
 *    esiste un modo per "parlare" dal browser senza un client registrato.
 *  - Gli eventi in DIRETTA (pannello che si aggiorna da solo) richiederebbero un
 *    WebSocket permanente, che il serverless di Vercel non regge. Per il caso
 *    utile - sapere CHI sta chiamando - non serve: e' 3CX a interrogare i nostri
 *    endpoint via HTTP (lookup + journaling), e questo funziona su Vercel.
 */

export type ThreeCxConfig = {
  baseUrl: string
  clientId: string
  clientSecret: string
}

export class ThreeCxError extends Error {
  readonly status: number
  /** Corpo della risposta, troncato: utile in diagnostica, mai un segreto. */
  readonly detail: string

  constructor(message: string, status: number, detail = "") {
    super(message)
    this.name = "ThreeCxError"
    this.status = status
    this.detail = detail
  }
}

/** Rimuove gli slash finali: `https://host/` e `https://host` sono equivalenti. */
export function normalizeBaseUrl(raw: string): string {
  return String(raw || "").trim().replace(/\/+$/, "")
}

/**
 * La funzione vive in `./phone-match` perche' questo file e' `server-only`:
 * le regole di unione col PMS e le prove automatiche devono poter riconoscere
 * un numero senza trascinarsi dietro il client del centralino. Ri-esportata
 * qui perche' i chiamanti esistenti continuino a funzionare senza modifiche.
 */
export { phoneMatchKey } from "./phone-match"

type TokenBag = { token: string; expiresAt: number }

/**
 * Cache del token in memoria del processo, per chiave (host + client).
 *
 * Il token dura tipicamente un'ora: richiederne uno nuovo a ogni clic
 * significherebbe raddoppiare le chiamate al centralino. La cache e' per
 * istanza e va persa a freddo: e' un'ottimizzazione, non uno stato necessario.
 */
const tokenCache = new Map<string, TokenBag>()

function cacheKey(cfg: ThreeCxConfig): string {
  return `${normalizeBaseUrl(cfg.baseUrl)}|${cfg.clientId}`
}

async function readBodySafely(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text.slice(0, 500)
  } catch {
    return ""
  }
}

/** Ottiene (o riusa) un access token. */
export async function getAccessToken(cfg: ThreeCxConfig, opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const key = cacheKey(cfg)
  const cached = tokenCache.get(key)
  // Margine di 60s: un token che scade "tra un istante" e' inutilizzabile.
  if (!opts.forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token
  }

  const base = normalizeBaseUrl(cfg.baseUrl)
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
  })

  let res: Response
  try {
    res = await fetch(`${base}/connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    // Distinguo il guasto di rete dal rifiuto del centralino: senza questa
    // distinzione un host sbagliato e una credenziale sbagliata darebbero lo
    // stesso messaggio, e la diagnosi diventerebbe indovinare.
    const reason = error instanceof Error ? error.message : "errore di rete"
    throw new ThreeCxError(`Centralino non raggiungibile all'indirizzo indicato (${reason}).`, 0)
  }

  if (!res.ok) {
    const detail = await readBodySafely(res)
    if (res.status === 400 || res.status === 401) {
      throw new ThreeCxError("Credenziali API rifiutate dal centralino (Client ID o Client Secret errati).", res.status, detail)
    }
    if (res.status === 404) {
      throw new ThreeCxError(
        "Endpoint /connect/token non trovato: l'indirizzo non sembra un PBX 3CX v20 (le versioni precedenti non hanno questa API).",
        404,
        detail,
      )
    }
    throw new ThreeCxError(`Errore del centralino durante l'autenticazione (HTTP ${res.status}).`, res.status, detail)
  }

  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
  const token = json?.access_token
  if (!token) {
    throw new ThreeCxError("Il centralino ha risposto senza access_token.", 502)
  }

  const expiresInSec = typeof json?.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600
  tokenCache.set(key, { token, expiresAt: Date.now() + expiresInSec * 1000 })
  return token
}

async function authorizedFetch(
  cfg: ThreeCxConfig,
  path: string,
  init: RequestInit,
  retryOn401 = true,
): Promise<Response> {
  const token = await getAccessToken(cfg)
  const base = normalizeBaseUrl(cfg.baseUrl)

  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : "errore di rete"
    throw new ThreeCxError(`Centralino non raggiungibile (${reason}).`, 0)
  }

  // Un token puo' essere revocato prima della scadenza dichiarata: un solo
  // nuovo tentativo con token fresco, per non ciclare.
  if (res.status === 401 && retryOn401) {
    tokenCache.delete(cacheKey(cfg))
    await getAccessToken(cfg, { forceRefresh: true })
    return authorizedFetch(cfg, path, init, false)
  }

  return res
}

/**
 * Verifica la connessione: ottiene un token e legge gli interni disponibili.
 *
 * Il token da solo NON basta come prova: dimostra che le credenziali sono
 * valide, non che l'app abbia il permesso di controllo chiamate. Leggere
 * `/callcontrol` verifica anche gli scope.
 */
export async function testConnection(
  cfg: ThreeCxConfig,
): Promise<{ ok: true; extensions: Array<{ dn: string; devices: number }> } | { ok: false; error: string; status: number }> {
  try {
    const res = await authorizedFetch(cfg, "/callcontrol", { method: "GET" })
    if (res.status === 403) {
      return {
        ok: false,
        status: 403,
        error:
          "Autenticazione riuscita ma permessi insufficienti: all'app API va assegnato l'accesso al controllo chiamate (Call Control).",
      }
    }
    if (!res.ok) {
      const detail = await readBodySafely(res)
      return { ok: false, status: res.status, error: `Il centralino ha risposto HTTP ${res.status}. ${detail}`.trim() }
    }

    const json = (await res.json().catch(() => null)) as unknown
    const list = Array.isArray(json) ? json : []
    const extensions = list
      .map((item) => {
        const row = item as { dn?: unknown; devices?: unknown }
        const dn = typeof row?.dn === "string" ? row.dn : null
        if (!dn) return null
        return { dn, devices: Array.isArray(row?.devices) ? row.devices.length : 0 }
      })
      .filter((x): x is { dn: string; devices: number } => x !== null)

    return { ok: true, extensions }
  } catch (error) {
    if (error instanceof ThreeCxError) return { ok: false, error: error.message, status: error.status }
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    return { ok: false, error: message, status: 500 }
  }
}

/**
 * Origina una chiamata dall'interno `extension` verso `destination`.
 *
 * Come funziona per l'operatore: prima squilla il SUO telefono; quando risponde,
 * 3CX compone il numero del cliente. Se l'interno non e' registrato su nessun
 * dispositivo, il centralino non ha dove far squillare: caso gestito
 * esplicitamente perche' altrimenti il clic sembrerebbe non fare nulla.
 */
export async function makeCall(
  cfg: ThreeCxConfig,
  extension: string,
  destination: string,
): Promise<{ ok: true; callId: string | null } | { ok: false; error: string; status: number }> {
  try {
    const res = await authorizedFetch(cfg, `/callcontrol/${encodeURIComponent(extension)}/makecall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, timeout: 30 }),
    })

    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        error: `Interno ${extension} non trovato sul centralino.`,
      }
    }
    if (res.status === 403) {
      // Causa quasi sempre questa, verificata sulla documentazione: l'interno
      // non e' fra quelli selezionati nell'app API, oppure il ruolo assegnato
      // (User, Receptionist) non consente di comandare interni altrui. Dirlo
      // qui evita di far cercare il guasto nelle credenziali, che sono valide.
      return {
        ok: false,
        status: 403,
        error:
          `Il centralino ha negato la chiamata sull'interno ${extension}. Nella console 3CX, in Integrations → API, ` +
          `verificate che questo interno sia nell'elenco di quelli monitorati dall'applicazione e che il ruolo sia System Owner.`,
      }
    }
    if (!res.ok) {
      const detail = await readBodySafely(res)
      return {
        ok: false,
        status: res.status,
        error:
          res.status === 409
            ? `L'interno ${extension} non risulta registrato su alcun dispositivo: apri l'app 3CX o il telefono e riprova.`
            : `Il centralino ha rifiutato la chiamata (HTTP ${res.status}). ${detail}`.trim(),
      }
    }

    // 202 senza corpo e' una risposta legittima: accettata ma non ancora
    // processata. Non e' un errore, ma l'id chiamata puo' mancare.
    const json = (await res.json().catch(() => null)) as { result?: { id?: unknown }; id?: unknown } | null
    const rawId = json?.result?.id ?? json?.id
    const callId = rawId == null ? null : String(rawId)
    return { ok: true, callId }
  } catch (error) {
    if (error instanceof ThreeCxError) return { ok: false, error: error.message, status: error.status }
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    return { ok: false, error: message, status: 500 }
  }
}
