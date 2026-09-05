import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const OPEN_STATUSES = ["pending", "in_progress"]

type AlertRow = {
  id: string
  counterpart_number: string | null
  started_at: string | null
  ended_at: string | null
  extension: string | null
  contact_id: string | null
  callback_status: string | null
  callback_assigned_to: string | null
  callback_visible_after: string | null
}

type ContactRow = { id: string; name: string | null; company: string | null }
type UserRow = { id: string; name: string | null }
type ExtensionRow = { extension: string; label: string | null }

async function identityForCalls(request: NextRequest) {
  await requireAreaApi("calls", request)
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return null
  return identity
}

export async function GET(request: NextRequest) {
  try {
    const identity = await identityForCalls(request)
    if (!identity) return NextResponse.json({ error: "property_required", items: [], count: 0 }, { status: 400 })

    const sb = createServiceClient()
    const now = new Date().toISOString()
    const { data, error } = await sb
      .from("phone_calls")
      .select(
        "id,counterpart_number,started_at,ended_at,extension,contact_id,callback_status,callback_assigned_to,callback_visible_after",
      )
      .eq("property_id", identity.propertyId)
      .in("callback_status", OPEN_STATUSES)
      .lte("callback_visible_after", now)
      .order("callback_visible_after", { ascending: true, nullsFirst: false })
      .limit(20)

    if (error) throw error

    const rows = (data ?? []) as AlertRow[]
    const contactIds = [...new Set(rows.map((row) => row.contact_id).filter(Boolean))] as string[]
    const userIds = [...new Set(rows.map((row) => row.callback_assigned_to).filter(Boolean))] as string[]
    const extensions = [...new Set(rows.map((row) => row.extension).filter(Boolean))] as string[]

    const [contacts, users, labels] = await Promise.all([
      contactIds.length
        ? sb.from("contacts").select("id,name,company").eq("property_id", identity.propertyId).in("id", contactIds)
        : Promise.resolve({ data: [] as ContactRow[] }),
      userIds.length
        ? sb.from("admin_users").select("id,name").eq("property_id", identity.propertyId).in("id", userIds)
        : Promise.resolve({ data: [] as UserRow[] }),
      extensions.length
        ? sb
            .from("telephony_extension_labels")
            .select("extension,label")
            .eq("property_id", identity.propertyId)
            .in("extension", extensions)
        : Promise.resolve({ data: [] as ExtensionRow[] }),
    ])

    const contactById = new Map(((contacts.data ?? []) as ContactRow[]).map((row) => [row.id, row]))
    const userById = new Map(((users.data ?? []) as UserRow[]).map((row) => [row.id, row.name ?? null]))
    const labelByExtension = new Map(
      ((labels.data ?? []) as ExtensionRow[]).map((row) => [String(row.extension), row.label ?? null]),
    )

    const items = rows.map((row) => {
      const contact = row.contact_id ? contactById.get(row.contact_id) : null
      return {
        id: row.id,
        number: row.counterpart_number,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        extension: row.extension,
        extensionLabel: row.extension ? labelByExtension.get(row.extension) ?? null : null,
        contactName: contact?.name ?? contact?.company ?? null,
        status: row.callback_status,
        assignedTo: row.callback_assigned_to,
        assignedToName: row.callback_assigned_to ? userById.get(row.callback_assigned_to) ?? null : null,
        visibleAfter: row.callback_visible_after,
      }
    })

    return NextResponse.json({ items, count: items.length })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[call-alerts] GET failed", error)
    return NextResponse.json({ error: "internal_error", items: [], count: 0 }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await identityForCalls(request)
    if (!identity) return NextResponse.json({ error: "property_required" }, { status: 400 })

    const body = (await request.json().catch(() => null)) as
      | { call_id?: string; action?: "claim" | "resolve" | "dismiss" | "release" }
      | null
    const callId = body?.call_id?.trim()
    const action = body?.action
    if (!callId || !action) return NextResponse.json({ error: "invalid_request" }, { status: 400 })

    const sb = createServiceClient()
    const { data: call, error: callError } = await sb
      .from("phone_calls")
      .select("id,callback_status,callback_assigned_to,callback_visible_after")
      .eq("id", callId)
      .eq("property_id", identity.propertyId)
      .maybeSingle()

    if (callError) throw callError
    if (!call) return NextResponse.json({ error: "not_found" }, { status: 404 })
    if (!OPEN_STATUSES.includes(String(call.callback_status ?? ""))) {
      return NextResponse.json({ error: "already_closed" }, { status: 409 })
    }

    let actorId = identity.adminUserId ?? null
    if (actorId) {
      const { data: actor } = await sb
        .from("admin_users")
        .select("id")
        .eq("id", actorId)
        .eq("property_id", identity.propertyId)
        .maybeSingle()
      if (!actor) actorId = null
    }

    const now = new Date().toISOString()
    const updates: Record<string, string | null> = { callback_updated_at: now }

    if (action === "claim") {
      if (!actorId) return NextResponse.json({ error: "assignee_unavailable" }, { status: 409 })
      updates.callback_status = "in_progress"
      updates.callback_assigned_to = actorId
      updates.callback_resolved_at = null
    } else if (action === "release") {
      updates.callback_status = "pending"
      updates.callback_assigned_to = null
      updates.callback_resolved_at = null
    } else if (action === "resolve") {
      updates.callback_status = "resolved"
      updates.callback_assigned_to = call.callback_assigned_to ?? actorId
      updates.callback_resolved_at = now
    } else if (action === "dismiss") {
      updates.callback_status = "dismissed"
      updates.callback_assigned_to = call.callback_assigned_to ?? actorId
      updates.callback_resolved_at = now
    }

    const { data: updated, error: updateError } = await sb
      .from("phone_calls")
      .update(updates)
      .eq("id", callId)
      .eq("property_id", identity.propertyId)
      .eq("callback_status", call.callback_status)
      .select("id,callback_status,callback_assigned_to,callback_resolved_at")
      .maybeSingle()

    if (updateError) throw updateError
    if (!updated) return NextResponse.json({ error: "conflict" }, { status: 409 })

    return NextResponse.json({ ok: true, alert: updated })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[call-alerts] PATCH failed", error)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
