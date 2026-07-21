import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: organizationId } = await params
    const supabase = await createClient()
    // FIX 11/05/2026: Usare service-role per bypassare RLS su organizations
    const serviceSupabase = await createServiceRoleClient()
    const body = await request.json()

    // Verify user has access to this organization
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's profile to check role and organization access
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const isSuperAdmin = profile.role === "super_admin"

    // Only super_admin can update organization business data (company_name, vat_number)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Solo il super admin puo' modificare i dati aziendali" }, { status: 403 })
    }

    // Update organization using service role (bypasses RLS)
    const { data, error } = await serviceSupabase
      .from("organizations")
      .update({
        company_name: body.company_name,
        vat_number: body.vat_number,
        updated_at: new Date().toISOString(),
      })
      .eq("id", organizationId)
      .select()
      .single()

    if (error) {
      console.error("Error updating organization:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // SYNC: When vat_number is updated on organization, also update all
    // pms_integrations for hotels belonging to this organization.
    // This ensures pms_integrations.vat_number stays in sync for
    // fiscal production API calls that read from pms_integrations.
    if (body.vat_number !== undefined) {
      // Get all hotels for this organization
      const { data: hotels } = await serviceSupabase
        .from("hotels")
        .select("id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)

      if (hotels && hotels.length > 0) {
        const hotelIds = hotels.map((h) => h.id)
        await serviceSupabase
          .from("pms_integrations")
          .update({ vat_number: body.vat_number || null })
          .in("hotel_id", hotelIds)
      }
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("Error in PATCH /api/organizations/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
