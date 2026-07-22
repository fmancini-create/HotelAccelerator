import { createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.json({ error: "Token mancante" }, { status: 400 })
    }

    const supabaseAdmin = await createServiceRoleClient()

    const { data: invitation, error } = await supabaseAdmin
      .from("user_invitations")
      .select("id, email, role, hotel_name, hotel_id, organization_id, invited_by_name, invited_by, first_name, last_name, accepted_at, expires_at")
      .eq("token", token)
      .is("accepted_at", null)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle()

    if (error || !invitation) {
      console.log("[v0] Validate: no invitation found, error:", error)
      return NextResponse.json(
        { error: "Invito non valido o scaduto" },
        { status: 404 },
      )
    }

    // Check if the email already exists as a registered user
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, organization_id")
      .eq("email", invitation.email.toLowerCase().trim())
      .maybeSingle()

    const userAlreadyExists = !!existingProfile

    console.log("[v0] Validate: invitation found, userAlreadyExists:", userAlreadyExists, "email:", invitation.email)

    return NextResponse.json({
      valid: true,
      email: invitation.email,
      role: invitation.role,
      hotel_name: invitation.hotel_name,
      hotel_id: invitation.hotel_id,
      organization_id: invitation.organization_id,
      invited_by_name: invitation.invited_by_name,
      first_name: invitation.first_name || "",
      last_name: invitation.last_name || "",
      userAlreadyExists,
    })
  } catch (error) {
    console.error("[InviteValidate] Error:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
