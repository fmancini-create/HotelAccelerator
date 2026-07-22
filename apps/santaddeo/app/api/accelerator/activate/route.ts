import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import Stripe from "stripe"

// Lazy load Stripe to avoid build errors
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  })
}

// Admin notification email for commission requests - sends to all system_admin users
async function notifyAdminCommissionRequest(
  hotelName: string, 
  userEmail: string, 
  hotelId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  // Get all system_admin emails from profiles
  const { data: admins } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "system_admin")
    .not("email", "is", null)

  if (!admins || admins.length === 0) {
    console.error("[v0] No system_admin found to notify")
    return
  }

  // Send email to each admin
  const adminEmails = admins.map(a => a.email).filter(Boolean)
  
  for (const adminEmail of adminEmails) {
    await sendEmail({
      to: adminEmail,
      subject: `[SANTADDEO] Nuova richiesta piano commissione - ${hotelName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Nuova Richiesta Piano Commissione</h2>
          <p>E' stata ricevuta una nuova richiesta di attivazione del piano a commissione:</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>Hotel:</strong> ${hotelName}</p>
            <p><strong>Email utente:</strong> ${userEmail}</p>
            <p><strong>ID Hotel:</strong> ${hotelId}</p>
          </div>
          <p>Accedi al pannello superadmin per gestire la richiesta:</p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.santaddeo.com"}/superadmin?tab=commission-requests" 
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 8px;">
            Gestisci Richieste
          </a>
        </div>
      `,
    })
  }
}

// User confirmation email for commission request
async function notifyUserCommissionRequest(userEmail: string, hotelName: string, userName?: string) {
  await sendEmail({
    to: userEmail,
    subject: `[SANTADDEO] Richiesta piano commissione ricevuta - ${hotelName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Richiesta Ricevuta</h2>
        <p>Ciao${userName ? ` ${userName}` : ""},</p>
        <p>Abbiamo ricevuto la tua richiesta di attivazione del <strong>Piano Commissione</strong> per <strong>${hotelName}</strong>.</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p>I nostri esperti Revenue Manager analizzeranno la tua struttura e ti contatteranno entro <strong>24-48 ore lavorative</strong> per definire insieme le percentuali personalizzate.</p>
        </div>
        <p>Nel frattempo, puoi continuare a utilizzare la dashboard per monitorare i dati della tua struttura.</p>
        <p>Grazie per aver scelto SANTADDEO!</p>
        <p style="color: #666; margin-top: 24px;">Il Team SANTADDEO</p>
      </div>
    `,
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      hotel_id, plan_type, algorithm_type, auto_pilot,
      pricing_config_id, fixed_fee_per_room,
      commission_rates, commission_startup_years, commission_post_startup_rate,
    } = body

    // Verifica che l'utente abbia accesso all'hotel
    // Check 1: user_property_map (main table for user-hotel access)
    const { data: propertyAccess } = await supabase
      .from("user_property_map")
      .select("*")
      .eq("hotel_id", hotel_id)
      .eq("user_id", user.id)
      .maybeSingle()

    // Check 2: User is org admin and hotel belongs to org
    const { data: orgAdmin } = await supabase
      .from("organization_users")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .in("role", ["admin", "owner"])
      .maybeSingle()

    let hasOrgAccess = false
    if (orgAdmin) {
      const { data: orgHotel } = await supabase
        .from("hotels")
        .select("id")
        .eq("id", hotel_id)
        .eq("organization_id", orgAdmin.organization_id)
        .maybeSingle()
      hasOrgAccess = !!orgHotel
    }

    // Check 3: User profile is superadmin
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_superadmin")
      .eq("id", user.id)
      .maybeSingle()

    const isSuperAdmin = profile?.is_superadmin === true

    if (!propertyAccess && !hasOrgAccess && !isSuperAdmin) {
      console.error("[v0] Forbidden: User has no access to hotel", { userId: user.id, hotelId: hotel_id })
      return NextResponse.json({ error: "Forbidden - Nessun accesso a questo hotel" }, { status: 403 })
    }

    // Get hotel info for pricing
    const { data: hotel } = await supabase
      .from("hotels")
      .select("name, total_rooms, star_rating")
      .eq("id", hotel_id)
      .single()

    // For fee plans, create Stripe checkout session first
    if (plan_type === "fixed_fee" && fixed_fee_per_room) {
      const stripe = getStripe()
      const monthlyAmount = Math.round(fixed_fee_per_room * (hotel?.total_rooms || 1) * 100) // convert to cents

      // Build base URL
      const origin = request.headers.get("origin")
      const host = request.headers.get("host")
      let baseUrl = process.env.NEXT_PUBLIC_APP_URL
      if (!baseUrl) {
        if (origin) baseUrl = origin
        else if (host) baseUrl = `https://${host}`
        else baseUrl = "https://localhost:3000"
      }
      if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`

      // Get organization_id for fiscal data
      const { data: hotelOrg } = await supabase
        .from("hotels")
        .select("organization_id")
        .eq("id", hotel_id)
        .single()

      // Create Stripe checkout session for subscription
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: `Hotel Accelerator - ${hotel?.name || "Struttura"}`,
                description: `Piano Fee Mensile - ${hotel?.total_rooms || 0} camere`,
              },
              unit_amount: monthlyAmount,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${baseUrl}/accelerator/activate/success?session_id={CHECKOUT_SESSION_ID}&hotel_id=${hotel_id}`,
        cancel_url: `${baseUrl}/accelerator/activate?canceled=true`,
        // Collect billing address and tax ID for invoicing
        billing_address_collection: "required",
        tax_id_collection: { enabled: true },
        // Custom fields for Italian e-invoicing (SDI/PEC)
        custom_fields: [
          {
            key: "sdi_code",
            label: { type: "custom", custom: "Codice SDI (7 caratteri)" },
            type: "text",
            optional: true,
          },
          {
            key: "pec",
            label: { type: "custom", custom: "PEC (se no SDI)" },
            type: "text",
            optional: true,
          },
        ],
        metadata: {
          project: "santaddeo", // Required for FIC webhook filtering
          hotel_id,
          organization_id: hotelOrg?.organization_id || "",
          plan_type,
          algorithm_type,
          auto_pilot: String(auto_pilot),
          pricing_config_id: pricing_config_id || "",
          fixed_fee_per_room: String(fixed_fee_per_room),
          product_type: "accelerator_fee",
        },
        subscription_data: {
          metadata: {
            project: "santaddeo",
            hotel_id,
            organization_id: hotelOrg?.organization_id || "",
            product_type: "accelerator_fee",
          },
        },
      })

      return NextResponse.json({ 
        success: true, 
        checkoutUrl: session.url,
        sessionId: session.id,
      })
    }

    // For commission plans, create a REQUEST (not direct activation)
    // The request needs admin approval before becoming an active subscription
    
    // Get user profile for email
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("email, first_name, full_name, organization_id")
      .eq("id", user.id)
      .single()

    // Get user email from auth if not in profile
    const userEmail = userProfile?.email || user.email || ""
    const userName = userProfile?.first_name || userProfile?.full_name?.split(" ")[0] || ""
    
    // Insert commission request
    const { data: commissionRequest, error } = await supabase
      .from("commission_plan_requests")
      .insert({
        hotel_id,
        user_id: user.id,
        organization_id: userProfile?.organization_id || null,
        algorithm_type,
        auto_pilot,
        status: "pending",
        requested_at: new Date().toISOString(),
        notes: `Richiesta automatica da form attivazione. Commission rates: ${JSON.stringify(commission_rates)}`,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating commission request:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send notification emails (async, don't wait)
    try {
      await Promise.all([
        notifyAdminCommissionRequest(hotel?.name || "Hotel", userEmail, hotel_id, supabase),
        notifyUserCommissionRequest(userEmail, hotel?.name || "Hotel", userName),
      ])

      // Update request with notification tracking
      await supabase
        .from("commission_plan_requests")
        .update({
          admin_notified: true,
          admin_notified_at: new Date().toISOString(),
          user_email_sent: true,
          user_email_sent_at: new Date().toISOString(),
        })
        .eq("id", commissionRequest.id)
    } catch (emailErr) {
      console.error("[v0] Error sending notification emails:", emailErr)
      // Don't fail the request if emails fail
    }

    return NextResponse.json({ 
      success: true, 
      requestId: commissionRequest.id,
      message: "Richiesta inviata con successo. Sarai contattato entro 24-48 ore.",
    })
  } catch (error) {
    console.error("[v0] Error in activate route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
