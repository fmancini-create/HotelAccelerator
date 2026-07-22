import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { sendEmail } from "@/lib/email"
import { getTeamInviteEmail, getSuperAdminInviteNotification } from "@/lib/email-templates"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const supabaseAdmin = await createServiceRoleClient()
    const body = await request.json()
    const { hotel_id, email, role, first_name, last_name } = body

    if (!hotel_id || !email || !role) {
      return NextResponse.json(
        { error: "hotel_id, email e role sono obbligatori" },
        { status: 400 },
      )
    }

    // Validate role
    const allowedRoles = ["property_admin", "sub_user", "consultant"]
    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: `Ruolo non valido. Ruoli ammessi: ${allowedRoles.join(", ")}` },
        { status: 400 },
      )
    }

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Get user profile with service role to check permissions
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id, first_name, last_name")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profilo non trovato" }, { status: 404 })
    }

    // Only property_admin and super_admin can invite
    if (profile.role !== "property_admin" && profile.role !== "super_admin") {
      return NextResponse.json(
        { error: "Solo gli amministratori possono invitare nuovi membri" },
        { status: 403 },
      )
    }

    // Get hotel info
    const { data: hotel } = await supabaseAdmin
      .from("hotels")
      .select("id, name, organization_id")
      .eq("id", hotel_id)
      .single()

    if (!hotel) {
      return NextResponse.json({ error: "Hotel non trovato" }, { status: 404 })
    }

    // For property_admin, verify they belong to same organization
    if (profile.role === "property_admin" && profile.organization_id !== hotel.organization_id) {
      return NextResponse.json(
        { error: "Non hai permesso di invitare per questa struttura" },
        { status: 403 },
      )
    }

    // Check if email is already a member of this organization
    if (hotel.organization_id) {
      const { data: existingMember } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .eq("organization_id", hotel.organization_id)
        .eq("email", email.toLowerCase().trim())
        .maybeSingle()

      if (existingMember) {
        return NextResponse.json(
          { error: "Questo utente e' gia' membro dell'organizzazione" },
          { status: 409 },
        )
      }
    }

    // Generate token and expiration
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const inviterName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || user.email || "Admin"

    // Check if there's already an invitation for this email/hotel (any status)
    const { data: existingInvite } = await supabaseAdmin
      .from("user_invitations")
      .select("id, accepted_at, expires_at")
      .eq("hotel_id", hotel_id)
      .eq("email", email.toLowerCase().trim())
      .maybeSingle()

    let invitation: any = null
    let invitationError: any = null

    if (existingInvite) {
      // Update existing invitation (accepted, expired, or still pending) with new token/expiry
      const { data, error } = await supabaseAdmin
        .from("user_invitations")
        .update({
          role,
          token,
          invited_by: user.id,
          invited_by_name: inviterName,
          hotel_name: hotel.name,
          first_name: first_name || null,
          last_name: last_name || null,
          expires_at: expiresAt.toISOString(),
          accepted_at: null,
        })
        .eq("id", existingInvite.id)
        .select()
        .single()

      invitation = data
      invitationError = error
    } else {
      // Create new invitation record
      const { data, error } = await supabaseAdmin
        .from("user_invitations")
        .insert({
          hotel_id,
          organization_id: hotel.organization_id,
          email: email.toLowerCase().trim(),
          role,
          token,
          invited_by: user.id,
          invited_by_name: inviterName,
          hotel_name: hotel.name,
          first_name: first_name || null,
          last_name: last_name || null,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      invitation = data
      invitationError = error
    }

    if (invitationError) {
      console.error("[Invite] Error creating/updating invitation:", invitationError)
      return NextResponse.json(
        { error: `Errore nella creazione dell'invito: ${invitationError.message}` },
        { status: 500 },
      )
    }

    // Build invite URL using request origin for correct domain (handles preview deploys)
    const requestOrigin = request.headers.get("origin")
      || request.headers.get("referer")?.replace(/\/[^/]*$/, "")
      || process.env.NEXT_PUBLIC_APP_URL
      || "https://www.santaddeo.com"
    // Ensure no trailing slash
    const appUrl = requestOrigin.replace(/\/$/, "")
    const inviteUrl = `${appUrl}/auth/sign-up?invite=${token}&email=${encodeURIComponent(email)}`
    console.log("[Invite] Generated invite URL:", inviteUrl)

    // Send invitation email
    const roleLabels: Record<string, string> = {
      property_admin: "Amministratore di Struttura",
      sub_user: "Utente",
      consultant: "Consulente",
    }

    const inviteeName = [first_name, last_name].filter(Boolean).join(" ") || email.split("@")[0]

    const inviteHtml = getTeamInviteEmail(
      inviteeName,
      inviterName,
      hotel.name || "Struttura",
      roleLabels[role] || role,
      inviteUrl,
    )
    const emailResult = await sendEmail({
      to: email,
      subject: `Invito a ${hotel.name || "Struttura"} - SANTADDEO`,
      html: inviteHtml,
    })

    // Notify all superadmins about the new invitation
    try {
      const { data: superAdmins } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .in("role", ["super_admin", "superadmin"])

      if (superAdmins && superAdmins.length > 0) {
        const roleLabelsNotif: Record<string, string> = {
          property_admin: "Amministratore di Struttura",
          sub_user: "Utente",
          consultant: "Consulente",
        }
        const notifHtml = getSuperAdminInviteNotification({
          inviteeName: [first_name, last_name].filter(Boolean).join(" ") || email.split("@")[0],
          inviteeEmail: email,
          inviterName,
          hotelName: hotel.name || "Struttura",
          role: roleLabelsNotif[role] || role,
        })

        for (const sa of superAdmins) {
          if (sa.email) {
            await sendEmail({
              to: sa.email,
              subject: `[SANTADDEO] Nuovo invito utente: ${email} → ${hotel.name || "Struttura"}`,
              html: notifHtml,
            }).catch((err) => console.warn("[Invite] Failed to notify superadmin:", sa.email, err))
          }
        }
      }
    } catch (notifErr) {
      console.warn("[Invite] Error notifying superadmins:", notifErr)
    }

    return NextResponse.json({
      invitation,
      emailSent: emailResult.success,
      inviteUrl,
      message: emailResult.success
        ? "Invito creato e email inviata con successo"
        : "Invito creato ma l'email non e' stata inviata. Condividi il link manualmente.",
    })
  } catch (error) {
    console.error("[Invite] Error:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
