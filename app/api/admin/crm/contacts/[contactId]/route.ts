import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import {
  applyContactAccess,
  normalizeRequestedContactVisibility,
  resolveContactAccess,
} from "@/lib/crm/contact-access"
import { invalidateDynamicSegments } from "@/lib/crm/segment-service"

async function contactContext(request: NextRequest) {
  await requireAreaApi("crm", request)
  const propertyId = await getCurrentProperty(request)
  const identity = await getCallerIdentity(request)
  if (!propertyId || !identity) return null
  const supabase = createServiceClient()
  const access = await resolveContactAccess(supabase, { ...identity, propertyId })
  return { propertyId, identity, supabase, access }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  try {
    const { contactId } = await params
    const ctx = await contactContext(request)
    if (!ctx) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const query = applyContactAccess(
      ctx.supabase
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .eq("property_id", ctx.propertyId),
      ctx.access,
    )
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 })

    const { data: sharing } = await ctx.supabase
      .from("contact_visibility_groups")
      .select("group_id")
      .eq("property_id", ctx.propertyId)
      .eq("contact_id", contactId)

    return NextResponse.json({ ...data, group_ids: (sharing ?? []).map((r: any) => r.group_id) })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching contact:", error)
    return NextResponse.json({ error: "Failed to fetch contact" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  try {
    const { contactId } = await params
    const ctx = await contactContext(request)
    if (!ctx) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const visibleQuery = applyContactAccess(
      ctx.supabase
        .from("contacts")
        .select("id, source, owner_user_id, visibility_scope")
        .eq("id", contactId)
        .eq("property_id", ctx.propertyId),
      ctx.access,
    )
    const { data: current, error: currentError } = await visibleQuery.maybeSingle()
    if (currentError) throw currentError
    if (!current) return NextResponse.json({ error: "Contatto non trovato" }, { status: 404 })

    const body = await request.json()
    const canManageSharing =
      ctx.identity.isSuperAdmin ||
      ctx.identity.isTenantAdmin ||
      (ctx.identity.adminUserId && current.owner_user_id === ctx.identity.adminUserId)

    const requestedGroupIds = Array.isArray(body.group_ids)
      ? [...new Set(body.group_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
      : null

    let visibilityScope = String(current.visibility_scope || "tenant")
    let ownerUserId = current.owner_user_id as string | null
    let validGroupIds: string[] | null = null

    if (canManageSharing && ("visibility_scope" in body || requestedGroupIds !== null)) {
      visibilityScope = normalizeRequestedContactVisibility(
        current.source,
        body.visibility_scope ?? current.visibility_scope,
        ctx.identity.adminUserId,
      )
      ownerUserId = visibilityScope === "tenant" ? null : current.owner_user_id || ctx.identity.adminUserId || null

      if (visibilityScope === "groups") {
        const ids = requestedGroupIds ?? []
        if (ids.length > 0) {
          const { data: groups } = await ctx.supabase
            .from("user_groups")
            .select("id")
            .eq("property_id", ctx.propertyId)
            .in("id", ids)
          validGroupIds = (groups ?? []).map((g: any) => String(g.id))
        } else {
          validGroupIds = []
        }
        if ((validGroupIds ?? []).length === 0) visibilityScope = "private"
      } else {
        validGroupIds = []
      }
    }

    const { group_ids: _groupIds, property_id: _property, owner_user_id: _owner, visibility_scope: _scope, ...safeBody } = body
    const { data, error } = await ctx.supabase
      .from("contacts")
      .update({
        ...safeBody,
        visibility_scope: visibilityScope,
        owner_user_id: ownerUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId)
      .eq("property_id", ctx.propertyId)
      .select()
      .single()

    if (error) throw error

    if (validGroupIds !== null) {
      await ctx.supabase
        .from("contact_visibility_groups")
        .delete()
        .eq("property_id", ctx.propertyId)
        .eq("contact_id", contactId)
      if (visibilityScope === "groups" && validGroupIds.length > 0) {
        const rows = validGroupIds.map((group_id) => ({ property_id: ctx.propertyId, contact_id: contactId, group_id }))
        const { error: shareError } = await ctx.supabase.from("contact_visibility_groups").insert(rows)
        if (shareError) throw shareError
      }
    }

    await invalidateDynamicSegments(ctx.supabase, ctx.propertyId)
    return NextResponse.json({ ...data, group_ids: validGroupIds ?? undefined })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error updating contact:", error)
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 })
  }
}
