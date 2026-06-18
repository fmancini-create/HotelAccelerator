import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"

// Update a canned response. Only the owner (personal) may edit; shared ones
// created by someone else cannot be edited by other users.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getAuthenticatedUser(request)
    const propertyId = user.propertyId ?? (user as any).property_id
    const adminUserId = user.adminUserId ?? null

    const body = await request.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.title === "string") updates.title = body.title.trim()
    if (typeof body.content === "string") updates.content = body.content
    if (typeof body.is_shared === "boolean") updates.is_shared = body.is_shared

    const supabase = await createClient()

    // Ensure the response belongs to this property and the user owns it
    const { data: existing } = await supabase
      .from("canned_responses")
      .select("id, created_by")
      .eq("id", id)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: "Risposta non trovata" }, { status: 404 })
    }
    if (existing.created_by && existing.created_by !== adminUserId) {
      return NextResponse.json({ error: "Non puoi modificare questa risposta" }, { status: 403 })
    }

    const { data, error } = await supabase
      .from("canned_responses")
      .update(updates)
      .eq("id", id)
      .eq("property_id", propertyId)
      .select("id, title, content, is_shared, created_by, created_at, updated_at")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ response: { ...data, is_owner: adminUserId != null && data.created_by === adminUserId } })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getAuthenticatedUser(request)
    const propertyId = user.propertyId ?? (user as any).property_id
    const adminUserId = user.adminUserId ?? null

    const supabase = await createClient()

    const { data: existing } = await supabase
      .from("canned_responses")
      .select("id, created_by")
      .eq("id", id)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: "Risposta non trovata" }, { status: 404 })
    }
    if (existing.created_by && existing.created_by !== adminUserId) {
      return NextResponse.json({ error: "Non puoi eliminare questa risposta" }, { status: 403 })
    }

    const { error } = await supabase
      .from("canned_responses")
      .delete()
      .eq("id", id)
      .eq("property_id", propertyId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleServiceError(error)
  }
}
