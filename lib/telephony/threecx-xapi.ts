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
  transferMusicConfigured: boolean
}

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
      "La credenziale 3CX e' valida ma non ha accesso alla Configuration API (XAPI). In 3CX abilita '3CX Configuration API Access' sul Service Principal e usa ruolo System Owner.",
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
 * Fonti 3CX: /xapi/v1/Defs, /Queues e /MusicOnHoldSettings. La Queue espone
 * OnHoldFile e le impostazioni di sistema espongono MusicOnHold[0..9].
 */
export async function inspectThreeCxAudio(cfg: ThreeCxConfig, queueNumber = "820"): Promise<ThreeCxAudioInspection> {
  const defs = await xapiFetch(cfg, "/Defs?$select=Id", { method: "GET" })
  await ensureXapiOk(defs, "la verifica della Configuration API")
  const pbxVersion = defs.headers.get("x-3cx-version")

  const queueParams = new URLSearchParams({
    "$filter": `Number eq '${odataString(queueNumber)}'`,
    "$select": "Id,Number,Name,OnHoldFile",
  })
  const queueRes = await xapiFetch(cfg, `/Queues?${queueParams.toString()}`, { method: "GET" })
  await ensureXapiOk(queueRes, `la lettura della coda ${queueNumber}`)
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

  const mohSelect = ["MusicOnHold", ...Array.from({ length: 9 }, (_, index) => `MusicOnHold${index + 1}`)].join(",")
  const mohRes = await xapiFetch(cfg, `/MusicOnHoldSettings?$select=${encodeURIComponent(mohSelect)}`, { method: "GET" })
  await ensureXapiOk(mohRes, "la lettura della musica di attesa")
  const mohJson = (await mohRes.json().catch(() => null)) as Record<string, unknown> | null
  const systemMusicOnHold = mohJson
    ? ["MusicOnHold", ...Array.from({ length: 9 }, (_, index) => `MusicOnHold${index + 1}`)]
        .map((key) => firstString(mohJson[key]))
        .find(Boolean) ?? null
    : null

  return {
    pbxVersion,
    queue,
    systemMusicOnHold,
    transferMusicConfigured: Boolean(queue?.onHoldFile),
  }
}

/**
 * Imposta sulla coda la prima Music on Hold gia' disponibile nel PBX.
 * Non carica file e non tocca altre code/reparti: riduce il rischio sul PBX condiviso.
 */
export async function configureQueueHoldMusic(
  cfg: ThreeCxConfig,
  queueNumber = "820",
): Promise<ThreeCxAudioInspection> {
  const before = await inspectThreeCxAudio(cfg, queueNumber)
  if (!before.queue) {
    throw new ThreeCxError(`La coda ${queueNumber} non esiste nel PBX 3CX.`, 404)
  }
  if (!before.systemMusicOnHold) {
    throw new ThreeCxError(
      "Nel PBX non risulta alcun file Music on Hold disponibile. Caricane uno in 3CX prima di applicarlo alla coda.",
      409,
    )
  }

  const update = await xapiFetch(cfg, `/Queues(${before.queue.id})`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ OnHoldFile: before.systemMusicOnHold }),
  })
  await ensureXapiOk(update, `l'aggiornamento della musica di attesa della coda ${queueNumber}`)

  return inspectThreeCxAudio(cfg, queueNumber)
}
