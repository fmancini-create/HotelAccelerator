import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const supabaseAdmin = await createServiceRoleClient()
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: "Token mancante" }, { status: 400 })
    }

    // Get current authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Find the invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from("user_invitations")
      .select("*")
      .eq("token", token)
      .is("accepted_at", null)
      .gte("expires_at", new Date().toISOString())
      .single()

    if (invError || !invitation) {
      return NextResponse.json(
        { error: "Invito non valido o scaduto" },
        { status: 404 },
      )
    }

    // Get current profile to check if user already has an organization
    const { data: currentProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, organization_id, role")
      .eq("id", user.id)
      .maybeSingle()

    const hasExistingOrg = !!currentProfile?.organization_id

    // Build profile updates: always set name from invitation if profile is missing it
    const profileUpdate: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Set organization and role for users without an existing org
    if (!hasExistingOrg) {
      profileUpdate.organization_id = invitation.organization_id
      profileUpdate.role = invitation.role
    }

    // Always fill in first_name/last_name if missing in profile
    const { data: fullProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single()

    if (!fullProfile?.first_name && invitation.first_name) {
      profileUpdate.first_name = invitation.first_name
    }
    if (!fullProfile?.last_name && invitation.last_name) {
      profileUpdate.last_name = invitation.last_name
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id)

    if (profileError) {
      console.error("[InviteAccept] Error updating profile:", profileError)
      return NextResponse.json(
        { error: "Errore nell'aggiornamento del profilo" },
        { status: 500 },
      )
    }
    console.log("[InviteAccept] Profile updated for user", user.id, hasExistingOrg ? "(existing org kept)" : "(new org assigned: " + invitation.organization_id + ")")

    // ALWAYS add the hotel to user_property_map so the user can access it
    // This is the key: a user can belong to org A but still access hotels from org B via invitations
    if (invitation.hotel_id) {
      const { error: mapError } = await supabaseAdmin
        .from("user_property_map")
        .upsert({
          user_id: user.id,
          hotel_id: invitation.hotel_id,
          can_manage: invitation.role === "property_admin" || invitation.role === "admin",
          can_view_financials: true,
          can_sync_data: invitation.role === "property_admin" || invitation.role === "admin",
          can_manage_team: invitation.role === "property_admin" || invitation.role === "admin",
          assigned_by: invitation.invited_by,
          assigned_at: new Date().toISOString(),
        }, { onConflict: "user_id,hotel_id" })

      if (mapError) {
        console.error("[InviteAccept] user_property_map upsert error:", mapError.message)
      } else {
        console.log("[InviteAccept] user_property_map entry created/updated for user", user.id, "hotel", invitation.hotel_id)
      }
    }

    // Mark invitation as accepted
    await supabaseAdmin
      .from("user_invitations")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: user.id,
      })
      .eq("id", invitation.id)

    console.log("[InviteAccept] Invitation", invitation.id, "accepted by", user.id)

    return NextResponse.json({
      success: true,
      hotel_id: invitation.hotel_id,
      organization_id: invitation.organization_id,
      role: invitation.role,
      existingUser: hasExistingOrg,
    })
  } catch (error) {
    console.error("[InviteAccept] Error:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
