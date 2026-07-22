import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email-smtp"

// POST: Request password reset - sends email to hotel admin
export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const { hotel_id } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    // Get hotel info and admin email
    const adminClient = await createClient()
    
    // Get hotel details
    const { data: hotel, error: hotelError } = await adminClient
      .from("hotels")
      .select("id, name")
      .eq("id", hotel_id)
      .single()

    if (hotelError || !hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 })
    }

    // Get hotel admins: users linked to this hotel via user_property_map
    // with admin-level roles (super_admin, property_admin) in profiles
    const { data: propertyUsers, error: propError } = await adminClient
      .from("user_property_map")
      .select("user_id")
      .eq("hotel_id", hotel_id)

    if (propError) {
      console.error("[v0] Error fetching property users:", propError)
      return NextResponse.json({ error: "Error fetching admins" }, { status: 500 })
    }

    if (!propertyUsers || propertyUsers.length === 0) {
      return NextResponse.json({ error: "No users found for this hotel" }, { status: 404 })
    }

    const userIds = propertyUsers.map(pu => pu.user_id)

    // Get profiles for these users, filtering for admin roles
    const { data: adminProfiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, email, first_name, last_name, role")
      .in("id", userIds)
      .in("role", ["super_admin", "property_admin", "system_admin", "villa_admin"])
      .eq("is_active", true)

    if (profilesError) {
      console.error("[v0] Error fetching admin profiles:", profilesError)
      return NextResponse.json({ error: "Error fetching admins" }, { status: 500 })
    }

    if (!adminProfiles || adminProfiles.length === 0) {
      return NextResponse.json({ error: "No admin found for this hotel" }, { status: 404 })
    }

    const adminEmails = adminProfiles
      .map(p => p.email)
      .filter((email): email is string => !!email)

    if (adminEmails.length === 0) {
      return NextResponse.json({ error: "No admin email found" }, { status: 404 })
    }

    // Get requesting user info
    const { data: requestingProfile } = await adminClient
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single()
    const requestingEmail = requestingProfile?.email || "Utente sconosciuto"

    // Generate reset token
    const resetToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Store reset token in database
    await adminClient
      .from("settings_password_reset_tokens")
      .upsert({
        hotel_id,
        token: resetToken,
        requested_by: user.id,
        expires_at: expiresAt.toISOString(),
        used: false,
      }, { onConflict: "hotel_id" })

    // Send email to admins via SMTP (same as rest of the project)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.santaddeo.com"
    const resetUrl = `${baseUrl}/accelerator/pricing/settings/reset-password?token=${resetToken}&hotel_id=${hotel_id}`

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Richiesta Reset Password Impostazioni Pricing</h2>
        
        <p>Ciao,</p>
        
        <p>L'utente <strong>${requestingEmail}</strong> ha richiesto il reset della password di protezione delle impostazioni base dell'algoritmo di pricing per la struttura <strong>${hotel.name}</strong>.</p>
        
        <p>Se desideri reimpostare la password, clicca sul pulsante qui sotto:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Reimposta Password
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">Il link scadra tra 24 ore. Se non hai ricevuto questa richiesta, puoi ignorare questa email.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        
        <p style="color: #888; font-size: 12px;">
          Questa email e stata inviata automaticamente da SANTADDEO.<br />
          Non rispondere a questa email.
        </p>
      </div>
    `

    // Send to each admin
    let sentCount = 0
    for (const email of adminEmails) {
      const result = await sendEmail({
        to: email,
        subject: `Richiesta reset password impostazioni - ${hotel.name}`,
        html: htmlContent,
      })
      if (result.success) sentCount++
      else console.error("[v0] Error sending reset email to:", email, result.error)
    }

    console.log("[v0] Password reset email sent to:", sentCount, "of", adminEmails.length)
    return NextResponse.json({ success: true, sent_to: sentCount })

  } catch (error) {
    console.error("[v0] Server error in reset-request:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
