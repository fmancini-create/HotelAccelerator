/**
 * Quali sorgenti contano nelle statistiche.
 *
 * Perche' questo modulo esiste: il cruscotto contava "7.682 conversazioni email"
 * sommando TUTTE le caselle della struttura. Misurato che fra quelle caselle ci
 * sono due indirizzi di 4BID Srl (l'agenzia, 209 conversazioni) e la posta
 * personale del titolare (6.806). Il numero era vero come somma e falso come
 * indicazione: non diceva quanto lavora l'hotel.
 *
 * Due fatti misurati che governano il filtro, e che NON sono simmetrici:
 *
 *   - le conversazioni email hanno tutte la casella collegata (7.684 su 7.684)
 *     => si possono filtrare per singola casella;
 *   - le conversazioni di chat, WhatsApp e Telegram NON hanno mai il canale
 *     collegato (0 su 9) => si possono filtrare solo per tipo di canale.
 *
 * Se avessi filtrato tutto per `channel_id` avrei escluso in silenzio ogni
 * conversazione di messaggistica, cioe' avrei "spento" canali che l'utente
 * aveva scelto di monitorare.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type AnalyticsSourceKind = "email_channel" | "messaging_channel"

export type AnalyticsSource = {
  kind: AnalyticsSourceKind
  id: string
  /** Nome mostrato a schermo. */
  label: string
  /** Indirizzo email oppure tipo di canale: serve a distinguere caselle omonime. */
  reference: string
  /** Tipo di canale delle conversazioni ("email", "whatsapp", ...). */
  channelType: string
  /** Se conta nelle statistiche. */
  included: boolean
  /**
   * Se la scelta e' stata fatta a mano. Distinguere "mai deciso" da "incluso
   * apposta" evita di far credere che qualcuno abbia approvato la casella
   * personale del titolare fra le statistiche dell'hotel.
   */
  decided: boolean
}

export type AnalyticsFilter = {
  /** Caselle email incluse. `null` = nessun filtro (tutte). */
  emailChannelIds: string[] | null
  /** Tipi di canale di messaggistica inclusi. `null` = nessun filtro. */
  messagingChannelTypes: string[] | null
  /** Vero quando nessuna sorgente e' stata esclusa: i numeri sono quelli storici. */
  tutteIncluse: boolean
  /** Quante sorgenti sono state escluse a mano. Va dichiarato a schermo. */
  escluse: number
  /**
   * Vero quando l'utente ha escluso TUTTO. In quel caso i conteggi valgono zero
   * per scelta, non per guasto: chi legge deve poterlo distinguere.
   */
  nessunaInclusa: boolean
}

/** Nessuna sorgente esclusa: usato quando la lettura della scelta non riesce. */
export const FILTRO_APERTO: AnalyticsFilter = {
  emailChannelIds: null,
  messagingChannelTypes: null,
  tutteIncluse: true,
  escluse: 0,
  nessunaInclusa: false,
}

/**
 * Elenca le sorgenti reali della struttura con la scelta corrente.
 *
 * Le sorgenti si leggono sempre dalle tabelle dei canali, non dalla tabella
 * delle scelte: altrimenti una casella aggiunta dopo non comparirebbe e
 * resterebbe conteggiata senza che nessuno la veda in elenco.
 */
export async function listAnalyticsSources(
  sb: SupabaseClient,
  propertyId: string,
): Promise<{ sources: AnalyticsSource[]; filter: AnalyticsFilter; leggibile: boolean }> {
  const [caselle, canali, scelte] = await Promise.all([
    sb
      .from("email_channels")
      .select("id, display_name, email_address, is_active")
      .eq("property_id", propertyId),
    sb
      .from("messaging_channels")
      .select("id, display_name, channel_type, is_active")
      .eq("property_id", propertyId),
    sb
      .from("analytics_source_selection")
      .select("source_kind, source_id, included")
      .eq("property_id", propertyId),
  ])

  // Se la scelta non e' leggibile non si inventa "tutto incluso" in silenzio: si
  // restituisce il filtro aperto (numeri storici) ma dichiarando l'incertezza,
  // cosi' la pagina puo' dirlo invece di mostrare una spunta che non e' vera.
  const leggibile = !scelte.error

  const decise = new Map<string, boolean>()
  for (const r of scelte.data ?? []) {
    decise.set(`${r.source_kind}:${r.source_id}`, r.included !== false)
  }

  const sources: AnalyticsSource[] = []

  for (const c of caselle.data ?? []) {
    const chiave = `email_channel:${c.id}`
    sources.push({
      kind: "email_channel",
      id: c.id,
      label: c.display_name || c.email_address || "Casella senza nome",
      reference: c.email_address ?? "",
      channelType: "email",
      included: decise.get(chiave) ?? true,
      decided: decise.has(chiave),
    })
  }

  for (const c of canali.data ?? []) {
    const chiave = `messaging_channel:${c.id}`
    sources.push({
      kind: "messaging_channel",
      id: c.id,
      label: c.display_name || c.channel_type || "Canale senza nome",
      reference: c.channel_type ?? "",
      channelType: c.channel_type ?? "",
      included: decise.get(chiave) ?? true,
      decided: decise.has(chiave),
    })
  }

  return { sources, filter: buildAnalyticsFilter(sources), leggibile }
}

/**
 * Traduce l'elenco delle sorgenti in un filtro applicabile alle conversazioni.
 *
 * Quando tutte le sorgenti di un tipo sono incluse il filtro resta `null`
 * (nessuna clausola): elencare tutti gli id funzionerebbe, ma basterebbe
 * aggiungere una casella per vederla sparire dai conteggi senza motivo
 * apparente.
 */
export function buildAnalyticsFilter(sources: AnalyticsSource[]): AnalyticsFilter {
  const email = sources.filter((s) => s.kind === "email_channel")
  const messaggi = sources.filter((s) => s.kind === "messaging_channel")

  const emailIn = email.filter((s) => s.included)
  const messaggiIn = messaggi.filter((s) => s.included)

  const escluse = sources.filter((s) => !s.included).length
  const tutteIncluse = escluse === 0

  return {
    emailChannelIds: emailIn.length === email.length ? null : emailIn.map((s) => s.id),
    messagingChannelTypes:
      messaggiIn.length === messaggi.length ? null : [...new Set(messaggiIn.map((s) => s.channelType))],
    tutteIncluse,
    escluse,
    nessunaInclusa: sources.length > 0 && emailIn.length === 0 && messaggiIn.length === 0,
  }
}

/**
 * Le caselle email da contare, o `null` se tutte.
 *
 * Serve a chi conta le conversazioni email: `q.in("channel_id", ids)`.
 */
export function caselleDaContare(filter: AnalyticsFilter): string[] | null {
  return filter.emailChannelIds
}

/**
 * Se un tipo di canale di messaggistica va contato.
 *
 * La messaggistica non ha il canale collegato sulle conversazioni (misurato: 0
 * su 9), quindi la sola scelta possibile e' per tipo.
 */
export function canaleIncluso(filter: AnalyticsFilter, channelType: string): boolean {
  if (filter.messagingChannelTypes === null) return true
  return filter.messagingChannelTypes.includes(channelType)
}
