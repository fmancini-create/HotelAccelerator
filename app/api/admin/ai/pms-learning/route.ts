import { after, type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  accessErrorStatus,
  adminUserIdPerDatabase,
  isAccessError,
  requireTenantAdmin,
} from "@/lib/auth/admin-access"
import { indexSource } from "@/lib/ai/ingest"
import {
  aggregateDailyPmsActivities,
  calculatePmsKnowledgeCoverage,
  type DailyObservedTrace,
} from "@/lib/pms/shadow/metrics"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const DecisionBody = z.object({
  procedureId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  knowledgeBaseIds: z.array(z.string().uuid()).max(20).default([]),
})

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } })
}

function localDateKey(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof value === "string" ? new Date(value) : value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function procedureSourceText(procedure: { title: string; pms_type: string; steps_summary: unknown }) {
  const steps = Array.isArray(procedure.steps_summary) ? procedure.steps_summary : []
  const lines = steps.slice(0, 200).map((raw, index) => {
    const step = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
    const action = typeof step.azione === "string" ? step.azione : "azione"
    const label = typeof step.etichetta === "string" ? step.etichetta : null
    const path = typeof step.percorso === "string" ? step.percorso : null
    const kind = typeof step.natura === "string" ? step.natura : null
    return `${index + 1}. ${action}${label ? ` — ${label}` : ""}${path ? ` [${path}]` : ""}${kind ? ` (${kind})` : ""}`
  })

  return [
    `Procedura PMS approvata: ${procedure.title}`,
    `Gestionale: ${procedure.pms_type}`,
    "Questa fonte descrive solo la forma operativa osservata. Non contiene valori digitati, dati ospite o credenziali.",
    "Passaggi osservati:",
    ...lines,
  ].join("\n")
}

async function admin(request: NextRequest) {
  try {
    return { identity: await requireTenantAdmin(request) }
  } catch (error) {
    if (isAccessError(error)) {
      return {
        denied: json({ error: error instanceof Error ? error.message : "Accesso negato" }, accessErrorStatus(error)),
      }
    }
    throw error
  }
}

export async function GET(request: NextRequest) {
  const who = await admin(request)
  if ("denied" in who) return who.denied
  const propertyId = who.identity.propertyId!
  const sb = createServiceClient()

  const [{ data: property }, { data: procedures, error: proceduresError }] = await Promise.all([
    sb.from("properties").select("timezone").eq("id", propertyId).maybeSingle(),
    sb
      .from("pms_observed_procedures")
      .select(
        "id, pms_type, title, occurrences, risk, status, autonomy_threshold, steps_summary, first_seen_at, last_seen_at, review_status, reviewed_at",
      )
      .eq("property_id", propertyId)
      .order("last_seen_at", { ascending: false })
      .limit(200),
  ])
  if (proceduresError) return json({ error: "Lettura apprendimento PMS non riuscita" }, 500)

  const timezone = typeof property?.timezone === "string" && property.timezone ? property.timezone : "Europe/Rome"
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const since36h = new Date(Date.now() - 36 * 3_600_000).toISOString()

  const [{ data: usage, error: usageError }, { data: traces, error: tracesError }, { data: links }] = await Promise.all([
    sb
      .from("pms_usage_sessions")
      .select("id, source, observable, active_seconds, started_at, ended_at, operator_label")
      .eq("property_id", propertyId)
      .gte("started_at", since30d)
      .order("started_at", { ascending: false })
      .limit(2000),
    sb
      .from("pms_shadow_sessions")
      .select("id, procedure_id, operator_label, steps_count, ended_at")
      .eq("property_id", propertyId)
      .gte("ended_at", since36h)
      .order("ended_at", { ascending: false })
      .limit(1000),
    sb
      .from("pms_procedure_knowledge_bases")
      .select("procedure_id, knowledge_base_id, knowledge_source_id")
      .eq("property_id", propertyId),
  ])

  if (usageError || tracesError) {
    return json({ error: "Metriche PMS temporaneamente non disponibili" }, 500)
  }

  const todayKey = localDateKey(new Date(), timezone)
  const todayUsage = (usage ?? []).filter((row) => localDateKey(row.started_at, timezone) === todayKey)
  const todayTraces = (traces ?? []).filter((row) => row.ended_at && localDateKey(row.ended_at, timezone) === todayKey)
  const procedureById = new Map((procedures ?? []).map((p) => [p.id, p]))
  const activityRows: DailyObservedTrace[] = todayTraces.map((row) => {
    const p = row.procedure_id ? procedureById.get(row.procedure_id) : null
    return {
      id: row.id,
      procedure_id: row.procedure_id,
      operator_label: row.operator_label,
      steps_count: row.steps_count,
      ended_at: row.ended_at,
      procedure: p ? { title: p.title, review_status: p.review_status, risk: p.risk } : null,
    }
  })

  const coverage = calculatePmsKnowledgeCoverage((procedures ?? []) as Parameters<typeof calculatePmsKnowledgeCoverage>[0])
  const total30 = (usage ?? []).reduce((sum, row) => sum + Math.max(0, row.active_seconds ?? 0), 0)
  const todaySeconds = todayUsage.reduce((sum, row) => sum + Math.max(0, row.active_seconds ?? 0), 0)
  const unobservableTodaySeconds = todayUsage
    .filter((row) => !row.observable)
    .reduce((sum, row) => sum + Math.max(0, row.active_seconds ?? 0), 0)

  const kbByProcedure = new Map<string, string[]>()
  for (const link of links ?? []) {
    const current = kbByProcedure.get(link.procedure_id) ?? []
    current.push(link.knowledge_base_id)
    kbByProcedure.set(link.procedure_id, current)
  }

  return json({
    coverage,
    usage: {
      averageMinutesPerSession30d: (usage ?? []).length ? Math.round(total30 / (usage ?? []).length / 60) : 0,
      sessions30d: (usage ?? []).length,
      todayMinutes: Math.round(todaySeconds / 60),
      todaySessions: todayUsage.length,
      unobservableTodayMinutes: Math.round(unobservableTodaySeconds / 60),
    },
    activities: aggregateDailyPmsActivities(activityRows),
    procedures: (procedures ?? []).map((p) => ({ ...p, knowledge_base_ids: kbByProcedure.get(p.id) ?? [] })),
    timezone,
  })
}

export async function PATCH(request: NextRequest) {
  const who = await admin(request)
  if ("denied" in who) return who.denied
  const propertyId = who.identity.propertyId!

  let body: z.infer<typeof DecisionBody>
  try {
    body = DecisionBody.parse(await request.json())
  } catch {
    return json({ error: "Decisione PMS non valida" }, 400)
  }

  const sb = createServiceClient()
  const { data: procedure, error: procedureError } = await sb
    .from("pms_observed_procedures")
    .select("id, pms_type, title, occurrences, autonomy_threshold, steps_summary, review_status, status")
    .eq("id", body.procedureId)
    .eq("property_id", propertyId)
    .maybeSingle()
  if (procedureError || !procedure) return json({ error: "Procedura PMS non trovata" }, 404)

  const reviewer = adminUserIdPerDatabase(who.identity.adminUserId)
  const now = new Date().toISOString()

  if (body.action === "reject") {
    const { error } = await sb
      .from("pms_observed_procedures")
      .update({ review_status: "rejected", reviewed_by: reviewer, reviewed_at: now, status: "bloccata", updated_at: now })
      .eq("id", procedure.id)
      .eq("property_id", propertyId)
    if (error) return json({ error: "Rifiuto non salvato" }, 500)
    return json({ ok: true, reviewStatus: "rejected" })
  }

  const baseIds = [...new Set(body.knowledgeBaseIds)]
  if (baseIds.length) {
    const { data: bases, error } = await sb
      .from("knowledge_bases")
      .select("id")
      .eq("property_id", propertyId)
      .in("id", baseIds)
    if (error || (bases ?? []).length !== baseIds.length) {
      return json({ error: "Una o più basi di conoscenza non appartengono al tenant" }, 400)
    }
  }

  const nextStatus = procedure.occurrences >= Math.max(1, procedure.autonomy_threshold) ? "proposta" : "osservata"
  const { error: updateError } = await sb
    .from("pms_observed_procedures")
    .update({ review_status: "approved", reviewed_by: reviewer, reviewed_at: now, status: nextStatus, updated_at: now })
    .eq("id", procedure.id)
    .eq("property_id", propertyId)
  if (updateError) return json({ error: "Approvazione non salvata" }, 500)

  const sourceIds: string[] = []
  for (const baseId of baseIds) {
    const { data: existing } = await sb
      .from("pms_procedure_knowledge_bases")
      .select("knowledge_source_id")
      .eq("property_id", propertyId)
      .eq("procedure_id", procedure.id)
      .eq("knowledge_base_id", baseId)
      .maybeSingle()

    if (existing?.knowledge_source_id) {
      sourceIds.push(existing.knowledge_source_id)
      continue
    }

    if (!existing) {
      const { error: linkError } = await sb.from("pms_procedure_knowledge_bases").insert({
        property_id: propertyId,
        procedure_id: procedure.id,
        knowledge_base_id: baseId,
        created_by: reviewer,
      })
      if (linkError && linkError.code !== "23505") {
        console.error("[pms-learning] knowledge link failed", { propertyId, procedureId: procedure.id, detail: linkError.message })
        continue
      }
    }

    const { data: source, error: sourceError } = await sb
      .from("knowledge_sources")
      .insert({
        property_id: propertyId,
        knowledge_base_id: baseId,
        type: "text",
        title: `Procedura PMS — ${procedure.title}`.slice(0, 200),
        content: procedureSourceText(procedure).slice(0, 200_000),
        status: "pending",
        created_by: reviewer,
      })
      .select("id")
      .single()

    if (sourceError || !source) {
      console.error("[pms-learning] knowledge source failed", { propertyId, procedureId: procedure.id, detail: sourceError?.message })
      continue
    }

    const { error: linkSourceError } = await sb
      .from("pms_procedure_knowledge_bases")
      .update({ knowledge_source_id: source.id })
      .eq("property_id", propertyId)
      .eq("procedure_id", procedure.id)
      .eq("knowledge_base_id", baseId)
    if (!linkSourceError) sourceIds.push(source.id)
  }

  if (sourceIds.length) {
    after(async () => {
      for (const sourceId of sourceIds) {
        try {
          await indexSource(sourceId, propertyId)
        } catch (error) {
          console.error("[pms-learning] index failed", { propertyId, sourceId, detail: error instanceof Error ? error.message : String(error) })
        }
      }
    })
  }

  return json({ ok: true, reviewStatus: "approved", knowledgeSources: sourceIds.length })
}
