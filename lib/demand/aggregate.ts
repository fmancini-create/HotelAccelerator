import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Il calendario della domanda: le estrazioni diventano numeri per giorno.
 *
 * Il giorno della richiesta e' quello dell'EVENTO (arrivo, servizio), mentre
 * la pressione telefonica resta attribuita al giorno in cui e' avvenuta la
 * chiamata. Una telefonata trascritta puo' quindi contribuire a entrambe le
 * letture senza spostare artificialmente il volume chiamate sulla data di
 * soggiorno richiesta dal cliente.
 */

export const METRICS = {
  richieste: "richieste",
  ospiti: "ospiti",
  coperti: "coperti",
  confermate: "confermate",
  perse: "perse",
  chiamate: "chiamate",
  chiamate_perse: "chiamate_perse",
} as const

interface ExtractionForAggregate {
  group_id: string
  phone_call_id: string | null
  reference_date: string | null
  kind: string
  channel: string | null
  payload: Record<string, unknown>
}

export const TAG_CANALE = "canale:"
export const TAG_TIPO = "tipo:"

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isoDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

interface Bucket {
  value: number
  breakdown: Record<string, number>
}

type Key = string

function bump(map: Map<Key, Bucket>, groupId: string, date: string, metric: string, by: number, tags: string[] = []) {
  const k = `${groupId}|${date}|${metric}`
  const cur = map.get(k) ?? { value: 0, breakdown: {} }
  cur.value += by
  for (const tag of tags) {
    if (tag) cur.breakdown[tag] = (cur.breakdown[tag] ?? 0) + by
  }
  map.set(k, cur)
}

function aggregateDemandPayload(
  map: Map<Key, Bucket>,
  groupId: string,
  date: string,
  payload: Record<string, unknown>,
  canale: string,
  tipo: string,
) {
  bump(map, groupId, date, METRICS.richieste, 1, [canale, `${TAG_TIPO}${tipo}`])

  const ospiti = num(payload.ospiti) ?? num(payload.persone) ?? num(payload.invitati)
  if (ospiti !== null) bump(map, groupId, date, METRICS.ospiti, ospiti)

  const coperti = num(payload.coperti)
  if (coperti !== null) bump(map, groupId, date, METRICS.coperti, coperti)

  const esito = typeof payload.esito === "string" ? payload.esito : null
  if (esito === "confermata") bump(map, groupId, date, METRICS.confermate, 1)
  if (esito === "persa" || esito === "annullata") {
    bump(map, groupId, date, METRICS.perse, 1, [`esito:${esito}`])
  }
}

export async function rebuildDemandCalendar(
  supabase: SupabaseClient,
  propertyId: string,
  opts: { fromDate?: string } = {},
): Promise<{ days: number; rows: number; extractions: number }> {
  const rows: ExtractionForAggregate[] = []
  const PAGE = 1000
  let offset = 0

  for (;;) {
    let q = supabase
      .from("conversation_extractions")
      .select("group_id, phone_call_id, reference_date, kind, channel, payload")
      .eq("property_id", propertyId)
      .not("reference_date", "is", null)
      .order("reference_date", { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (opts.fromDate) q = q.gte("reference_date", opts.fromDate)

    const { data, error } = await q
    if (error) throw new Error(`Lettura estrazioni: ${error.message}`)
    const batch = (data ?? []) as ExtractionForAggregate[]
    rows.push(...batch)
    if (batch.length < PAGE) break
    offset += PAGE
  }

  const map = new Map<Key, Bucket>()

  for (const r of rows) {
    const date = r.reference_date
    if (!date) continue
    const p = r.payload ?? {}
    const canale = `${TAG_CANALE}${r.channel ?? "sconosciuto"}`

    if (r.kind === "chiamata" || r.phone_call_id) {
      // La reference_date della riga telefonica resta il giorno della chiamata:
      // e' la data corretta per volume e chiamate perse.
      bump(map, r.group_id, date, METRICS.chiamate, 1, [canale, `direzione:${p.direzione ?? "sconosciuta"}`])
      if (p.stato === "missed" || p.stato === "no_answer") {
        bump(map, r.group_id, date, METRICS.chiamate_perse, 1, [canale])
      }

      // Se la chiamata e' stata trascritta, l'IA salva nello stesso envelope la
      // richiesta estratta. La sua data e' quella dell'evento richiesto, non la
      // data della telefonata: in questo modo il calendario risponde a
      // "quanti mi cercano per il 14 agosto?" anche quando hanno telefonato.
      const richiesta = obj(p.richiesta)
      if (richiesta?.presente === true) {
        const demandDate = isoDate(richiesta.reference_date)
        const dati = obj(richiesta.dati)
        if (demandDate && dati) {
          aggregateDemandPayload(map, r.group_id, demandDate, dati, canale, "domanda")
        }
      }
      continue
    }

    if (r.kind === "nessuna_domanda" || r.kind === "formato_non_riconosciuto") continue
    aggregateDemandPayload(map, r.group_id, date, p, canale, r.kind)
  }

  const payload = Array.from(map.entries()).map(([k, v]) => {
    const [group_id, date, metric] = k.split("|")
    return {
      property_id: propertyId,
      group_id,
      date,
      metric,
      value: v.value,
      breakdown: v.breakdown,
      computed_at: new Date().toISOString(),
    }
  })

  let del = supabase.from("demand_calendar_days").delete().eq("property_id", propertyId)
  if (opts.fromDate) del = del.gte("date", opts.fromDate)
  const { error: delError } = await del
  if (delError) throw new Error(`Pulizia calendario: ${delError.message}`)

  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500)
    const { error } = await supabase
      .from("demand_calendar_days")
      .upsert(chunk, { onConflict: "property_id,group_id,date,metric" })
    if (error) throw new Error(`Scrittura calendario: ${error.message}`)
  }

  const days = new Set(payload.map((p) => p.date)).size
  return { days, rows: payload.length, extractions: rows.length }
}
