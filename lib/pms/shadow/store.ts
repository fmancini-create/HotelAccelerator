import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import {
  chiaveProcedura,
  classificaRischio,
  decidiStato,
  proponiTitolo,
  SOGLIA_AUTONOMIA_PREDEFINITA,
  type ProcedureStatus,
  type ShadowAction,
  type ShadowStep,
  type ValueKind,
} from "@/lib/pms/shadow/procedures"

const AZIONI: ShadowAction[] = ["navigate", "click", "fill", "select", "submit", "keypress"]
const NATURE: ValueKind[] = ["empty", "text", "number", "date", "money", "email", "phone", "secret"]
const SORGENTI = ["remote_browser", "extension"] as const
const MAX_PASSI = 200
const MAX_TENTATIVI_PROCEDURA = 4

export type ShadowSource = (typeof SORGENTI)[number]

export class ShadowTraceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ShadowTraceValidationError"
  }
}

export interface RegistraTracciaInput {
  propertyId: string
  pmsType: string
  source: ShadowSource
  rawSteps: unknown[]
  operatorId?: string | null
  operatorLabel?: string | null
  sourceTraceId?: string | null
  usageSessionId?: string | null
}

export interface RegistraTracciaResult {
  sessionId: string
  passiSalvati: number
  passiScartati: number
  duplicate: boolean
  procedura: { id: string; occurrences: number; status: ProcedureStatus; title: string } | null
}

function testo(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function etichettaSicura(v: unknown): string | null {
  const label = testo(v, 120)
  if (!label) return null
  if (/\S+@\S+\.\S+/.test(label)) return null
  if (/\+?\d[\d\s().-]{7,}\d/.test(label)) return null
  if (/\b\d{6,}\b/.test(label)) return null
  if (/\b\d+[.,]\d{2}\s?(?:€|eur|usd|gbp)\b/i.test(label)) return null
  return label
}

export function ripulisciPassoShadow(raw: unknown): ShadowStep | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const action = typeof r.action === "string" ? r.action : ""
  if (!AZIONI.includes(action as ShadowAction)) return null

  const natura =
    typeof r.valueKind === "string" && NATURE.includes(r.valueKind as ValueKind)
      ? (r.valueKind as ValueKind)
      : null
  const percorsoGrezzo = testo(r.urlPath, 400)
  const percorso = percorsoGrezzo ? percorsoGrezzo.split(/[?#]/)[0] : null

  return {
    action: action as ShadowAction,
    targetRole: testo(r.targetRole, 40),
    targetLabel: etichettaSicura(r.targetLabel),
    urlPath: percorso,
    valueKind: natura,
  }
}

function validaInput(input: RegistraTracciaInput) {
  const pmsType = testo(input.pmsType, 120)
  if (!pmsType) throw new ShadowTraceValidationError("PMS non identificato")
  if (!SORGENTI.includes(input.source)) throw new ShadowTraceValidationError("Sorgente non riconosciuta")
  if (!Array.isArray(input.rawSteps) || input.rawSteps.length === 0) {
    throw new ShadowTraceValidationError("Nessun passo nella traccia")
  }
  if (input.rawSteps.length > MAX_PASSI) throw new ShadowTraceValidationError(`Troppi passi: massimo ${MAX_PASSI}`)

  const passi = input.rawSteps.map(ripulisciPassoShadow).filter((p): p is ShadowStep => p !== null)
  if (passi.length === 0) throw new ShadowTraceValidationError("Nessun passo valido nella traccia")

  return { pmsType, passi, passiScartati: input.rawSteps.length - passi.length }
}

async function aggiornaProcedura(input: {
  propertyId: string
  pmsType: string
  passi: ShadowStep[]
}): Promise<NonNullable<RegistraTracciaResult["procedura"]>> {
  const sb = createServiceClient()
  const chiave = chiaveProcedura(input.passi)
  const rischio = classificaRischio(input.passi)
  const sommario = input.passi.map((p) => ({
    azione: p.action,
    etichetta: p.targetLabel,
    percorso: p.urlPath,
    natura: p.valueKind,
  }))

  for (let tentativo = 0; tentativo < MAX_TENTATIVI_PROCEDURA; tentativo++) {
    const { data: esistente, error: erroreLettura } = await sb
      .from("pms_observed_procedures")
      .select("id, occurrences, status, autonomy_threshold, title")
      .eq("property_id", input.propertyId)
      .eq("pms_type", input.pmsType)
      .eq("steps_key", chiave)
      .maybeSingle()
    if (erroreLettura) throw new Error(`PMS_SHADOW_PROCEDURE_READ:${erroreLettura.message}`)

    if (esistente) {
      const occorrenze = esistente.occurrences + 1
      const stato = decidiStato({
        occorrenze,
        soglia: esistente.autonomy_threshold,
        rischio,
        attuale: esistente.status as ProcedureStatus,
      })
      const now = new Date().toISOString()
      const { data, error } = await sb
        .from("pms_observed_procedures")
        .update({ occurrences: occorrenze, last_seen_at: now, risk: rischio, status: stato, steps_summary: sommario, updated_at: now })
        .eq("id", esistente.id)
        .eq("occurrences", esistente.occurrences)
        .select("id, occurrences, status, title")
        .maybeSingle()
      if (error) throw new Error(`PMS_SHADOW_PROCEDURE_UPDATE:${error.message}`)
      if (data) return data as NonNullable<RegistraTracciaResult["procedura"]>
      continue
    }

    const soglia = SOGLIA_AUTONOMIA_PREDEFINITA
    const stato = decidiStato({ occorrenze: 1, soglia, rischio })
    const { data, error } = await sb
      .from("pms_observed_procedures")
      .insert({
        property_id: input.propertyId,
        pms_type: input.pmsType,
        steps_key: chiave,
        title: proponiTitolo(input.passi),
        steps_summary: sommario,
        occurrences: 1,
        risk: rischio,
        autonomy_threshold: soglia,
        status: stato,
      })
      .select("id, occurrences, status, title")
      .single()
    if (!error && data) return data as NonNullable<RegistraTracciaResult["procedura"]>
    if (error?.code === "23505") continue
    throw new Error(`PMS_SHADOW_PROCEDURE_INSERT:${error?.message ?? "insert fallito"}`)
  }
  throw new Error("PMS_SHADOW_PROCEDURE_CONCURRENCY")
}

export async function registraTracciaShadow(input: RegistraTracciaInput): Promise<RegistraTracciaResult> {
  const { pmsType, passi, passiScartati } = validaInput(input)
  const sb = createServiceClient()
  const sourceTraceId = testo(input.sourceTraceId, 160)

  // Un ACK puo' andare perso dopo che il DB ha gia' salvato la traccia. In quel
  // caso il browser la ritrasmette: non deve incrementare di nuovo occurrences.
  if (sourceTraceId) {
    const { data: esistente, error } = await sb
      .from("pms_shadow_sessions")
      .select("id, procedure_id")
      .eq("property_id", input.propertyId)
      .eq("pms_type", pmsType)
      .eq("source", input.source)
      .eq("source_trace_id", sourceTraceId)
      .maybeSingle()
    if (error) throw new Error(`PMS_SHADOW_DEDUP_READ:${error.message}`)
    if (esistente) {
      return { sessionId: esistente.id, passiSalvati: 0, passiScartati: 0, duplicate: true, procedura: null }
    }
  }

  const { data: sessione, error: erroreSessione } = await sb
    .from("pms_shadow_sessions")
    .insert({
      property_id: input.propertyId,
      pms_type: pmsType,
      source: input.source,
      source_trace_id: sourceTraceId,
      usage_session_id: input.usageSessionId ?? null,
      operator_id: input.operatorId ?? null,
      operator_label: testo(input.operatorLabel, 120),
      steps_count: passi.length,
      ended_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (erroreSessione || !sessione) {
    if (erroreSessione?.code === "23505" && sourceTraceId) {
      const { data } = await sb
        .from("pms_shadow_sessions")
        .select("id")
        .eq("property_id", input.propertyId)
        .eq("pms_type", pmsType)
        .eq("source", input.source)
        .eq("source_trace_id", sourceTraceId)
        .maybeSingle()
      if (data) return { sessionId: data.id, passiSalvati: 0, passiScartati: 0, duplicate: true, procedura: null }
    }
    throw new Error(`PMS_SHADOW_SESSION_INSERT:${erroreSessione?.message ?? "sessione non salvata"}`)
  }

  const righe = passi.map((p, i) => ({
    session_id: sessione.id,
    seq: i,
    action: p.action,
    target_role: p.targetRole,
    target_label: p.targetLabel,
    url_path: p.urlPath,
    value_kind: p.valueKind,
  }))

  const { error: errorePassi } = await sb.from("pms_shadow_steps").insert(righe)
  if (errorePassi) {
    await sb.from("pms_shadow_sessions").delete().eq("id", sessione.id)
    throw new Error(`PMS_SHADOW_STEPS_INSERT:${errorePassi.message}`)
  }

  try {
    const procedura = await aggiornaProcedura({ propertyId: input.propertyId, pmsType, passi })
    const { error: linkError } = await sb
      .from("pms_shadow_sessions")
      .update({ procedure_id: procedura.id })
      .eq("id", sessione.id)
      .eq("property_id", input.propertyId)
    if (linkError) throw new Error(`PMS_SHADOW_SESSION_LINK:${linkError.message}`)

    return { sessionId: sessione.id, passiSalvati: passi.length, passiScartati, duplicate: false, procedura }
  } catch (error) {
    // Se l'errore arriva prima dell'incremento procedura, la cancellazione rende
    // la traccia ritentabile. Se arriva nel solo link finale, l'idempotency key
    // impedisce comunque un doppio incremento: l'errore resta visibile nei log.
    if (!(error instanceof Error && error.message.startsWith("PMS_SHADOW_SESSION_LINK:"))) {
      await sb.from("pms_shadow_sessions").delete().eq("id", sessione.id)
    }
    throw error
  }
}
