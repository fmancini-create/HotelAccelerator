import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity, requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { listAccessibleCrmWorkspaces, requireCrmWorkspaceAccess } from "@/lib/crm/workspace-access"

const workspaceKinds = ["hotel", "spa", "restaurant", "company", "agency", "sales", "custom"] as const
const workspaceModes = ["generic", "hotel_date_requests"] as const
const fieldTypes = ["text", "number", "date", "select", "boolean"] as const

const stageSchema = z.object({
  stageKey: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(100),
  category: z.enum(["open", "won", "lost"]),
  color: z.string().trim().max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000),
})

const fieldSchema = z.object({
  fieldKey: z.string().trim().regex(/^[a-z0-9_]+$/).max(60),
  label: z.string().trim().min(1).max(100),
  fieldType: z.enum(fieldTypes),
  options: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000),
})

const saveSchema = z.object({
  action: z.literal("save"),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).min(2).max(80),
  kind: z.enum(workspaceKinds),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  mode: z.enum(workspaceModes).default("generic"),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  groupIds: z.array(z.string().uuid()).max(50).default([]),
  stages: z.array(stageSchema).min(2).max(30),
  fields: z.array(fieldSchema).max(40).default([]),
})

const archiveSchema = z.object({ action: z.literal("archive"), id: z.string().uuid() })
const assignSchema = z.object({ action: z.literal("assign_contact"), workspaceId: z.string().uuid(), contactId: z.string().uuid() })
const unassignSchema = z.object({ action: z.literal("unassign_contact"), workspaceId: z.string().uuid(), contactId: z.string().uuid() })
const actionSchema = z.discriminatedUnion("action", [saveSchema, archiveSchema, assignSchema, unassignSchema])

async function loadWorkspaceDetails(db: ReturnType<typeof createServiceClient>, propertyId: string, workspaceIds: string[]) {
  if (!workspaceIds.length) return { groups: [], pipelines: [], stages: [], fields: [] }
  const [{ data: groups, error: groupsError }, { data: pipelines, error: pipelinesError }, { data: fields, error: fieldsError }] = await Promise.all([
    db.from("crm_workspace_groups").select("workspace_id,group_id,can_read,can_write").eq("property_id", propertyId).in("workspace_id", workspaceIds),
    db.from("crm_pipelines").select("id,workspace_id,name,is_default,is_active").eq("property_id", propertyId).in("workspace_id", workspaceIds).eq("is_active", true),
    db.from("crm_workspace_fields").select("id,workspace_id,field_key,label,field_type,options,is_required,sort_order").eq("property_id", propertyId).in("workspace_id", workspaceIds).eq("is_active", true).order("sort_order"),
  ])
  if (groupsError) throw groupsError
  if (pipelinesError) throw pipelinesError
  if (fieldsError) throw fieldsError
  const pipelineIds = (pipelines ?? []).map((p) => p.id as string)
  const { data: stages, error: stagesError } = pipelineIds.length
    ? await db.from("crm_pipeline_stages").select("id,pipeline_id,stage_key,name,category,color,sort_order").eq("property_id", propertyId).in("pipeline_id", pipelineIds).eq("is_active", true).order("sort_order")
    : { data: [], error: null }
  if (stagesError) throw stagesError
  return { groups: groups ?? [], pipelines: pipelines ?? [], stages: stages ?? [], fields: fields ?? [] }
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const identity = await getCallerIdentity(request)
    if (!identity?.propertyId) return NextResponse.json({ error: "Nessun tenant selezionato" }, { status: 400 })
    const db = createServiceClient()
    const scopedIdentity = identity as typeof identity & { propertyId: string }
    const workspaces = await listAccessibleCrmWorkspaces(db, scopedIdentity)
    const details = await loadWorkspaceDetails(db, identity.propertyId, workspaces.map((w) => w.id))
    const [{ data: property, error: propertyError }, { data: tenantGroups, error: tenantGroupsError }] = await Promise.all([
      db.from("properties").select("type").eq("id", identity.propertyId).single(),
      db.from("user_groups").select("id,name,color").eq("property_id", identity.propertyId).order("name"),
    ])
    if (propertyError) throw propertyError
    if (tenantGroupsError) throw tenantGroupsError

    return NextResponse.json({
      propertyType: property.type,
      canConfigure: identity.isSuperAdmin || identity.isTenantAdmin,
      groups: tenantGroups ?? [],
      workspaces: workspaces.map((workspace) => {
        const pipeline = details.pipelines.find((p) => p.workspace_id === workspace.id && p.is_default)
        return {
          ...workspace,
          groupIds: details.groups.filter((g) => g.workspace_id === workspace.id).map((g) => g.group_id),
          pipeline: pipeline ? { id: pipeline.id, name: pipeline.name, stages: details.stages.filter((s) => s.pipeline_id === pipeline.id) } : null,
          fields: details.fields.filter((f) => f.workspace_id === workspace.id),
        }
      }),
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore CRM" }, { status: accessErrorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const raw = actionSchema.parse(await request.json())
    const db = createServiceClient()

    if (raw.action === "assign_contact" || raw.action === "unassign_contact") {
      const identity = await getCallerIdentity(request)
      if (!identity?.propertyId) return NextResponse.json({ error: "Nessun tenant selezionato" }, { status: 400 })
      const scopedIdentity = identity as typeof identity & { propertyId: string }
      await requireCrmWorkspaceAccess(db, scopedIdentity, raw.workspaceId, true)
      const { data: contact, error: contactError } = await db.from("contacts").select("id").eq("id", raw.contactId).eq("property_id", identity.propertyId).maybeSingle()
      if (contactError) throw contactError
      if (!contact) return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 })
      if (raw.action === "assign_contact") {
        const { error } = await db.from("crm_workspace_contacts").upsert({ property_id: identity.propertyId, workspace_id: raw.workspaceId, contact_id: raw.contactId, created_by: identity.adminUserId }, { onConflict: "workspace_id,contact_id" })
        if (error) throw error
      } else {
        const { data: workspace } = await db.from("crm_workspaces").select("is_default").eq("id", raw.workspaceId).eq("property_id", identity.propertyId).single()
        if (workspace?.is_default) return NextResponse.json({ error: "Il contatto non può essere rimosso dal workspace predefinito." }, { status: 409 })
        const { error } = await db.from("crm_workspace_contacts").delete().eq("property_id", identity.propertyId).eq("workspace_id", raw.workspaceId).eq("contact_id", raw.contactId)
        if (error) throw error
      }
      return NextResponse.json({ ok: true })
    }

    const identity = await requireTenantAdmin(request)

    if (raw.action === "archive") {
      const { data: workspace, error: findError } = await db.from("crm_workspaces").select("id,is_default").eq("id", raw.id).eq("property_id", identity.propertyId).maybeSingle()
      if (findError) throw findError
      if (!workspace) return NextResponse.json({ error: "Workspace non trovato" }, { status: 404 })
      if (workspace.is_default) return NextResponse.json({ error: "Il workspace predefinito non può essere archiviato." }, { status: 409 })
      const { error } = await db.from("crm_workspaces").update({ is_active: false }).eq("id", raw.id).eq("property_id", identity.propertyId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    const payload = raw
    let workspaceId = payload.id
    let isDefault = false
    if (workspaceId) {
      const { data: current, error: currentError } = await db.from("crm_workspaces").select("id,is_default,mode").eq("id", workspaceId).eq("property_id", identity.propertyId).maybeSingle()
      if (currentError) throw currentError
      if (!current) return NextResponse.json({ error: "Workspace non trovato" }, { status: 404 })
      isDefault = current.is_default === true
      if (payload.isDefault !== isDefault) return NextResponse.json({ error: "Il workspace predefinito è stabile in questa versione e non può essere spostato." }, { status: 409 })
      if (isDefault && payload.mode !== current.mode) return NextResponse.json({ error: "La modalità del workspace predefinito non può essere cambiata." }, { status: 409 })
      const { data, error } = await db.from("crm_workspaces").update({
        name: payload.name,
        slug: payload.slug,
        kind: payload.kind,
        description: payload.description ?? null,
        color: payload.color ?? null,
        mode: payload.mode,
        is_active: payload.isActive,
        sort_order: payload.sortOrder,
      }).eq("id", workspaceId).eq("property_id", identity.propertyId).select("id").single()
      if (error) throw error
      workspaceId = data.id
    } else {
      if (payload.isDefault) return NextResponse.json({ error: "Esiste già un workspace predefinito. I nuovi workspace sono aggiuntivi." }, { status: 409 })
      const { data, error } = await db.from("crm_workspaces").insert({
        property_id: identity.propertyId,
        name: payload.name,
        slug: payload.slug,
        kind: payload.kind,
        description: payload.description ?? null,
        color: payload.color ?? null,
        mode: "generic",
        is_default: false,
        is_active: payload.isActive,
        sort_order: payload.sortOrder,
        created_by: identity.adminUserId,
      }).select("id").single()
      if (error) throw error
      workspaceId = data.id
    }

    const validGroups = payload.groupIds.length
      ? await db.from("user_groups").select("id").eq("property_id", identity.propertyId).in("id", payload.groupIds)
      : { data: [], error: null }
    if (validGroups.error) throw validGroups.error
    if ((validGroups.data ?? []).length !== payload.groupIds.length) return NextResponse.json({ error: "Uno o più gruppi non appartengono al tenant attivo." }, { status: 400 })

    const { error: deleteGroupsError } = await db.from("crm_workspace_groups").delete().eq("property_id", identity.propertyId).eq("workspace_id", workspaceId)
    if (deleteGroupsError) throw deleteGroupsError
    if (payload.groupIds.length) {
      const { error } = await db.from("crm_workspace_groups").insert(payload.groupIds.map((groupId) => ({ property_id: identity.propertyId, workspace_id: workspaceId, group_id: groupId, can_read: true, can_write: true })))
      if (error) throw error
    }

    const { data: existingPipeline, error: pipelineFindError } = await db.from("crm_pipelines").select("id").eq("property_id", identity.propertyId).eq("workspace_id", workspaceId).eq("is_default", true).maybeSingle()
    if (pipelineFindError) throw pipelineFindError
    let pipelineId = existingPipeline?.id as string | undefined
    if (!pipelineId) {
      const { data, error } = await db.from("crm_pipelines").insert({ property_id: identity.propertyId, workspace_id: workspaceId, name: "Pipeline principale", is_default: true }).select("id").single()
      if (error) throw error
      pipelineId = data.id
    }

    const { count: opportunityCount, error: opportunityCountError } = await db.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("property_id", identity.propertyId).eq("workspace_id", workspaceId)
    if (opportunityCountError) throw opportunityCountError
    if ((opportunityCount ?? 0) > 0) {
      const { data: currentStages, error: currentStagesError } = await db.from("crm_pipeline_stages").select("stage_key,name,category,sort_order").eq("property_id", identity.propertyId).eq("pipeline_id", pipelineId).eq("is_active", true).order("sort_order")
      if (currentStagesError) throw currentStagesError
      const currentKeys = (currentStages ?? []).map((s) => s.stage_key).sort().join("|")
      const nextKeys = payload.stages.map((s) => s.stageKey).sort().join("|")
      if (currentKeys !== nextKeys) return NextResponse.json({ error: "La pipeline contiene opportunità: puoi rinominare/riordinare le fasi, ma non aggiungerle o rimuoverle in questa versione." }, { status: 409 })
      for (const stage of payload.stages) {
        const { error } = await db.from("crm_pipeline_stages").update({ name: stage.name, category: stage.category, color: stage.color ?? null, sort_order: stage.sortOrder }).eq("property_id", identity.propertyId).eq("pipeline_id", pipelineId).eq("stage_key", stage.stageKey)
        if (error) throw error
      }
    } else {
      const { error: deleteStagesError } = await db.from("crm_pipeline_stages").delete().eq("property_id", identity.propertyId).eq("pipeline_id", pipelineId)
      if (deleteStagesError) throw deleteStagesError
      const { error: stageInsertError } = await db.from("crm_pipeline_stages").insert(payload.stages.map((stage) => ({ property_id: identity.propertyId, pipeline_id: pipelineId, stage_key: stage.stageKey, name: stage.name, category: stage.category, color: stage.color ?? null, sort_order: stage.sortOrder, is_active: true })))
      if (stageInsertError) throw stageInsertError
    }

    const { error: deleteFieldsError } = await db.from("crm_workspace_fields").delete().eq("property_id", identity.propertyId).eq("workspace_id", workspaceId)
    if (deleteFieldsError) throw deleteFieldsError
    if (payload.fields.length) {
      const { error } = await db.from("crm_workspace_fields").insert(payload.fields.map((field) => ({ property_id: identity.propertyId, workspace_id: workspaceId, field_key: field.fieldKey, label: field.label, field_type: field.fieldType, options: field.options, is_required: field.isRequired, sort_order: field.sortOrder, is_active: true })))
      if (error) throw error
    }

    return NextResponse.json({ ok: true, workspaceId })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Configurazione workspace non valida", details: error.flatten() }, { status: 400 })
    const message = error instanceof Error ? error.message : "Errore CRM"
    const status = message.includes("sola lettura") || message.includes("non disponibile") ? 403 : accessErrorStatus(error)
    return NextResponse.json({ error: message }, { status })
  }
}
