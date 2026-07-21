import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

// PATCH - Update organization
// Next.js 16: i params dinamici sono Promise.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const serviceSupabase = await createServiceRoleClient()

    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()

    // Only allow updating specific fields
    const allowedFields: Record<string, unknown> = {}
    if (body.name !== undefined) allowedFields.name = body.name
    if (body.type !== undefined) allowedFields.type = body.type
    if (body.company_name !== undefined) allowedFields.company_name = body.company_name
    if (body.vat_number !== undefined) allowedFields.vat_number = body.vat_number
    allowedFields.updated_at = new Date().toISOString()

    const { data: org, error } = await serviceSupabase
      .from("organizations")
      .update(allowedFields)
      .eq("id", id)
      .select()
      .maybeSingle()

    if (error) {
      console.error("Error updating organization:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    // SYNC: When vat_number is updated on organization, also update all
    // pms_integrations for hotels belonging to this organization.
    if (body.vat_number !== undefined) {
      const { data: hotels } = await serviceSupabase
        .from("hotels")
        .select("id")
        .eq("organization_id", id)
        .is("deleted_at", null)

      if (hotels && hotels.length > 0) {
        const hotelIds = hotels.map((h: any) => h.id)
        await serviceSupabase
          .from("pms_integrations")
          .update({ vat_number: body.vat_number || null })
          .in("hotel_id", hotelIds)
      }
    }

    return NextResponse.json({ success: true, organization: org })
  } catch (error) {
    console.error("Error in organization PATCH route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete organization (only if it has no hotels)
// Next.js 16: i params dinamici sono Promise.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const serviceSupabase = await createServiceRoleClient()

    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Check if organization has any ACTIVE hotels (not soft-deleted)
    const { data: activeHotels } = await serviceSupabase
      .from("hotels")
      .select("id")
      .eq("organization_id", id)
      .is("deleted_at", null)

    if (activeHotels && activeHotels.length > 0) {
      return NextResponse.json(
        {
          error: `Impossibile eliminare: l'organizzazione ha ${activeHotels.length} struttura/e attive associate. Rimuovi prima le strutture.`,
        },
        { status: 400 }
      )
    }

    // Detach all FK references before deleting the organization:
    // 1. Nullify organization_id on profiles
    await serviceSupabase
      .from("profiles")
      .update({ organization_id: null })
      .eq("organization_id", id)

    // 2. Nullify organization_id on soft-deleted hotels
    await serviceSupabase
      .from("hotels")
      .update({ organization_id: null })
      .eq("organization_id", id)

    // 3. Delete/nullify ALL FK references (including NO ACTION constraints that block delete)
    // audit_logs and user_invitations have NO ACTION → must be cleaned before org delete
    await Promise.all([
      serviceSupabase.from("alert_rules").delete().eq("organization_id", id),
      serviceSupabase.from("audit_logs").update({ organization_id: null }).eq("organization_id", id),
      serviceSupabase.from("invoices").delete().eq("organization_id", id),
      serviceSupabase.from("team_invitations").delete().eq("organization_id", id),
      serviceSupabase.from("user_invitations").delete().eq("organization_id", id),
      serviceSupabase.from("platform_api_keys").delete().eq("organization_id", id),
      serviceSupabase.from("platform_webhooks").delete().eq("organization_id", id),
    ])

    // Now safe to hard delete the organization
    const { error } = await serviceSupabase.from("organizations").delete().eq("id", id)

    if (error) {
      console.error("Error deleting organization:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in organization DELETE route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
