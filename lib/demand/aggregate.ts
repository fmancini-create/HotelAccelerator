import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Il calendario della domanda: le estrazioni diventano numeri per giorno.
 *
 * Aggregato una volta e materializzato, non ricalcolato a ogni apertura della
 * pagina: sono migliaia di righe, e Santaddeo deve poter leggere lo stesso dato
 * stabile che vede l'operatore, non una versione ricalcolata a metà.
 *
 * Il giorno del calendario è quello dell'EVENTO (arrivo, servizio), non quello
 * del messaggio: "quanti mi cercano per il 14 agosto" è la domanda a cui un
 * revenue manager deve rispondere.
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
  reference_date: string | null
  kind: string
  payload: Record<string, unknown>
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

interface Bucket {
  value: number
  breakdown: Record<string, number>
}

type Key = string // groupId|date|metric

function bump(map: Map<Key, Bucket>, groupId: string, date: string, metric: string, by: number, tag?: string) {
  const k = `${groupId}|${date}|${metric}`
  const cur = map.get(k) ?? { value: 0, breakdown: {} }
  cur.value += by
  if (tag) cur.breakdown[tag] = (cur.breakdown[tag] ?? 0) + by
  map.set(k, cur)
}

/**
 * Ricalcola il calendario per una struttura.
 *
 * Legge TUTTE le estrazioni in una volta e aggrega in memoria: la prima
 * versione faceva una query per gruppo e per giorno, cioè centinaia di andate e
 * ritorno che in serverless finiscono in timeout.
 */
export async function rebuildDemandCalendar(
  supabase: SupabaseClient,
  propertyId: string,
  opts: { fromDate?: string } = {},
): Promise<{ days: number; rows: number; extractions: number }> {
  const rows: ExtractionForAggregate[] = []
  const PAGE = 1000
  let offset = 0

  // Supabase tronca a 1000 righe anche con limit più alto: si pagina sempre.
  for (;;) {
    let q = supabase
      .from("conversation_extractions")
      .select("group_id, reference_date, kind, payload")
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

    if (r.kind === "chiamata") {
      bump(map, r.group_id, date, METRICS.chiamate, 1, String(p.direzione ?? "sconosciuta"))
      if (p.stato === "missed" || p.stato === "no_answer") {
        bump(map, r.group_id, date, METRICS.chiamate_perse, 1)
      }
      continue
    }

    if (r.kind === "nessuna_domanda" || r.kind === "formato_non_riconosciuto") continue

    bump(map, r.group_id, date, METRICS.richieste, 1, r.kind)

    const ospiti = num(p.ospiti) ?? num(p.persone) ?? num(p.invitati)
    if (ospiti !== null) bump(map, r.group_id, date, METRICS.ospiti, ospiti)

    const coperti = num(p.coperti)
    if (coperti !== null) bump(map, r.group_id, date, METRICS.coperti, coperti)

    const esito = typeof p.esito === "string" ? p.esito : null
    if (esito === "confermata") bump(map, r.group_id, date, METRICS.confermate, 1)
    if (esito === "persa" || esito === "annullata") bump(map, r.group_id, date, METRICS.perse, 1, esito)
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

  // Le righe rimaste da un calcolo precedente e non più prodotte vanno
  // rimosse, altrimenti un dato corretto convive con il suo fantasma.
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
