export interface HistoricalSyncChannel {
  id: string
  email?: string | null
}

export interface HistoricalSyncProgress {
  channelId: string
  email: string | null
  channelIndex: number
  channelCount: number
  processed: number
  imported: number
  duplicates: number
  errors: number
}

interface HistoricalSyncOptions {
  shouldStop?: () => boolean
  onProgress?: (progress: HistoricalSyncProgress) => void
}

const MAX_PAGES_PER_CHANNEL = 2000
const RATE_LIMIT_DELAY_MS = 3000

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

/**
 * Esegue la sincronizzazione storica paginata senza tenere aperta una singola
 * funzione Vercel per tutta la casella. Il server salva il page token dopo ogni
 * pagina, quindi chiudere o ricaricare la scheda non perde l'avanzamento.
 *
 * I canali arrivano sempre da endpoint tenant-aware: qui non si accetta mai un
 * property_id dal browser.
 */
export async function syncHistoricalChannels(
  channels: HistoricalSyncChannel[],
  options: HistoricalSyncOptions = {},
): Promise<HistoricalSyncProgress> {
  let completed = { processed: 0, imported: 0, duplicates: 0, errors: 0 }
  let latest: HistoricalSyncProgress = {
    channelId: "",
    email: null,
    channelIndex: 0,
    channelCount: channels.length,
    ...completed,
  }

  for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
    if (options.shouldStop?.()) break

    const channel = channels[channelIndex]
    let done = false
    let attempts = 0
    let current = { processed: 0, imported: 0, duplicates: 0, errors: 0 }

    while (!done && !options.shouldStop?.() && attempts < MAX_PAGES_PER_CHANNEL) {
      attempts++
      const response = await fetch("/api/channels/email/sync/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ channel_id: channel.id }),
      })

      if (response.status === 429) {
        await wait(RATE_LIMIT_DELAY_MS)
        continue
      }

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || `Sincronizzazione storica non riuscita (HTTP ${response.status})`)
      }

      current = {
        processed: data.processed || 0,
        imported: data.imported || 0,
        duplicates: data.duplicates || 0,
        errors: data.errors || 0,
      }
      done = Boolean(data.done)
      latest = {
        channelId: channel.id,
        email: channel.email ?? null,
        channelIndex: channelIndex + 1,
        channelCount: channels.length,
        processed: completed.processed + current.processed,
        imported: completed.imported + current.imported,
        duplicates: completed.duplicates + current.duplicates,
        errors: completed.errors + current.errors,
      }
      options.onProgress?.(latest)
    }

    if (!done && !options.shouldStop?.()) {
      throw new Error(`Sincronizzazione storica troppo lunga per ${channel.email || channel.id}`)
    }

    completed = {
      processed: completed.processed + current.processed,
      imported: completed.imported + current.imported,
      duplicates: completed.duplicates + current.duplicates,
      errors: completed.errors + current.errors,
    }
  }

  return latest
}
