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
 * Email e messaggistica usano tre livelli in cascata: sorgenti strutturate,
 * esclusione rumore e modello sul testo libero. Le telefonate entrano nello
 * stesso terzo livello quando 3CX ha consegnato una trascrizione; se il testo
 * non e' ancora disponibile viene conservata solo la pressione telefonica e la
 * chiamata resta riprendibile in una passata successiva.
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
  since?: string
  limit?: number
  dryRun?: boolean
  /** Timestamp assoluto oltre il quale la passata restituisce il controllo. */
  deadlineAt?: number
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
  stoppedForDeadline: boolean
}

type ExtractionTargetType = "conversation" | "phone_call"

const MIN_MODEL_BUDGET_MS = 8_000

function deadlineReached(opts: RunOptions, reserveMs = 0): boolean {
  return typeof opts.deadlineAt === "number" && Date.now() + reserveMs >= opts.deadlineAt
}

function modelAbortSignal(opts: RunOptions): AbortSignal | undefined {
  if (typeof opts.deadlineAt !== "number") return undefined
  return AbortSignal.timeout(Math.max(1, opts.deadlineAt - Date.now()))
}

function isDeadlineAbort(error: unknown, opts: RunOptions): boolean {
  if (deadlineReached(opts)) return true
  if (!(error instanceof Error)) return false
  return error.name === "TimeoutError" || error.name === "AbortError"
}

function parseFields(raw: unknown): TrackingField[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (f): f is TrackingField => !!f && typeof f === "object" && typeof (f as TrackingField).key === "string",
  )
}

function referenceDateOf(payload: Record<string, unknown>, refField: string | null): string | null {
  if (!refField) return null
  const v = payload[refField]
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return v
}

async function saveExtraction(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<"inserted" | "already"> {
  const { error } = await supabase.from("conversation_extractions").insert(row)
  if (!error) return "inserted"
  if (error.code === "23505") return "already"
  throw new Error(error.message)
}

/**
 * La stessa unique key della telefonata serve prima come placeholder dei soli
 * metadati e poi, quando arriva la trascrizione, come envelope dell'estrazione
 * IA. Il passaggio e' un UPDATE della riga esistente, non una seconda riga:
 * cosi' l'idempotenza rimane garantita dall'indice del database.
 */
async function savePhoneExtraction(
  supabase: SupabaseClient,
  row: Record<string, unknown> & {
    property_id: string
    group_id: string
    phone_call_id: string
    config_version: number
    method: string
  },
): Promise<"inserted" | "promoted" | "already"> {
  const findExisting = () =>
    supabase
      .from("conversation_extractions")
      .select("id, method")
      .eq("property_id", row.property_id)
      .eq("group_id", row.group_id)
      .eq("phone_call_id", row.phone_call_id)
      .eq("config_version", row.config_version)
      .maybeSingle()

  const existing = await findExisting()
  if (existing.error) throw new Error(existing.error.message)

  if (existing.data) {
    if (existing.data.method === "metadati" && row.method === "modello") {
      const { id: _id, ...values } = row as Record<string, unknown> & { id?: string }
      const { error } = await supabase
        .from("conversation_extractions")
        .update(values)
        .eq("id", existing.data.id)
        .eq("property_id", row.property_id)
      if (error) throw new Error(error.message)
      return "promoted"
    }
    return "already"
  }

  const inserted = await saveExtraction(supabase, row)
  if (inserted === "inserted") return "inserted"

  // Una seconda passata puo' aver inserito il placeholder fra SELECT e INSERT.
  // Se noi abbiamo gia' una trascrizione, promuoviamolo invece di rimandare il
  // lavoro al prossimo cron.
  if (row.method === "modello") {
    const raced = await findExisting()
    if (raced.error) throw new Error(raced.error.message)
    if (raced.data?.method === "metadati") {
      const { error } = await supabase
        .from("conversation_extractions")
        .update(row)
        .eq("id", raced.data.id)
        .eq("property_id", row.property_id)
      if (error) throw new Error(error.message)
      return "promoted"
    }
  }
  return "already"
}

async function claimModelExtraction(
  supabase: SupabaseClient,
  groupId: string,
  targetType: ExtractionTargetType,
  targetId: string,
  configVersion: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_demand_extraction", {
    p_group_id: groupId,
    p_target_type: targetType,
    p_target_id: targetId,
    p_config_version: configVersion,
    p_lease_seconds: 300,
  })
  if (error) throw new Error(`Claim estrazione: ${error.message}`)
  return data === true
}

async function releaseModelExtraction(
  supabase: SupabaseClient,
  groupId: string,
  targetType: ExtractionTargetType,
  targetId: string,
  configVersion: number,
): Promise<void> {
  const { error } = await supabase.rpc("release_demand_extraction_claim", {
    p_group_id: groupId,
    p_target_type: targetType,
    p_target_id: targetId,
    p_config_version: configVersion,
  })
  if (error) console.error("[v0][demand] rilascio claim fallito:", error.message)
}

/**
 * I placeholder telefonici `method=metadati` NON sono un'elaborazione finale:
 * la trascrizione 3CX puo' arrivare dopo il ReportCall iniziale. Per questo non
 * entrano nel set `calls` e vengono ricontrollati finche' non sono promossi a
 * `method=modello`. In assenza di testo il controllo costa solo una lettura DB,
 * non una chiamata al modello.
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

  for (;;) {
    const { data, error } = await supabase
      .from("conversation_extractions")
      .select("conversation_id, phone_call_id, method")
      .eq("group_id", groupId)
      .eq("config_version", configVersion)
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Lettura estrazioni gia' fatte: ${error.message}`)
    const batch = data ?? []
    for (const r of batch) {
      if (r.conversation_id) conversations.add(r.conversation_id as string)
      if (r.phone_call_id && r.method !== "metadati") calls.add(r.phone_call_id as string)
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
    stoppedForDeadline: false,
  }

  if (deadlineReached(opts)) {
    report.stoppedForDeadline = true
    return report
  }

  const done = await loadAlreadyDone(supabase, config.group_id, config.version)

  if (deadlineReached(opts)) {
    report.stoppedForDeadline = true
    return report
  }

  const conversations = await listScopedConversations(supabase, config.property_id, sources, {
    since: opts.since,
    limit: opts.limit ?? 200,
    skipIds: done.conversations,
  })
  report.scanned = conversations.length
  report.alreadyDone = done.conversations.size + done.calls.size

  for (const conv of conversations) {
    if (deadlineReached(opts)) {
      report.stoppedForDeadline = true
      break
    }

    try {
      if (done.conversations.has(conv.id)) {
        report.alreadyDone++
        continue
      }

      const base = {
        property_id: config.property_id,
        group_id: config.group_id,
        conversation_id: conv.id,
        config_version: config.version,
        channel: conv.channel ?? null,
      }

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

      if (fields.length === 0) {
        report.errors.push("Nessun campo configurato: il modello non saprebbe cosa estrarre.")
        break
      }
      if (opts.dryRun) {
        report.byModel++
        continue
      }
      if (deadlineReached(opts, MIN_MODEL_BUDGET_MS)) {
        report.stoppedForDeadline = true
        break
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

      if (deadlineReached(opts, MIN_MODEL_BUDGET_MS)) {
        report.stoppedForDeadline = true
        break
      }

      const claimed = await claimModelExtraction(
        supabase,
        config.group_id,
        "conversation",
        conv.id,
        config.version,
      )
      if (!claimed) {
        report.alreadyDone++
        continue
      }
      try {
        const out = await extractWithModel({
          subject: conv.subject,
          transcript: transcript.text,
          fields,
          groupName,
          presetLabel,
          today,
          abortSignal: modelAbortSignal(opts),
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
      } finally {
        await releaseModelExtraction(
          supabase,
          config.group_id,
          "conversation",
          conv.id,
          config.version,
        )
      }
    } catch (e) {
      if (isDeadlineAbort(e, opts)) {
        report.stoppedForDeadline = true
        break
      }
      report.failed++
      const msg = e instanceof Error ? e.message : String(e)
      if (!report.errors.includes(msg)) report.errors.push(msg)
    }
  }

  if (!report.stoppedForDeadline && !deadlineReached(opts)) {
    const calls = await listScopedCalls(supabase, config.property_id, sources, {
      since: opts.since,
      limit: opts.limit ?? 500,
    })

    for (const call of calls) {
      if (deadlineReached(opts)) {
        report.stoppedForDeadline = true
        break
      }

      try {
        if (done.calls.has(call.id)) {
          report.alreadyDone++
          continue
        }

        const callDay = call.started_at ? String(call.started_at).slice(0, 10) : null
        const rawTranscript = call.transcription?.trim() ?? ""
        const hasTranscript = rawTranscript.length > 0
        const phoneMeta = {
          direzione: call.direction,
          stato: call.status,
          durata_secondi: call.duration_seconds,
        }

        if (!hasTranscript) {
          if (opts.dryRun) {
            report.calls++
            continue
          }
          const res = await savePhoneExtraction(supabase, {
            property_id: config.property_id,
            group_id: config.group_id,
            phone_call_id: call.id,
            config_version: config.version,
            channel: "phone",
            kind: "chiamata",
            reference_date: callDay,
            payload: {
              ...phoneMeta,
              contenuto: "non_disponibile",
            },
            confidence: 1,
            method: "metadati",
          })
          if (res === "inserted") report.calls++
          else report.alreadyDone++
          continue
        }

        if (fields.length === 0) {
          const msg = "Nessun campo configurato: la trascrizione telefonica non puo' essere analizzata."
          if (!report.errors.includes(msg)) report.errors.push(msg)
          continue
        }

        if (opts.dryRun) {
          report.calls++
          report.byModel++
          continue
        }
        if (deadlineReached(opts, MIN_MODEL_BUDGET_MS)) {
          report.stoppedForDeadline = true
          break
        }

        const claimed = await claimModelExtraction(
          supabase,
          config.group_id,
          "phone_call",
          call.id,
          config.version,
        )
        if (!claimed) {
          report.alreadyDone++
          continue
        }

        try {
          const truncated = rawTranscript.length > MAX_CHARS_PER_CONVERSATION
          const phoneTranscript = rawTranscript.slice(0, MAX_CHARS_PER_CONVERSATION)
          const out = await extractWithModel({
            subject: call.direction === "outbound" ? "Telefonata in uscita" : "Telefonata in arrivo",
            transcript: phoneTranscript,
            fields,
            groupName,
            presetLabel,
            today,
            abortSignal: modelAbortSignal(opts),
          })

          const cost = costMicroUsd(out.tokensIn, out.tokensOut)
          const demandDate = out.containsDemand ? referenceDateOf(out.data, refField) : null
          report.tokensIn += out.tokensIn
          report.tokensOut += out.tokensOut
          report.costMicroUsd += cost

          const res = await savePhoneExtraction(supabase, {
            property_id: config.property_id,
            group_id: config.group_id,
            phone_call_id: call.id,
            config_version: config.version,
            channel: "phone",
            kind: "chiamata",
            // La riga resta datata al giorno della chiamata. La data della domanda
            // e' separata dentro `richiesta` e l'aggregatore la usa per i KPI di
            // soggiorno/servizio.
            reference_date: callDay,
            payload: {
              ...phoneMeta,
              contenuto: "trascrizione",
              richiesta: out.containsDemand
                ? {
                    presente: true,
                    reference_date: demandDate,
                    dati: out.data,
                    confidenza: out.confidence,
                  }
                : {
                    presente: false,
                    reference_date: null,
                    dati: {},
                    confidenza: out.confidence,
                  },
            },
            confidence: out.confidence,
            method: "modello",
            model: "openai/gpt-5.4-mini",
            tokens_in: out.tokensIn,
            tokens_out: out.tokensOut,
            cost_micro_usd: cost,
            truncated,
          })

          if (res === "already") report.alreadyDone++
          else {
            report.calls++
            report.byModel++
            if (out.containsDemand) report.withDemand++
          }
        } finally {
          await releaseModelExtraction(
            supabase,
            config.group_id,
            "phone_call",
            call.id,
            config.version,
          )
        }
      } catch (e) {
        if (isDeadlineAbort(e, opts)) {
          report.stoppedForDeadline = true
          break
        }
        report.failed++
        const msg = e instanceof Error ? e.message : String(e)
        if (!report.errors.includes(msg)) report.errors.push(msg)
      }
    }
  } else if (deadlineReached(opts)) {
    report.stoppedForDeadline = true
  }

  if (!opts.dryRun) {
    // Anche una passata incompleta avanza il turno del gruppo. Il lavoro nuovo
    // resta riprendibile grazie agli indici idempotenti e al set `alreadyDone`,
    // mentre aggiornare `last_run_at` impedisce che un tenant con backlog
    // monopolizzi ogni cron e affami quelli successivi.
    await supabase
      .from("group_tracking_configs")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", config.id)
  }

  return report
}

export type { TrackingSources }
