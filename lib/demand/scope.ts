import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Quali conversazioni appartengono al perimetro di un gruppo di lavoro.
 *
 * Le due vie non sono simmetriche, e la differenza e' misurata sui dati veri,
 * non dedotta dallo schema:
 *
 *   - EMAIL: `conversations.channel_id` punta alla casella ed e' popolato su
 *     tutte le conversazioni email. Si seleziona per casella.
 *   - MESSAGGISTICA: `channel_id` non e' affidabile; si seleziona per TIPO di
 *     canale (`whatsapp`/`telegram`/`chat`).
 *
 * Le telefonate sono una terza sorgente: restano nella tabella `phone_calls`,
 * sempre filtrata per property_id, e quando 3CX consegna la trascrizione il
 * motore domanda puo' analizzarla con lo stesso estrattore usato per il testo
 * libero delle altre conversazioni.
 */

export type MessagingKind = "whatsapp" | "telegram" | "chat"

export const MESSAGING_KINDS: MessagingKind[] = ["whatsapp", "telegram", "chat"]

export interface TrackingSources {
  /** Caselle email incluse. Vuoto = nessuna email. */
  email_channel_ids: string[]
  /** Tipi di canale di messaggistica inclusi. Vuoto = nessuna messaggistica. */
  messaging_kinds: MessagingKind[]
  /** Includere le chiamate telefoniche; se trascritte, analizzare anche il contenuto. */
  include_phone: boolean
}

export const EMPTY_SOURCES: TrackingSources = {
  email_channel_ids: [],
  messaging_kinds: [],
  include_phone: false,
}

/** Normalizza cio' che arriva dal database o dal form: mai fidarsi del jsonb. */
export function normalizeSources(raw: unknown): TrackingSources {
  const obj = (raw ?? {}) as Record<string, unknown>
  const ids = Array.isArray(obj.email_channel_ids)
    ? obj.email_channel_ids.filter((v): v is string => typeof v === "string")
    : []
  const kinds = Array.isArray(obj.messaging_kinds)
    ? obj.messaging_kinds.filter((v): v is MessagingKind => MESSAGING_KINDS.includes(v as MessagingKind))
    : []
  return {
    email_channel_ids: Array.from(new Set(ids)),
    messaging_kinds: Array.from(new Set(kinds)),
    include_phone: obj.include_phone === true,
  }
}

export function sourcesAreEmpty(s: TrackingSources): boolean {
  return s.email_channel_ids.length === 0 && s.messaging_kinds.length === 0 && !s.include_phone
}

export interface ConversationRow {
  id: string
  channel: string | null
  channel_id: string | null
  subject: string | null
  contact_email: string | null
  contact_name: string | null
  created_at: string
  last_message_at: string | null
}

const CONVERSATION_COLUMNS =
  "id, channel, channel_id, subject, contact_email, contact_name, created_at, last_message_at"

export async function listScopedConversations(
  supabase: SupabaseClient,
  propertyId: string,
  sources: TrackingSources,
  opts: { since?: string; limit?: number; skipIds?: Set<string> } = {},
): Promise<ConversationRow[]> {
  const limit = opts.limit ?? 500
  const out: ConversationRow[] = []
  const skip = opts.skipIds ?? new Set<string>()
  const fetchLimit = skip.size > 0 ? Math.min(1000, limit + skip.size) : limit

  if (sources.email_channel_ids.length > 0) {
    let q = supabase
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("property_id", propertyId)
      .in("channel_id", sources.email_channel_ids)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(fetchLimit)
    if (opts.since) q = q.gte("created_at", opts.since)
    const { data, error } = await q
    if (error) throw new Error(`Lettura conversazioni email: ${error.message}`)
    out.push(...((data ?? []) as ConversationRow[]))
  }

  if (sources.messaging_kinds.length > 0) {
    let q = supabase
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("property_id", propertyId)
      .in("channel", sources.messaging_kinds)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(fetchLimit)
    if (opts.since) q = q.gte("created_at", opts.since)
    const { data, error } = await q
    if (error) throw new Error(`Lettura conversazioni messaggistica: ${error.message}`)
    out.push(...((data ?? []) as ConversationRow[]))
  }

  const seen = new Set<string>()
  const deduped = out.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
  return deduped.filter((c) => !skip.has(c.id)).slice(0, limit)
}

/** Colonne reali della tabella phone_calls usate dal tracking domanda. */
export interface PhoneCallRow {
  id: string
  started_at: string | null
  direction: string | null
  status: string | null
  duration_seconds: number | null
  counterpart_number: string | null
  extension: string | null
  transcription: string | null
  transcription_summary: string | null
  recording_url: string | null
  sentiment: string | null
  transcription_updated_at: string | null
}

/**
 * Chiamate nel perimetro del tenant. Quando `transcription` e' disponibile il
 * chiamante viene trattato come una conversazione: il contenuto passa allo
 * stesso estrattore configurabile del gruppo. Se manca, restano disponibili i
 * soli metadati per misurare pressione telefonica e chiamate perse.
 */
export async function listScopedCalls(
  supabase: SupabaseClient,
  propertyId: string,
  sources: TrackingSources,
  opts: { since?: string; limit?: number } = {},
): Promise<PhoneCallRow[]> {
  if (!sources.include_phone) return []
  let q = supabase
    .from("phone_calls")
    .select(
      "id, started_at, direction, status, duration_seconds, counterpart_number, extension, transcription, transcription_summary, recording_url, sentiment, transcription_updated_at",
    )
    .eq("property_id", propertyId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 500)
  if (opts.since) q = q.gte("started_at", opts.since)
  const { data, error } = await q
  if (error) throw new Error(`Lettura chiamate: ${error.message}`)
  return (data ?? []) as PhoneCallRow[]
}
