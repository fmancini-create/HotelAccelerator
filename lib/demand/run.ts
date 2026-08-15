import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveReferenceField, presetByKey, type TrackingField } from "./fields"
import { listScopedConversations, listScopedCalls, normalizeSources, type TrackingSources } from "./scope"
import { parseMyrestoo, parseScidoo, structuredSourceOf } from "./parsers"
import { buildTranscript, cleanMessageText, MAX_CHARS_PER_CONVERSATION } from "./text"
import { extractWithModel, shouldSkipAsNoise, costMicroUsd } from "./extract"

/**
 * Una passata del cervello su un gruppo di lavoro.
 *
 * Tre livelli in cascata, dal più economico al più costoso:
 *   1. notifiche strutturate  -> regole, costo zero, esito deterministico
 *   2. mittenti automatici    -> escluse, registrate come "nessuna domanda"
 *   3. testo libero           -> modello, con i campi del reparto
 *
 * L'ordine non è un'ottimizzazione: leggere una conferma Scidoo col modello
 * darebbe un risultato PEGGIORE (e variabile) di un'espressione regolare su un
 * formato fisso.
 */

export interface TrackingConfigRow {
  id: string
  property_id: string
  group_id: string
  is_enabled: boolean
  preset: string
  sources: unknown
  fields: unknown
  version: number
}

export interface RunOptions {
  /** Analizza solo da questa data (ISO). Assente = tutto lo storico. */
  since?: string
  /** Quante conversazioni al massimo in questa passata. */
  limit?: number
  /** Non chiama il modello: utile per provare il perimetro senza spendere. */
  dryRun?: boolean
}

export interface RunReport {
  groupId: string
  configVersion: number
  scanned: number
  byRules: number
  skippedNoise: number
  byModel: number
  withDemand: number
  alreadyDone: number
  failed: number
  calls: number
  tokensIn: number
  tokensOut: number
  costMicroUsd: number
  errors: string[]
}

function parseFields(raw: unknown): TrackingField[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (f): f is TrackingField => !!f && typeof f === "object" && typeof (f as TrackingField).key === "string",
  )
}

/** Estrae la data di riferimento dal payload, se c'è ed è una data valida. */
function referenceDateOf(payload: Record<string, unknown>, refField: string | null): string | null {
  if (!refField) return null
  const v = payload[refField]
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return v
}

/**
 * Scrive un'estrazione senza creare doppioni.
 *
 * L'unicità è garantita da un indice UNIQUE nel database e non da un controllo
 * "esiste già?" in codice: due passate avviate insieme supererebbero entrambe
 * il controllo e scriverebbero due righe. Il codice quindi TENTA e interpreta
 * la violazione 23505 come "già fatto", che è race-safe per costruzione.
 */
async function saveExtraction(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<"inserted" | "already" | "error"> {
  const { error } = await supabase.from("conversation_extractions").insert(row)
  if (!error) return "inserted"
  if (error.code === "23505") return "already"
  throw new Error(error.message)
}

/**
 * Cosa è già stato estratto per questo gruppo a questa versione.
 *
 * Serve a NON pagare due volte. L'indice UNIQUE impedisce il doppione, ma lo
 * scopre solo al momento della scrittura: il modello era già stato chiamato e
 * il denaro già speso. Misurato sulla seconda passata: 0 righe nuove e lo
 * stesso costo della prima. Su 3.769 conversazioni sarebbero stati $4,92
 * buttati a ogni ripetizione.
 *
 * Questo controllo è una difesa del portafoglio, non dell'unicità: due passate
 * simultanee lo supererebbero entrambe, ed è per quello che l'indice resta.
 */
async function loadAlreadyDone(
  supabase: SupabaseClient,
  groupId: string,
  configVersion: number,
): Promise<{ conversations: Set<string>; calls: Set<string> }> {
  const conversations = new Set<string>()
  const calls = new Set<string>()
  const PAGE = 1000
  let offset = 0

  // Supabase tronca a 1000 righe anche chiedendone di più: si pagina sempre.
  for (;;) {
    const { data, error } = await supabase
      .from("conversation_extractions")
      .select("conversation_id, phone_call_id")
      .eq("group_id", groupId)
      .eq("config_version", configVersion)
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Lettura estrazioni già fatte: ${error.message}`)
    const batch = data ?? []
    for (const r of batch) {
      if (r.conversation_id) conversations.add(r.conversation_id as string)
      if (r.phone_call_id) calls.add(r.phone_call_id as string)
    }
    if (batch.length < PAGE) break
    offset += PAGE
  }
  return { conversations, calls }
}

export async function runTrackingForGroup(
  supabase: SupabaseClient,
  config: TrackingConfigRow,
  groupName: string,
  opts: RunOptions = {},
): Promise<RunReport> {
  const sources = normalizeSources(config.sources)
  const fields = parseFields(config.fields)
  const refField = resolveReferenceField(fields, config.preset)
  const presetLabel = presetByKey(config.preset)?.label ?? "Analisi conversazioni"
  const today = new Date().toISOString().slice(0, 10)

  const report: RunReport = {
    groupId: config.group_id,
    configVersion: config.version,
    scanned: 0,
    byRules: 0,
    skippedNoise: 0,
    byModel: 0,
    withDemand: 0,
    alreadyDone: 0,
    failed: 0,
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    costMicroUsd: 0,
    errors: [],
  }

  const conversations = await listScopedConversations(supabase, config.property_id, sources, {
    since: opts.since,
    limit: opts.limit ?? 200,
  })
  report.scanned = conversations.length

  const done = await loadAlreadyDone(supabase, config.group_id, config.version)

  for (const conv of conversations) {
    try {
      // Già estratta a questa versione: si salta PRIMA di leggere i messaggi e
      // prima di chiamare il modello. Ripetere una passata deve costare zero.
      if (done.conversations.has(conv.id)) {
        report.alreadyDone++
        continue
      }

      const base = {
        property_id: config.property_id,
        group_id: config.group_id,
        conversation_id: conv.id,
        config_version: config.version,
        // Il canale si porta dietro fin qui perché la pagina ripartisce le
        // sorgenti per canale (Email, WhatsApp, Telefono): senza questo dato
        // quella colonna resterebbe a zero accanto a numeri veri.
        channel: conv.channel ?? null,
      }

      // --- Livello 1: sorgenti strutturate, lette con regole ---
      const structured = structuredSourceOf(conv.contact_email)
      if (structured) {
        if (opts.dryRun) {
          report.byRules++
          continue
        }
        const { data: msgs } = await supabase
          .from("messages")
          .select("content")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true })
          .limit(1)

        const bodyText = cleanMessageText(msgs?.[0]?.content ?? null)
        const parsed =
          structured === "myrestoo"
            ? parseMyrestoo(conv.subject, conv.created_at)
            : parseScidoo(conv.subject, bodyText)

        if (parsed) {
          const res = await saveExtraction(supabase, {
            ...base,
            kind: parsed.kind,
            reference_date: parsed.referenceDate,
            payload: parsed.payload,
            confidence: parsed.confidence,
            method: `regole:${structured}`,
          })
          if (res === "already") report.alreadyDone++
          else {
            report.byRules++
            report.withDemand++
          }
          continue
        }
        // Formato non riconosciuto: non si passa al modello, si registra il
        // buco. Un formato cambiato va visto, non mascherato da una stima.
        const res = await saveExtraction(supabase, {
          ...base,
          kind: "formato_non_riconosciuto",
          payload: { sorgente: structured },
          method: `regole:${structured}`,
        })
        if (res === "already") report.alreadyDone++
        else report.byRules++
        continue
      }

      // --- Livello 2: mittenti automatici, esclusi senza spendere ---
      if (shouldSkipAsNoise(conv.contact_email)) {
        if (opts.dryRun) {
          report.skippedNoise++
          continue
        }
        const res = await saveExtraction(supabase, {
          ...base,
          kind: "nessuna_domanda",
          payload: { motivo: "mittente_automatico" },
          method: "esclusione",
        })
        if (res === "already") report.alreadyDone++
        else report.skippedNoise++
        continue
      }

      // --- Livello 3: testo libero, col modello ---
      if (fields.length === 0) {
        report.errors.push("Nessun campo configurato: il modello non saprebbe cosa estrarre.")
        break
      }
      if (opts.dryRun) {
        report.byModel++
        continue
      }

      const { data: msgs } = await supabase
        .from("messages")
        .select("content, sender_type")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .limit(30)

      const transcript = buildTranscript(msgs ?? [], MAX_CHARS_PER_CONVERSATION)
      if (!transcript.text) {
        const res = await saveExtraction(supabase, {
          ...base,
          kind: "nessuna_domanda",
          payload: { motivo: "testo_vuoto" },
          method: "esclusione",
        })
        if (res === "already") report.alreadyDone++
        else report.skippedNoise++
        continue
      }

      const out = await extractWithModel({
        subject: conv.subject,
        transcript: transcript.text,
        fields,
        groupName,
        presetLabel,
        today,
      })

      const cost = costMicroUsd(out.tokensIn, out.tokensOut)
      report.tokensIn += out.tokensIn
      report.tokensOut += out.tokensOut
      report.costMicroUsd += cost

      const res = await saveExtraction(supabase, {
        ...base,
        kind: out.containsDemand ? "domanda" : "nessuna_domanda",
        reference_date: out.containsDemand ? referenceDateOf(out.data, refField) : null,
        payload: out.containsDemand ? out.data : { motivo: "nessuna_domanda_rilevata" },
        confidence: out.confidence,
        method: "modello",
        model: "openai/gpt-5.4-mini",
        tokens_in: out.tokensIn,
        tokens_out: out.tokensOut,
        cost_micro_usd: cost,
        truncated: transcript.truncated,
      })
      if (res === "already") report.alreadyDone++
      else {
        report.byModel++
        if (out.containsDemand) report.withDemand++
      }
    } catch (e) {
      report.failed++
      const msg = e instanceof Error ? e.message : String(e)
      // Un solo messaggio per tipo: 3.000 volte lo stesso errore non informa.
      if (!report.errors.includes(msg)) report.errors.push(msg)
    }
  }

  // --- Chiamate: solo metadati, nessun contenuto ---
  const calls = await listScopedCalls(supabase, config.property_id, sources, {
    since: opts.since,
    limit: opts.limit ?? 500,
  })
  for (const call of calls) {
    try {
      if (done.calls.has(call.id)) {
        report.alreadyDone++
        continue
      }
      // Una "passata a vuoto" che scrive nel database non è a vuoto. Prima
      // questo ciclo ignorava dryRun e inseriva 40 righe di chiamate: la prova
      // successiva le trovava già fatte e sembrava tutto normale.
      if (opts.dryRun) {
        report.calls++
        continue
      }
      const day = call.started_at ? String(call.started_at).slice(0, 10) : null
      const res = await saveExtraction(supabase, {
        property_id: config.property_id,
        group_id: config.group_id,
        phone_call_id: call.id,
        config_version: config.version,
        channel: "phone",
        kind: "chiamata",
        reference_date: day,
        payload: {
          direzione: call.direction,
          stato: call.status,
          durata_secondi: call.duration_seconds,
          // Dichiarato, non simulato: 3CX non ci passa l'audio, quindi non
          // esiste trascrizione da analizzare.
          contenuto: "non_disponibile",
        },
        confidence: 1,
        method: "metadati",
      })
      if (res === "already") report.alreadyDone++
      else report.calls++
    } catch (e) {
      report.failed++
      const msg = e instanceof Error ? e.message : String(e)
      if (!report.errors.includes(msg)) report.errors.push(msg)
    }
  }

  // Nemmeno la data dell'ultima passata: a vuoto non è successo niente.
  if (!opts.dryRun) {
    await supabase
      .from("group_tracking_configs")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", config.id)
  }

  return report
}

export type { TrackingSources }
