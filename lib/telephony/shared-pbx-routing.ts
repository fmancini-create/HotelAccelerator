import "server-only"
import { randomUUID } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { phoneMatchKey } from "@/lib/telephony/phone-match"

const HINT_TTL_MS = 30 * 60 * 1000

type VoiceTurn = { role: "user" | "assistant"; content: string }

function isMissingRoutingSchema(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "42703" || /telephony_call_route_hints|shared_pbx_journal_property_id/i.test(error.message || "")
}

function renderVoiceTranscript(history: VoiceTurn[], question: string, responseSpeech: string): string {
  const turns = history.slice(-8).map((turn) => ({ role: turn.role, content: turn.content.trim() })).filter((turn) => turn.content)
  const cleanQuestion = question.trim()
  const last = turns.at(-1)
  if (cleanQuestion && !(last?.role === "user" && last.content === cleanQuestion)) {
    turns.push({ role: "user", content: cleanQuestion })
  }
  const cleanResponse = responseSpeech.trim()
  if (cleanResponse) turns.push({ role: "assistant", content: cleanResponse })

  return turns
    .map((turn) => `${turn.role === "user" ? "Chiamante" : "Assistente"}: ${turn.content}`)
    .join("\n")
    .slice(0, 250_000)
}

/**
 * Registra che una chiamata autenticata dal tenant `targetPropertyId` sta
 * passando dal suo agente vocale, ma il relativo ReportCall arrivera' usando
 * la credenziale CRM del tenant/PBX indicato in `shared_pbx_journal_property_id`.
 *
 * Non contiene testo, numero completo o segreti: solo le ultime nove cifre
 * normalizzate e una finestra temporale breve.
 */
export async function touchSharedPbxRouteHint(input: {
  targetPropertyId: string
  callerNumber?: string | null
}): Promise<boolean> {
  const callerKey = phoneMatchKey(input.callerNumber)
  if (!callerKey) return false

  const supabase = createServiceClient()
  const { data: integration, error: integrationError } = await supabase
    .from("telephony_integrations")
    .select("shared_pbx_journal_property_id")
    .eq("property_id", input.targetPropertyId)
    .eq("provider", "3cx")
    .eq("is_active", true)
    .maybeSingle()

  if (integrationError) {
    if (isMissingRoutingSchema(integrationError)) return false
    console.error("[3cx-shared-pbx] mapping lookup failed", {
      targetPropertyId: input.targetPropertyId,
      code: integrationError.code,
    })
    return false
  }

  const sourcePropertyId = integration?.shared_pbx_journal_property_id
    ? String(integration.shared_pbx_journal_property_id)
    : ""
  if (!sourcePropertyId || sourcePropertyId === input.targetPropertyId) return false

  const now = new Date()
  const { error } = await supabase.from("telephony_call_route_hints").upsert(
    {
      source_property_id: sourcePropertyId,
      target_property_id: input.targetPropertyId,
      caller_key: callerKey,
      last_seen_at: now.toISOString(),
      expires_at: new Date(now.getTime() + HINT_TTL_MS).toISOString(),
      consumed_at: null,
    },
    { onConflict: "source_property_id,target_property_id,caller_key" },
  )

  if (error) {
    if (isMissingRoutingSchema(error)) return false
    console.error("[3cx-shared-pbx] hint upsert failed", {
      targetPropertyId: input.targetPropertyId,
      code: error.code,
    })
    return false
  }

  return true
}

/**
 * Nei PBX condivisi il percorso solo-bot puo' non produrre ReportCall. In quel
 * caso il bridge vocale crea una sola phone_call tenant-scoped e ne aggiorna la
 * trascrizione a ogni turno. Se il provider invia poi ReportCall, il journal
 * arricchisce questa stessa riga con registrazione/summary/transcript provider.
 */
export async function captureSharedPbxVoiceExchange(input: {
  targetPropertyId: string
  callerNumber?: string | null
  history: VoiceTurn[]
  question: string
  responseSpeech: string
  agentLabel?: string | null
}): Promise<string | null> {
  const callerKey = phoneMatchKey(input.callerNumber)
  if (!callerKey) return null

  const supabase = createServiceClient()
  const now = new Date()
  const { data: hint, error: hintError } = await supabase
    .from("telephony_call_route_hints")
    .select("id, phone_call_id")
    .eq("target_property_id", input.targetPropertyId)
    .eq("caller_key", callerKey)
    .gt("expires_at", now.toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (hintError) {
    if (isMissingRoutingSchema(hintError)) return null
    console.error("[3cx-shared-pbx] voice capture hint lookup failed", {
      targetPropertyId: input.targetPropertyId,
      code: hintError.code,
    })
    return null
  }
  if (!hint?.id) return null

  const transcript = renderVoiceTranscript(input.history, input.question, input.responseSpeech)
  if (!transcript) return null

  let contactId: string | null = null
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("property_id", input.targetPropertyId)
    .like("phone_digits", `%${callerKey}%`)
    .limit(1)
    .maybeSingle()
  if (contact?.id) contactId = String(contact.id)

  const existingCallId = hint.phone_call_id ? String(hint.phone_call_id) : ""
  if (existingCallId) {
    const { error } = await supabase
      .from("phone_calls")
      .update({
        contact_id: contactId,
        counterpart_number: input.callerNumber?.slice(0, 40) || null,
        agent_name: input.agentLabel?.trim().slice(0, 200) || "Assistente vocale 3CX",
        status: "completed",
        provider_status: "voice_agent",
        status_source: "voice_agent",
        ended_at: now.toISOString(),
        transcription: transcript,
        transcription_updated_at: now.toISOString(),
      })
      .eq("id", existingCallId)
      .eq("property_id", input.targetPropertyId)

    if (error) {
      console.error("[3cx-shared-pbx] voice call update failed", {
        targetPropertyId: input.targetPropertyId,
        code: error.code,
      })
      return null
    }
    return existingCallId
  }

  const { data: created, error: createError } = await supabase
    .from("phone_calls")
    .insert({
      property_id: input.targetPropertyId,
      contact_id: contactId,
      direction: "inbound",
      counterpart_number: input.callerNumber?.slice(0, 40) || null,
      extension: null,
      user_id: null,
      agent_name: input.agentLabel?.trim().slice(0, 200) || "Assistente vocale 3CX",
      status: "completed",
      provider_status: "voice_agent",
      status_source: "voice_agent",
      started_at: now.toISOString(),
      ended_at: now.toISOString(),
      duration_seconds: null,
      external_call_id: `voice:${randomUUID()}`,
      notes: null,
      transcription: transcript,
      transcription_summary: null,
      recording_url: null,
      sentiment: null,
      transcription_updated_at: now.toISOString(),
    })
    .select("id")
    .single()

  if (createError || !created?.id) {
    console.error("[3cx-shared-pbx] voice call insert failed", {
      targetPropertyId: input.targetPropertyId,
      code: createError?.code,
    })
    return null
  }

  const callId = String(created.id)
  const { error: linkError } = await supabase
    .from("telephony_call_route_hints")
    .update({ phone_call_id: callId })
    .eq("id", String(hint.id))
    .is("phone_call_id", null)

  if (linkError && !isMissingRoutingSchema(linkError)) {
    console.error("[3cx-shared-pbx] voice call link failed", {
      targetPropertyId: input.targetPropertyId,
      code: linkError.code,
    })
  }

  return callId
}

export type SharedPbxJournalResolution = {
  propertyId: string
  hintId: string | null
  phoneCallId: string | null
  routed: boolean
}

/**
 * Risolve il tenant effettivo di un ReportCall.
 *
 * 3CX non espone il DID al template CRM. Per questo NON indoviniamo da numero,
 * contatto, agente o nome: deviamo dal tenant autenticato soltanto quando:
 *  - il target dichiara esplicitamente di condividere quel PBX/CRM;
 *  - un endpoint voce autenticato del target ha visto lo stesso chiamante;
 *  - l'ultimo evento voce cade dentro l'intervallo temporale della chiamata.
 */
export async function resolveSharedPbxJournalTarget(input: {
  sourcePropertyId: string
  callerNumber?: string | null
  direction: "inbound" | "outbound"
  startedAt?: string | null
  endedAt?: string | null
}): Promise<SharedPbxJournalResolution> {
  const fallback = { propertyId: input.sourcePropertyId, hintId: null, phoneCallId: null, routed: false }
  if (input.direction !== "inbound") return fallback

  const callerKey = phoneMatchKey(input.callerNumber)
  if (!callerKey || !input.startedAt) return fallback

  const started = new Date(input.startedAt)
  if (Number.isNaN(started.getTime())) return fallback
  const ended = input.endedAt ? new Date(input.endedAt) : new Date()
  const effectiveEnd = Number.isNaN(ended.getTime()) ? new Date() : ended

  // L'evento dell'agente vocale avviene dopo l'inizio della chiamata e prima
  // della sua fine. Aggiungo soltanto 60s al termine per tollerare clock/queue.
  // Non filtro per `consumed_at`: un retry dello stesso ReportCall deve essere
  // idempotente e continuare a risolvere allo stesso tenant. Una chiamata
  // successiva non collide perche' last_seen_at deve essere >= al nuovo start.
  const latestAllowed = new Date(effectiveEnd.getTime() + 60_000).toISOString()
  const supabase = createServiceClient()
  const { data: hints, error } = await supabase
    .from("telephony_call_route_hints")
    .select("id, target_property_id, phone_call_id, last_seen_at")
    .eq("source_property_id", input.sourcePropertyId)
    .eq("caller_key", callerKey)
    .gte("last_seen_at", started.toISOString())
    .lte("last_seen_at", latestAllowed)
    .order("last_seen_at", { ascending: false })
    .limit(5)

  if (error) {
    if (isMissingRoutingSchema(error)) return fallback
    console.error("[3cx-shared-pbx] hint lookup failed", {
      sourcePropertyId: input.sourcePropertyId,
      code: error.code,
    })
    return fallback
  }

  for (const hint of hints ?? []) {
    const targetPropertyId = String(hint.target_property_id || "")
    if (!targetPropertyId || targetPropertyId === input.sourcePropertyId) continue

    const { data: mapping, error: mappingError } = await supabase
      .from("telephony_integrations")
      .select("property_id")
      .eq("property_id", targetPropertyId)
      .eq("provider", "3cx")
      .eq("is_active", true)
      .eq("shared_pbx_journal_property_id", input.sourcePropertyId)
      .maybeSingle()

    if (mappingError) {
      if (isMissingRoutingSchema(mappingError)) return fallback
      console.error("[3cx-shared-pbx] target mapping verification failed", {
        sourcePropertyId: input.sourcePropertyId,
        targetPropertyId,
        code: mappingError.code,
      })
      continue
    }
    if (!mapping) continue

    return {
      propertyId: targetPropertyId,
      hintId: String(hint.id),
      phoneCallId: hint.phone_call_id ? String(hint.phone_call_id) : null,
      routed: true,
    }
  }

  return fallback
}

/** Segna l'hint dopo persistenza; resta leggibile per retry idempotenti. */
export async function consumeSharedPbxRouteHint(hintId: string | null): Promise<void> {
  if (!hintId) return
  const supabase = createServiceClient()
  const { error } = await supabase
    .from("telephony_call_route_hints")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", hintId)
    .is("consumed_at", null)

  if (error && !isMissingRoutingSchema(error)) {
    console.error("[3cx-shared-pbx] hint consume failed", { hintId, code: error.code })
  }
}
