import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { sendEmail } from "@/lib/email"
import { getTeamInviteEmail } from "@/lib/email-templates"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = await createServiceRoleClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Check user permissions
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id, first_name, last_name")
      .eq("id", user.id)
      .single()

    if (!profile || (profile.role !== "property_admin" && profile.role !== "super_admin")) {
      return NextResponse.json(
        { error: "Solo gli amministratori possono reinviare inviti" },
        { status: 403 },
      )
    }

    // Get the existing invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from("user_invitations")
      .select("*")
      .eq("id", id)
      .single()

    if (invError || !invitation) {
      return NextResponse.json(
        { error: "Invito non trovato" },
        { status: 404 },
      )
    }

    // Check invitation hasn't been accepted
    if (invitation.accepted_at) {
      return NextResponse.json(
        { error: "Questo invito e' gia' stato accettato" },
        { status: 400 },
      )
    }

    // For property_admin, verify they belong to same organization
    if (profile.role === "property_admin" && profile.organization_id !== invitation.organization_id) {
      return NextResponse.json(
        { error: "Non hai permesso di reinviare questo invito" },
        { status: 403 },
      )
    }

    // Generate new token and extend expiration
    const newToken = randomBytes(32).toString("hex")
    const newExpires = new Date()
    newExpires.setDate(newExpires.getDate() + 7)

    const inviterName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || user.email || "Admin"

    // Update invitation with new token and expiry
    const { error: updateError } = await supabaseAdmin
      .from("user_invitations")
      .update({
        token: newToken,
        expires_at: newExpires.toISOString(),
        invited_by: user.id,
        invited_by_name: inviterName,
      })
      .eq("id", id)

    if (updateError) {
      console.error("[Resend Invite] Error updating invitation:", updateError)
      return NextResponse.json(
        { error: "Errore durante l'aggiornamento dell'invito" },
        { status: 500 },
      )
    }

    // Build invite URL using request origin for correct domain
    const requestOrigin = request.headers.get("origin")
      || request.headers.get("referer")?.replace(/\/[^/]*$/, "")
      || process.env.NEXT_PUBLIC_APP_URL
      || "https://www.santaddeo.com"
    const appUrl = requestOrigin.replace(/\/$/, "")
    const inviteUrl = `${appUrl}/auth/sign-up?invite=${newToken}&email=${encodeURIComponent(invitation.email)}`
    console.log("[Resend Invite] Generated invite URL:", inviteUrl)

    // Send email
    const roleLabels: Record<string, string> = {
      property_admin: "Amministratore di Struttura",
      sub_user: "Utente",
      consultant: "Consulente",
    }

    const inviteeName = [invitation.first_name, invitation.last_name].filter(Boolean).join(" ") || invitation.email.split("@")[0]
    const hotelName = invitation.hotel_name || "Struttura"

    const inviteHtml = getTeamInviteEmail(
      inviteeName,
      inviterName,
      hotelName,
      roleLabels[invitation.role] || invitation.role,
      inviteUrl,
    )

    const emailResult = await sendEmail({
      to: invitation.email,
      subject: `Promemoria invito a ${hotelName} - SANTADDEO`,
      html: inviteHtml,
    })

    return NextResponse.json({
      success: true,
      emailSent: emailResult.success,
      inviteUrl,
      message: emailResult.success
        ? "Invito reinviato con successo"
        : "Token aggiornato ma l'email non e' stata inviata. Condividi il link manualmente.",
    })
  } catch (error) {
    console.error("[Resend Invite] Error:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
