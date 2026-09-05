import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId, getDevBypass } from "@/lib/auth-property"
import { getManubotClient, HA_TO_MANUBOT_PRIORITY, type ManubotTaskPhoto } from "@/lib/manubot"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { resolvePropertyIdForCaller } from "@/lib/auth/property-scope"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("todos", request)
    if (await getDevBypass(request)) return NextResponse.json({ todos: [] })

    const identity = await getCallerIdentity(request)
    if (!identity) return NextResponse.json({ error: "unauthorized", todos: [] }, { status: 401 })
    if (!identity.isSuperAdmin && !identity.isTenantAdmin) {
      return NextResponse.json({ error: "forbidden", todos: [] }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const scope = await resolvePropertyIdForCaller(identity, searchParams.get("property_id"))
    if (!scope.ok) {
      return NextResponse.json(
        { error: scope.error, message: scope.message, todos: [] },
        { status: scope.status },
      )
    }

    const supabase = createServiceClient()
    const status = searchParams.get("status")
    const assignedTo = searchParams.get("assigned_to")

    let query = supabase
      .from("todos")
      .select(`
        id, title, description, status, priority,
        assigned_to, created_by, due_date,
        external_id, external_source, external_url, external_data,
        tags, attachments, created_at, updated_at, completed_at
      `)
      .eq("property_id", scope.propertyId)
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (assignedTo) query = query.eq("assigned_to", assignedTo)

    const { data: todos, error } = await query
    if (error) throw error
    return NextResponse.json({ todos })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[v0] GET /api/admin/todos failed:", error?.message)
    return NextResponse.json({ error: "internal_error", todos: [] }, { status: 500 })
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))]
}

function photoArray(value: unknown): ManubotTaskPhoto[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      url: typeof item.url === "string" ? item.url : "",
      filename: typeof item.filename === "string" ? item.filename : "allegato",
      size: typeof item.size === "number" ? item.size : 0,
      type: typeof item.type === "string" ? item.type : "application/octet-stream",
    }))
    .filter((item) => item.url.length > 0)
}

// POST /api/admin/todos - Create a new todo, optionally mirrored to ManuBot.
export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("todos", request)
    if (await getDevBypass(request)) {
      const body = await request.json()
      return NextResponse.json({
        todo: {
          id: crypto.randomUUID(),
          ...body,
          status: "open",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        manubot_synced: body.send_to_manubot ? true : null,
      }, { status: 201 })
    }

    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json()

    const {
      title,
      description,
      priority,
      assigned_to,
      due_date,
      tags,
      send_to_manubot,
      manubot_assigned_to,
      manubot_group_id,
      manubot_asset_id,
      manubot_asset_category_id,
      manubot_property_id,
      manubot_requires_completion_photo,
      manubot_expected_resolution_minutes,
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: "Il titolo è obbligatorio" }, { status: 400 })
    }

    const manubotAssigneeIds = stringArray(body.manubot_assignee_ids)
    const manubotGroupIds = stringArray(body.manubot_group_ids)
    const manubotAssetIds = stringArray(body.manubot_asset_ids)
    const manubotProcedureIds = stringArray(body.manubot_procedure_ids)
    const manubotPhotos = photoArray(body.manubot_photos)

    if (send_to_manubot) {
      const hasResponsible =
        manubotAssigneeIds.length > 0
        || manubotGroupIds.length > 0
        || (typeof manubot_assigned_to === "string" && manubot_assigned_to.trim())
        || (typeof manubot_group_id === "string" && manubot_group_id.trim())
      if (!hasResponsible) {
        return NextResponse.json(
          { error: "Per inoltrare a ManuBot assegna almeno un tecnico o un gruppo." },
          { status: 400 },
        )
      }

      const expected = Number(manubot_expected_resolution_minutes)
      if (!Number.isInteger(expected) || expected < 5 || expected > 1440) {
        return NextResponse.json(
          { error: "Il tempo stimato ManuBot deve essere compreso tra 5 e 1440 minuti." },
          { status: 400 },
        )
      }
    }

    const initialExternalData = send_to_manubot
      ? {
          manubot_sync_status: "pending",
          requested_at: new Date().toISOString(),
          manubot_options: {
            assignee_ids: manubotAssigneeIds,
            group_ids: manubotGroupIds,
            asset_ids: manubotAssetIds,
            asset_category_id: manubot_asset_category_id || null,
            property_id: manubot_property_id || null,
            procedure_ids: manubotProcedureIds,
            expected_resolution_minutes: Number(manubot_expected_resolution_minutes),
            requires_completion_photo: Boolean(manubot_requires_completion_photo),
          },
        }
      : null

    const { data: todo, error } = await supabase
      .from("todos")
      .insert({
        property_id: propertyId,
        title: title.trim(),
        description: description || null,
        priority: priority || "normal",
        assigned_to: assigned_to || null,
        due_date: due_date || null,
        tags: tags || [],
        attachments: manubotPhotos,
        external_source: send_to_manubot ? "manubot" : null,
        external_data: initialExternalData,
      })
      .select()
      .single()

    if (error) throw error

    let manubotSynced: boolean | null = send_to_manubot ? false : null
    let manubotError: string | null = null

    if (send_to_manubot && todo) {
      try {
        const { data: property } = await supabase
          .from("properties")
          .select("manubot_email, manubot_password, manubot_supabase_url, manubot_company_id")
          .eq("id", propertyId)
          .single()

        const client = property ? await getManubotClient(property) : null
        if (!client) throw new Error("Configurazione ManuBot non disponibile")

        const fallbackAssignee = typeof manubot_assigned_to === "string" && manubot_assigned_to.trim()
          ? manubot_assigned_to.trim()
          : null
        const fallbackGroup = typeof manubot_group_id === "string" && manubot_group_id.trim()
          ? manubot_group_id.trim()
          : null
        const fallbackAsset = typeof manubot_asset_id === "string" && manubot_asset_id.trim()
          ? manubot_asset_id.trim()
          : null

        const assigneeIds = manubotAssigneeIds.length > 0
          ? manubotAssigneeIds
          : fallbackAssignee ? [fallbackAssignee] : []
        const groupIds = manubotGroupIds.length > 0
          ? manubotGroupIds
          : fallbackGroup ? [fallbackGroup] : []
        const assetIds = manubotAssetIds.length > 0
          ? manubotAssetIds
          : fallbackAsset ? [fallbackAsset] : []

        const manubotTask = await client.createTask(
          {
            title: todo.title,
            description: todo.description,
            priority: HA_TO_MANUBOT_PRIORITY[todo.priority] || "medium",
            assigned_to: assigneeIds[0] || null,
            operator_group_id: groupIds[0] || null,
            assignee_ids: assigneeIds,
            group_ids: groupIds,
            asset_id: assetIds[0] || null,
            asset_ids: assetIds,
            asset_category_id: manubot_asset_category_id || null,
            property_id: manubot_property_id || null,
            photos: manubotPhotos,
            requires_completion_photo: Boolean(manubot_requires_completion_photo),
            procedure_ids: manubotProcedureIds,
            expected_resolution_minutes: Number(manubot_expected_resolution_minutes),
            client_request_id: `ha-todo-${todo.id}`,
          },
          `ha-todo-${todo.id}`,
        )

        const syncedData = {
          ...(initialExternalData || {}),
          manubot_task_id: manubotTask.id,
          company_id: property?.manubot_company_id,
          manubot_sync_status: "synced",
          synced_at: new Date().toISOString(),
        }
        await supabase
          .from("todos")
          .update({
            external_id: manubotTask.id,
            external_url: `https://manubot.it/tasks/${manubotTask.id}`,
            external_data: syncedData,
          })
          .eq("id", todo.id)

        todo.external_id = manubotTask.id
        todo.external_url = `https://manubot.it/tasks/${manubotTask.id}`
        todo.external_data = syncedData
        manubotSynced = true
      } catch (e: any) {
        manubotError = "manubot_sync_failed"
        console.error("[Manubot] push failed:", e?.message)
        const failedData = {
          ...(initialExternalData || {}),
          manubot_sync_status: "failed",
          failed_at: new Date().toISOString(),
        }
        await supabase.from("todos").update({ external_data: failedData }).eq("id", todo.id)
        todo.external_data = failedData
      }
    }

    return NextResponse.json(
      { todo, manubot_synced: manubotSynced, manubot_error: manubotError },
      { status: 201 },
    )
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[v0] POST /api/admin/todos failed:", error?.message)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
