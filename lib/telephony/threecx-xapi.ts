import "server-only"

import { getAccessToken, normalizeBaseUrl, ThreeCxError, type ThreeCxConfig } from "@/lib/telephony/threecx-client"

export type ThreeCxQueueAudio = {
  id: number
  number: string
  name: string | null
  onHoldFile: string | null
}

export type ThreeCxAudioInspection = {
  pbxVersion: string | null
  queue: ThreeCxQueueAudio | null
  systemMusicOnHold: string | null
  systemMusicOnHoldAccessible: boolean
  accessScope: "system" | "department"
  transferMusicCandidate: string | null
  transferMusicConfigured: boolean
}

// 3CX ships with this as the default system Music on Hold file. It is used only
// as a safe fallback when a department-scoped Service Principal can edit its
// own Queue but cannot read the global MusicOnHoldSettings resource.
const DEFAULT_3CX_MOH = "onhold.wav"

function odataString(value: string): string {
  return value.replace(/'/g, "''")
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text.slice(0, 800)
  } catch {
    return ""
  }
}

async function xapiFetch(cfg: ThreeCxConfig, path: string, init: RequestInit = {}, retryOn401 = true): Promise<Response> {
  let token = await getAccessToken(cfg)
  const base = normalizeBaseUrl(cfg.baseUrl)

  const request = async (accessToken: string) =>
    fetch(`${base}/xapi/v1${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })

  let res: Response
  try {
    res = await request(token)
  } catch (error) {
    const reason = error instanceof Error ? error.message : "errore di rete"
    throw new ThreeCxError(`Centralino non raggiungibile durante la configurazione audio (${reason}).`, 0)
  }

  if (res.status === 401 && retryOn401) {
    token = await getAccessToken(cfg, { forceRefresh: true })
    try {
      return await request(token)
    } catch (error) {
      const reason = error instanceof Error ? error.message : "errore di rete"
      throw new ThreeCxError(`Centralino non raggiungibile durante la configurazione audio (${reason}).`, 0)
    }
  }

  return res
}

async function ensureXapiOk(res: Response, operation: string): Promise<void> {
  if (res.ok) return
  const detail = await readError(res)
  if (res.status === 401) {
    throw new ThreeCxError("Credenziali 3CX rifiutate dalla Configuration API.", 401, detail)
  }
  if (res.status === 403) {
    throw new ThreeCxError(
      "La credenziale 3CX e' valida, ma il ruolo non puo' accedere a questa risorsa XAPI. Con ruolo Owner l'oggetto deve appartenere allo stesso dipartimento del Service Principal; per accesso globale usa System Owner o System Administrator.",
      403,
      detail,
    )
  }
  throw new ThreeCxError(`3CX ha rifiutato ${operation} (HTTP ${res.status}).`, res.status, detail)
}

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/**
 * Legge solo i dati necessari alla UX audio 4BID. Non modifica il PBX.
 *
 * Importante: NON usiamo /Defs come gate di autorizzazione. /Defs e
 * /MusicOnHoldSettings sono risorse globali e possono rispondere 403 a un
 * Service Principal correttamente limitato al solo dipartimento 4BID, mentre
 * /Queues resta perfettamente utilizzabile per la coda appartenente al reparto.
 */
export async function inspectThreeCxAudio(cfg: ThreeCxConfig, queueNumber = "820"): Promise<ThreeCxAudioInspection> {
  const queueParams = new URLSearchParams({
    "$filter": `Number eq '${odataString(queueNumber)}'`,
    "$select": "Id,Number,Name,OnHoldFile",
  })
  const queueRes = await xapiFetch(cfg, `/Queues?${queueParams.toString()}`, { method: "GET" })
  await ensureXapiOk(queueRes, `la lettura della coda ${queueNumber}`)
  const pbxVersionFromQueue = queueRes.headers.get("x-3cx-version")
  const queueJson = (await queueRes.json().catch(() => null)) as
    | { value?: Array<{ Id?: unknown; Number?: unknown; Name?: unknown; OnHoldFile?: unknown }> }
    | null
  const row = Array.isArray(queueJson?.value) ? queueJson!.value![0] : null
  const queue =
    row && typeof row.Id === "number" && typeof row.Number === "string"
      ? {
          id: row.Id,
          number: row.Number,
          name: firstString(row.Name),
          onHoldFile: firstString(row.OnHoldFile),
        }
      : null

  // /Defs e' utile per la versione PBX, ma non deve rendere falso-negativa una
  // credenziale Owner di dipartimento. Se e' vietato, continuiamo con lo scope
  // dipartimentale e usiamo l'header della Queue quando disponibile.
  let pbxVersion = pbxVersionFromQueue
  let defsAccessible = false
  const defs = await xapiFetch(cfg, "/Defs?$select=Id", { method: "GET" })
  if (defs.ok) {
    defsAccessible = true
    pbxVersion = defs.headers.get("x-3cx-version") || pbxVersion
  } else if (defs.status === 401) {
    await ensureXapiOk(defs, "la verifica della Configuration API")
  }

  const mohSelect = ["MusicOnHold", ...Array.from({ length: 9 }, (_, index) => `MusicOnHold${index + 1}`)].join(",")
  const mohRes = await xapiFetch(cfg, `/MusicOnHoldSettings?$select=${encodeURIComponent(mohSelect)}`, { method: "GET" })
  let systemMusicOnHoldAccessible = false
  let systemMusicOnHold: string | null = null

  if (mohRes.ok) {
    systemMusicOnHoldAccessible = true
    const mohJson = (await mohRes.json().catch(() => null)) as Record<string, unknown> | null
    systemMusicOnHold = mohJson
      ? ["MusicOnHold", ...Array.from({ length: 9 }, (_, index) => `MusicOnHold${index + 1}`)]
          .map((key) => firstString(mohJson[key]))
          .find(Boolean) ?? null
      : null
  } else if (mohRes.status === 401) {
    await ensureXapiOk(mohRes, "la lettura della musica di attesa")
  } else if (mohRes.status !== 403) {
    await ensureXapiOk(mohRes, "la lettura della musica di attesa")
  }

  const accessScope: "system" | "department" = defsAccessible && systemMusicOnHoldAccessible ? "system" : "department"
  const transferMusicCandidate = systemMusicOnHold || (!systemMusicOnHoldAccessible ? DEFAULT_3CX_MOH : null)

  return {
    pbxVersion,
    queue,
    systemMusicOnHold,
    systemMusicOnHoldAccessible,
    accessScope,
    transferMusicCandidate,
    transferMusicConfigured: Boolean(queue?.onHoldFile),
  }
}

/**
 * Imposta sulla coda la prima Music on Hold disponibile nel PBX.
 *
 * Con Service Principal Owner di dipartimento, 3CX puo' negare la lettura della
 * libreria MOH globale pur consentendo di modificare la Queue del dipartimento.
 * In quel caso tentiamo il file standard `onhold.wav`; la PATCH resta confinata
 * alla sola coda 820 e 3CX rifiuta la richiesta se quel riferimento non e'
 * valido, quindi non modifichiamo altri reparti o impostazioni globali.
 */
export async function configureQueueHoldMusic(
  cfg: ThreeCxConfig,
  queueNumber = "820",
): Promise<ThreeCxAudioInspection> {
  const before = await inspectThreeCxAudio(cfg, queueNumber)
  if (!before.queue) {
    throw new ThreeCxError(`La coda ${queueNumber} non esiste nel PBX 3CX o non appartiene al dipartimento autorizzato.`, 404)
  }
  if (before.queue.onHoldFile) return before

  const candidate = before.transferMusicCandidate
  if (!candidate) {
    throw new ThreeCxError(
      "Nel PBX non risulta alcun file Music on Hold disponibile. Configura una musica nel dipartimento 4BID o nel sistema 3CX e riprova.",
      409,
    )
  }

  const update = await xapiFetch(cfg, `/Queues(${before.queue.id})`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ OnHoldFile: candidate }),
  })
  await ensureXapiOk(update, `l'aggiornamento della musica di attesa della coda ${queueNumber}`)

  const after = await inspectThreeCxAudio(cfg, queueNumber)
  if (!after.queue?.onHoldFile) {
    throw new ThreeCxError(
      `3CX ha accettato l'aggiornamento della coda ${queueNumber}, ma non restituisce un file Music on Hold configurato.`,
      409,
    )
  }
  return after
}
