import { type NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/server"
import { esitoGruppoSquillo, ESITO_DEDOTTO, ESITO_DAL_CENTRALINO } from "@/lib/telephony/ring-group"
import { authenticateInbound, syntheticCallId } from "@/lib/telephony/inbound-auth"
import { phoneMatchKey } from "@/lib/telephony/threecx-client"
import { findUserIdByExtension, findUserIdByEmail } from "@/lib/telephony/user-extension"
import { consumeSharedPbxRouteHint, resolveSharedPbxJournalTarget } from "@/lib/telephony/shared-pbx-routing"

/**
 * Endpoint richiamato DA 3CX a fine chiamata ("ReportCall" nel template CRM):
 * registra la telefonata nel registro, inclusi trascrizione, riepilogo,
 * sentiment e URL registrazione quando 3CX li rende disponibili.
 */
function errorFor(status: 401 | 403 | 500) {
  if (status === 401) return NextResponse.json({ error: "Non autorizzato" }, { status })
  if (status === 403) return NextResponse.json({ error: "Canale telefono disattivato" }, { status })
  return NextResponse.json({ error: "Errore interno" }, { status })
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function toSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (typeof value !== "string" || value.trim() === "") return null
  const raw = value.trim()
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10)
  const parts = raw.split(":").map((p) => Number.parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

/** Primo valore di testo utile fra piu' nomi possibili dello stesso campo. */
function pick(body: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = body[k]
    if (typeof v === "string" && v.trim() !== "") return v.trim()
  }
  return ""
}

/** Evita payload fuori scala o URL/provider data non controllati nel DB. */
function capped(value: string, max: number): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

/**
 * Fallback deterministico per PBX condivisi quando 3CX non espone il DID nel
 * ReportCall e non esiste un route hint del voice agent. Una destinazione
 * interna puo' appartenere a un tenant condiviso soltanto se e' dichiarata
 * esplicitamente in `telephony_extension_labels` di quel tenant.
 *
 * Se piu' tenant rivendicano lo stesso interno non scegliamo: il journal resta
 * sul tenant PBX autenticato. In questo modo non introduciamo euristiche o
 * hardcode specifici di una struttura.
 */
async function resolveSharedPbxExtensionTarget(
  supabase: SupabaseClient,
  sourcePropertyId: string,
  extension: string,
): Promise<string | null> {
  const cleanExtension = extension.replace(/\D/g, "")
  if (!cleanExtension) return null

  const { data: mappings, error: mappingError } = await supabase
    .from("telephony_integrations")
    .select("property_id")
    .eq("provider", "3cx")
    .eq("is_active", true)
    .eq("shared_pbx_journal_property_id", sourcePropertyId)

  if (mappingError) {
    console.error("[3cx-journal] shared extension mapping lookup failed", {
      sourcePropertyId,
      message: mappingError.message,
    })
    return null
  }

  const targetIds = [...new Set((mappings ?? []).map((row) => String(row.property_id || "")).filter(Boolean))]
  if (targetIds.length === 0) return null

  const { data: labels, error: labelError } = await supabase
    .from("telephony_extension_labels")
    .select("property_id")
    .in("property_id", targetIds)
    .eq("extension", cleanExtension)
    .limit(2)

  if (labelError) {
    console.error("[3cx-journal] shared extension label lookup failed", {
      sourcePropertyId,
      extension: cleanExtension,
      message: labelError.message,
    })
    return null
  }

  const matches = [...new Set((labels ?? []).map((row) => String(row.property_id || "")).filter(Boolean))]
  return matches.length === 1 ? matches[0] : null
}

export async function POST(request: NextRequest) {
  const auth = await authenticateInbound(request)
  if (!auth.ok) return errorFor(auth.status)
  const authenticatedPropertyId = auth.propertyId

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Corpo della richiesta non valido." }, { status: 400 })

  const number = pick(body, "number", "phone", "caller")
  const rawDirection = pick(body, "direction", "callDir", "call_direction").toLowerCase()
  const direction = rawDirection.includes("out") ? "outbound" : "inbound"
  const extension = pick(body, "extension", "agent")
  const startedAtRaw = pick(body, "started_at", "callStart")
  const endedAtRaw = pick(body, "ended_at", "callEnd")

  // Una integrazione CRM 3CX e' globale per PBX e il ReportCall non espone il
  // DID. Nel caso esplicitamente configurato di PBX condiviso, un endpoint
  // voce autenticato puo' avere lasciato un hint temporale per lo stesso
  // chiamante. Senza hint proviamo soltanto una destinazione interna dichiarata
  // in modo univoco dal tenant condiviso; altrimenti il tenant autenticato resta
  // invariato.
  const routing = await resolveSharedPbxJournalTarget({
    sourcePropertyId: authenticatedPropertyId,
    callerNumber: number,
    direction,
    startedAt: startedAtRaw || null,
    endedAt: endedAtRaw || null,
  })

  const extensionTargetPropertyId =
    !routing.routed && direction === "inbound"
      ? await resolveSharedPbxExtensionTarget(supabaseForRouting(), authenticatedPropertyId, extension)
      : null
  const propertyId = extensionTargetPropertyId ?? routing.propertyId

  const providedId = pick(body, "call_id", "callId")
  const externalId =
    providedId ||
    (number && startedAtRaw
      ? syntheticCallId({ number, extension, startedAt: startedAtRaw, direction })
      : null)

  // Campi U8+ del ReportCall 3CX. Non tutti sono disponibili per tutte le
  // chiamate (es. mancata registrazione/trascrizione): in quel caso restano null.
  const transcription = capped(pick(body, "transcription", "Transcription"), 250_000)
  const transcriptionSummary = capped(pick(body, "summary", "transcription_summary", "Summary"), 25_000)
  const recordingUrl = capped(pick(body, "recording_url", "recordingUrl", "RecordingUrl"), 8_000)
  const sentiment = capped(pick(body, "sentiment", "Sentiment"), 500)
  const providerHasVoiceData = Boolean(transcription || transcriptionSummary || recordingUrl || sentiment)

  const supabase = createServiceClient()

  let existingVoiceCall: {
    external_call_id: string | null
    started_at: string | null
    ended_at: string | null
    agent_name: string | null
    transcription: string | null
    transcription_summary: string | null
    recording_url: string | null
    sentiment: string | null
    transcription_updated_at: string | null
  } | null = null

  if (routing.phoneCallId) {
    const { data } = await supabase
      .from("phone_calls")
      .select("external_call_id, started_at, ended_at, agent_name, transcription, transcription_summary, recording_url, sentiment, transcription_updated_at")
      .eq("id", routing.phoneCallId)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (data) existingVoiceCall = data
  }

  let contactId: string | null = null
  const key = phoneMatchKey(number)
  if (key) {
    const { data: match } = await supabase
      .from("contacts")
      .select("id")
      .eq("property_id", propertyId)
      .like("phone_digits", `%${key}%`)
      .limit(1)
      .maybeSingle()
    if (match?.id) contactId = String(match.id)
  }

  const userId =
    (await findUserIdByExtension(supabase, propertyId, extension)) ??
    (await findUserIdByEmail(supabase, propertyId, pick(body, "agent_email")))

  const statusDalCentralino = (() => {
    const explicit = pick(body, "status")
    if (explicit) return explicit
    const type = pick(body, "call_type", "callType").toLowerCase().replace(/[^a-z]/g, "")
    if (type.includes("miss") || type.includes("pers")) return "missed"
    if (type.includes("notanswer") || type.includes("noanswer")) return "missed"
    if (type.includes("norisp") || type.includes("nonrisp")) return "missed"
    return "completed"
  })()

  const durataSecondi = toSeconds(body.duration)

  let kindInterno: string | null = null
  let timeoutGruppo: number | null = null
  if (extension) {
    const { data: etichetta, error: erroreEtichetta } = await supabase
      .from("telephony_extension_labels")
      .select("kind, no_answer_seconds")
      .eq("property_id", propertyId)
      .eq("extension", extension.replace(/\D/g, ""))
      .maybeSingle()
    if (erroreEtichetta) {
      console.log(`[v0] etichetta interno ${extension} non letta: ${erroreEtichetta.message}`)
    } else if (etichetta) {
      kindInterno = etichetta.kind ? String(etichetta.kind) : null
      timeoutGruppo = typeof etichetta.no_answer_seconds === "number" ? etichetta.no_answer_seconds : null
    }
  }

  const esitoDedotto = esitoGruppoSquillo({
    kindInterno,
    direction,
    status: statusDalCentralino,
    durataSecondi,
    timeoutSecondi: timeoutGruppo,
  })

  const effectiveTranscription = transcription ?? existingVoiceCall?.transcription ?? null
  const effectiveSummary = transcriptionSummary ?? existingVoiceCall?.transcription_summary ?? null
  const effectiveRecording = recordingUrl ?? existingVoiceCall?.recording_url ?? null
  const effectiveSentiment = sentiment ?? existingVoiceCall?.sentiment ?? null
  const hasVoiceData = Boolean(effectiveTranscription || effectiveSummary || effectiveRecording || effectiveSentiment)

  const record = {
    property_id: propertyId,
    contact_id: contactId,
    direction,
    counterpart_number: number || null,
    extension: extension || null,
    user_id: userId,
    agent_name: pick(body, "agent_name", "agent") || existingVoiceCall?.agent_name || null,
    status: esitoDedotto ?? statusDalCentralino,
    provider_status: statusDalCentralino,
    status_source: esitoDedotto ? ESITO_DEDOTTO : ESITO_DAL_CENTRALINO,
    started_at: toIsoOrNull(startedAtRaw) ?? existingVoiceCall?.started_at ?? new Date().toISOString(),
    ended_at: toIsoOrNull(endedAtRaw) ?? existingVoiceCall?.ended_at ?? null,
    duration_seconds: durataSecondi,
    external_call_id: externalId ?? existingVoiceCall?.external_call_id ?? null,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
    transcription: effectiveTranscription,
    transcription_summary: effectiveSummary,
    recording_url: effectiveRecording,
    sentiment: effectiveSentiment,
    transcription_updated_at: providerHasVoiceData
      ? new Date().toISOString()
      : existingVoiceCall?.transcription_updated_at ?? (hasVoiceData ? new Date().toISOString() : null),
  }

  if (routing.phoneCallId && existingVoiceCall) {
    const { error } = await supabase
      .from("phone_calls")
      .update(record)
      .eq("id", routing.phoneCallId)
      .eq("property_id", propertyId)
    if (error) {
      console.error("[3cx-journal] shared voice merge failed", { propertyId, extension, message: error.message })
      return NextResponse.json({ error: "Errore interno" }, { status: 500 })
    }
  } else if (externalId) {
    const { error } = await supabase
      .from("phone_calls")
      .upsert(record, { onConflict: "property_id,external_call_id" })
    if (error) {
      console.error("[3cx-journal] upsert failed", { propertyId, extension, message: error.message })
      return NextResponse.json({ error: "Errore interno" }, { status: 500 })
    }
  } else {
    const { error } = await supabase.from("phone_calls").insert(record)
    if (error) {
      console.error("[3cx-journal] insert failed", { propertyId, extension, message: error.message })
      return NextResponse.json({ error: "Errore interno" }, { status: 500 })
    }
  }

  if (routing.routed) {
    await consumeSharedPbxRouteHint(routing.hintId)
    console.info("[3cx-journal] shared PBX call routed", {
      sourcePropertyId: authenticatedPropertyId,
      propertyId,
      extension,
      mergedVoiceCapture: Boolean(routing.phoneCallId && existingVoiceCall),
    })
  } else if (extensionTargetPropertyId) {
    console.info("[3cx-journal] shared PBX call routed by extension", {
      sourcePropertyId: authenticatedPropertyId,
      propertyId,
      extension,
    })
  }

  return NextResponse.json({
    ok: true,
    linked_contact: contactId,
    transcript_received: Boolean(transcription),
    summary_received: Boolean(transcriptionSummary),
    recording_received: Boolean(recordingUrl),
    shared_pbx_routed: routing.routed || Boolean(extensionTargetPropertyId),
    shared_pbx_extension_routed: Boolean(extensionTargetPropertyId),
    voice_capture_merged: Boolean(routing.phoneCallId && existingVoiceCall),
  })
}

function supabaseForRouting(): SupabaseClient {
  return createServiceClient()
}
