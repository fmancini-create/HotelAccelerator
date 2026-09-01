import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity, adminUserIdPerDatabase } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireCrmWorkspaceAccess } from "@/lib/crm/workspace-access"

const createSchema = z.object({
  action: z.literal("create"),
  workspaceId: z.string().uuid(),
  contactId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(180),
  companyName: z.string().trim().max(180).nullable().optional(),
  valueCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  stageId: z.string().uuid().optional(),
  nextAction: z.string().trim().max(240).nullable().optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
  customValues: z.record(z.unknown()).default({}),
})

const moveSchema = z.object({
  action: z.literal("move"),
  workspaceId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  stageId: z.string().uuid(),
})

const updateSchema = z.object({
  action: z.literal("update"),
  workspaceId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  title: z.string().trim().min(2).max(180).optional(),
  valueCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  nextAction: z.string().trim().max(240).nullable().optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
  customValues: z.record(z.unknown()).optional(),
})

const actionSchema = z.discriminatedUnion("action", [createSchema, moveSchema, updateSchema])

async function identityFor(request: NextRequest) {
  await requireAreaApi("crm", request)
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) throw new Error("Nessun tenant selezionato")
  return identity as typeof identity & { propertyId: string }
}

export async function GET(request: NextRequest) {
  try {
    const identity = await identityFor(request)
    const workspaceId = new URL(request.url).searchParams.get("workspace")?.trim() || ""
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return NextResponse.json({ error: "Workspace non valido" }, { status: 400 })
    const db = createServiceClient()
    const workspace = await requireCrmWorkspaceAccess(db, identity, workspaceId)

    const [
      { count: contactCount, error: contactCountError },
      { data: fields, error: fieldsError },
      { data: workspaceGroups, error: workspaceGroupsError },
    ] = await Promise.all([
      db.from("crm_workspace_contacts").select("id", { count: "exact", head: true }).eq("property_id", identity.propertyId).eq("workspace_id", workspace.id),
      db.from("crm_workspace_fields").select("id,field_key,label,field_type,options,is_required,sort_order").eq("property_id", identity.propertyId).eq("workspace_id", workspace.id).eq("is_active", true).order("sort_order"),
      db.from("crm_workspace_groups").select("group_id").eq("property_id", identity.propertyId).eq("workspace_id", workspace.id),
    ])
    if (contactCountError) throw contactCountError
    if (fieldsError) throw fieldsError
    if (workspaceGroupsError) throw workspaceGroupsError

    const workspaceWithGroups = {
      ...workspace,
      groupIds: (workspaceGroups ?? []).map((row) => String(row.group_id)),
    }

    if (workspace.mode === "hotel_date_requests") {
      return NextResponse.json({
        workspace: workspaceWithGroups,
        mode: workspace.mode,
        legacyPipelineHref: "/admin/crm/pipeline",
        contactCount: contactCount ?? 0,
        fields: fields ?? [],
        pipeline: null,
        opportunities: [],
      })
    }

    const { data: pipeline, error: pipelineError } = await db
      .from("crm_pipelines")
      .select("id,name")
      .eq("property_id", identity.propertyId)
      .eq("workspace_id", workspace.id)
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle()
    if (pipelineError) throw pipelineError
    if (!pipeline) return NextResponse.json({ error: "Pipeline workspace non configurata" }, { status: 409 })

    const [{ data: stages, error: stagesError }, { data: opportunities, error: opportunitiesError }] = await Promise.all([
      db.from("crm_pipeline_stages").select("id,stage_key,name,category,color,sort_order").eq("property_id", identity.propertyId).eq("pipeline_id", pipeline.id).eq("is_active", true).order("sort_order"),
      db.from("crm_opportunities").select("id,stage_id,contact_id,title,company_name,value_cents,currency,next_action,next_action_at,custom_values,updated_at,contacts(name,email,company)").eq("property_id", identity.propertyId).eq("workspace_id", workspace.id).order("updated_at", { ascending: false }).limit(500),
    ])
    if (stagesError) throw stagesError
    if (opportunitiesError) throw opportunitiesError

    return NextResponse.json({
      workspace: workspaceWithGroups,
      mode: workspace.mode,
      contactCount: contactCount ?? 0,
      fields: fields ?? [],
      pipeline: { ...pipeline, stages: stages ?? [] },
      opportunities: opportunities ?? [],
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore CRM"
    return NextResponse.json({ error: message }, { status: message.includes("non disponibile") ? 403 : 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await identityFor(request)
    const body = actionSchema.parse(await request.json())
    const db = createServiceClient()
    const workspace = await requireCrmWorkspaceAccess(db, identity, body.workspaceId, true)
    if (workspace.mode !== "generic") return NextResponse.json({ error: "Questo workspace usa la pipeline Hotel dedicata." }, { status: 409 })

    const { data: pipeline, error: pipelineError } = await db.from("crm_pipelines").select("id").eq("property_id", identity.propertyId).eq("workspace_id", workspace.id).eq("is_default", true).eq("is_active", true).single()
    if (pipelineError) throw pipelineError

    if (body.action === "create") {
      let stageId = body.stageId
      if (stageId) {
        const { data: stage } = await db.from("crm_pipeline_stages").select("id").eq("id", stageId).eq("property_id", identity.propertyId).eq("pipeline_id", pipeline.id).eq("is_active", true).maybeSingle()
        if (!stage) return NextResponse.json({ error: "Fase non valida per questo workspace" }, { status: 400 })
      } else {
        const { data: firstStage, error: stageError } = await db.from("crm_pipeline_stages").select("id").eq("property_id", identity.propertyId).eq("pipeline_id", pipeline.id).eq("is_active", true).order("sort_order").limit(1).single()
        if (stageError) throw stageError
        stageId = firstStage.id
      }

      if (body.contactId) {
        const { data: contact, error: contactError } = await db.from("contacts").select("id,company").eq("id", body.contactId).eq("property_id", identity.propertyId).maybeSingle()
        if (contactError) throw contactError
        if (!contact) return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 })
        const { error: memberError } = await db.from("crm_workspace_contacts").upsert({ property_id: identity.propertyId, workspace_id: workspace.id, contact_id: body.contactId, created_by: adminUserIdPerDatabase(identity.adminUserId) }, { onConflict: "workspace_id,contact_id" })
        if (memberError) throw memberError
      }

      const { data, error } = await db.from("crm_opportunities").insert({
        property_id: identity.propertyId,
        workspace_id: workspace.id,
        pipeline_id: pipeline.id,
        stage_id: stageId,
        contact_id: body.contactId ?? null,
        title: body.title,
        company_name: body.companyName ?? null,
        value_cents: body.valueCents ?? null,
        next_action: body.nextAction ?? null,
        next_action_at: body.nextActionAt ?? null,
        custom_values: body.customValues,
        created_by: adminUserIdPerDatabase(identity.adminUserId),
      }).select("id").single()
      if (error) throw error
      return NextResponse.json({ ok: true, opportunityId: data.id })
    }

    const { data: opportunity, error: opportunityError } = await db.from("crm_opportunities").select("id").eq("id", body.opportunityId).eq("property_id", identity.propertyId).eq("workspace_id", workspace.id).maybeSingle()
    if (opportunityError) throw opportunityError
    if (!opportunity) return NextResponse.json({ error: "Opportunità non trovata" }, { status: 404 })

    if (body.action === "move") {
      const { data: stage } = await db.from("crm_pipeline_stages").select("id").eq("id", body.stageId).eq("property_id", identity.propertyId).eq("pipeline_id", pipeline.id).eq("is_active", true).maybeSingle()
      if (!stage) return NextResponse.json({ error: "Fase non valida per questo workspace" }, { status: 400 })
      const { error } = await db.from("crm_opportunities").update({ stage_id: body.stageId }).eq("id", opportunity.id).eq("property_id", identity.propertyId).eq("workspace_id", workspace.id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.valueCents !== undefined) updates.value_cents = body.valueCents
    if (body.nextAction !== undefined) updates.next_action = body.nextAction
    if (body.nextActionAt !== undefined) updates.next_action_at = body.nextActionAt
    if (body.customValues !== undefined) updates.custom_values = body.customValues
    if (!Object.keys(updates).length) return NextResponse.json({ error: "Nessuna modifica indicata" }, { status: 400 })
    const { error } = await db.from("crm_opportunities").update(updates).eq("id", opportunity.id).eq("property_id", identity.propertyId).eq("workspace_id", workspace.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dati opportunità non validi", details: error.flatten() }, { status: 400 })
    const message = error instanceof Error ? error.message : "Errore CRM"
    return NextResponse.json({ error: message }, { status: message.includes("sola lettura") || message.includes("non disponibile") ? 403 : 500 })
  }
}
