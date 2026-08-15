import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Quali conversazioni appartengono al perimetro di un gruppo di lavoro.
 *
 * Le due vie non sono simmetriche, e la differenza è misurata sui dati veri,
 * non dedotta dallo schema:
 *
 *   - EMAIL: `conversations.channel_id` punta alla casella ed è popolato su
 *     TUTTE le conversazioni email (misurato: 7.375 su 7.375, zero nulle). Si
 *     seleziona per casella, che è anche il modo in cui l'admin ragiona ("il
 *     Front Office legge info@").
 *
 *   - MESSAGGISTICA: `channel_id` è NULL su tutte e 9 le conversazioni, e
 *     `metadata.messaging_channel_id` è assente su 2; dei 5 id presenti, 3
 *     puntano a canali che NON esistono più in messaging_channels. Selezionare
 *     per id coprirebbe 3 conversazioni su 9: si seleziona per TIPO di canale
 *     (whatsapp/telegram/chat), che è la colonna `channel`, sempre popolata.
 *
 * Selezionare la messaggistica per id sarebbe stato più elegante e avrebbe
 * perso due terzi dei dati.
 */

export type MessagingKind = "whatsapp" | "telegram" | "chat"

export const MESSAGING_KINDS: MessagingKind[] = ["whatsapp", "telegram", "chat"]

export interface TrackingSources {
  /** Caselle email incluse. Vuoto = nessuna email. */
  email_channel_ids: string[]
  /** Tipi di canale di messaggistica inclusi. Vuoto = nessuna messaggistica. */
  messaging_kinds: MessagingKind[]
  /** Includere le chiamate telefoniche (solo metadati: non c'è audio). */
  include_phone: boolean
}

export const EMPTY_SOURCES: TrackingSources = {
  email_channel_ids: [],
  messaging_kinds: [],
  include_phone: false,
}

/** Normalizza ciò che arriva dal database o dal form: mai fidarsi del jsonb. */
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

/**
 * Le conversazioni nel perimetro, ordinate dalla più recente.
 *
 * Le due vie sono interrogate separatamente e poi unite: un `or()` unico su
 * PostgREST con una lista di uuid è fragile — la virgola dentro `in.(...)`
 * spezza l'espressione, difetto già pagato sulle cartelle email.
 */
export async function listScopedConversations(
  supabase: SupabaseClient,
  propertyId: string,
  sources: TrackingSources,
  opts: { since?: string; limit?: number } = {},
): Promise<ConversationRow[]> {
  const limit = opts.limit ?? 500
  const out: ConversationRow[] = []

  if (sources.email_channel_ids.length > 0) {
    let q = supabase
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("property_id", propertyId)
      .in("channel_id", sources.email_channel_ids)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit)
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
      .limit(limit)
    if (opts.since) q = q.gte("created_at", opts.since)
    const { data, error } = await q
    if (error) throw new Error(`Lettura conversazioni messaggistica: ${error.message}`)
    out.push(...((data ?? []) as ConversationRow[]))
  }

  // Una conversazione non può cadere in entrambe le vie (channel_id è NULL
  // sulla messaggistica), ma la difesa costa una riga e non fa danni.
  const seen = new Set<string>()
  return out.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
}

/**
 * Le colonne sono quelle vere di `phone_calls`, lette dalla tabella e non
 * dedotte: non esistono `from_number`/`to_number`, il numero dell'altra parte
 * sta in `counterpart_number` e l'interno in `extension`.
 */
export interface PhoneCallRow {
  id: string
  started_at: string | null
  direction: string | null
  status: string | null
  duration_seconds: number | null
  counterpart_number: string | null
  extension: string | null
}

/**
 * Le chiamate nel perimetro.
 *
 * Non c'è né registrazione né trascrizione: il contenuto non è disponibile e
 * non viene inventato. Dalle chiamate si ricava solo la PRESSIONE della
 * domanda (quante, quando, quante perse), che è comunque un dato di revenue.
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
    .select("id, started_at, direction, status, duration_seconds, counterpart_number, extension")
    .eq("property_id", propertyId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 500)
  if (opts.since) q = q.gte("started_at", opts.since)
  const { data, error } = await q
  if (error) throw new Error(`Lettura chiamate: ${error.message}`)
  return (data ?? []) as PhoneCallRow[]
}
