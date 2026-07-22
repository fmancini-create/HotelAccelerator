export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"

const ADMIN_EMAIL = "info@santaddeo.com"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: organizationId } = await params
    const supabase = await createClient()
    const serviceSupabase = await createClient()
    const body = await request.json()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's profile
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("first_name, last_name, role, organization_id")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Get organization info
    const { data: org } = await serviceSupabase
      .from("organizations")
      .select("company_name, vat_number")
      .eq("id", organizationId)
      .single()

    // Get hotel info for context
    const { data: hotels } = await serviceSupabase
      .from("hotels")
      .select("name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .limit(1)

    const hotelName = hotels?.[0]?.name || "N/A"
    const userName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || user.email || "Utente"
    const message = body.message || "Nessun dettaglio fornito"

    // Send email to super admin
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.santaddeo.com"
    const logoUrl = `${siteUrl}/logo-santaddeo.png`

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f5; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #eab308 0%, #a16207 100%); }
  .logo { max-width: 200px; height: auto; }
  .header-title { color: white; font-size: 28px; font-weight: 700; margin: 10px 0 0; }
  .header-subtitle { color: rgba(255,255,255,0.85); font-size: 14px; margin: 5px 0 0; }
  .content { background: #ffffff; padding: 40px 30px; border-radius: 0 0 8px 8px; }
  .button { display: inline-block; padding: 14px 32px; background: #eab308; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  .footer { text-align: center; padding: 20px; color: #666; font-size: 13px; }
  .highlight { background: #fefce8; padding: 15px 20px; border-left: 4px solid #eab308; margin: 20px 0; border-radius: 0 6px 6px 0; }
  .data-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  .data-table td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
  .data-table td:first-child { font-weight: 600; color: #6b7280; width: 40%; }
  h1 { color: #1f2937; font-size: 24px; margin-bottom: 20px; }
  a.button { color: white !important; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="SANTADDEO" class="logo" />
      <div class="header-title">SANTADDEO</div>
      <div class="header-subtitle">Revenue Management System</div>
    </div>
    <div class="content">
      <h1>Richiesta Modifica Dati Aziendali</h1>
      <p>Un utente ha richiesto la modifica dei dati aziendali della propria struttura.</p>
      
      <div class="highlight">
        <strong>Dettagli Richiesta</strong>
      </div>
      
      <table class="data-table">
        <tr><td>Richiedente</td><td>${userName}</td></tr>
        <tr><td>Email</td><td>${user.email}</td></tr>
        <tr><td>Ruolo</td><td>${profile.role}</td></tr>
        <tr><td>Struttura</td><td>${hotelName}</td></tr>
        <tr><td>Organizzazione</td><td>${org?.company_name || "N/A"}</td></tr>
        <tr><td>P.IVA attuale</td><td>${org?.vat_number || "Non impostata"}</td></tr>
      </table>

      <div class="highlight">
        <strong>Messaggio dell'utente:</strong><br/>
        ${message.replace(/\n/g, "<br/>")}
      </div>

      <div style="text-align: center;">
        <a href="${siteUrl}/superadmin" class="button">Vai al Pannello Admin</a>
      </div>
    </div>
    <div class="footer">
      <p>SANTADDEO - Revenue Management System</p>
      <p>Questa e una email automatica generata dal sistema.</p>
    </div>
  </div>
</body>
</html>`

    const emailResult = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[SANTADDEO] Richiesta modifica dati - ${hotelName}`,
      html: emailHtml,
    })

    return NextResponse.json({
      success: true,
      emailSent: emailResult.success,
      message: emailResult.success
        ? "Richiesta inviata con successo! Il team SANTADDEO la conttattera' al piu' presto."
        : "La richiesta e' stata registrata ma l'email non e' stata inviata. Il team verifichera' la richiesta.",
    })
  } catch (error) {
    console.error("Error in POST /api/organizations/[id]/request-change:", error)
    return NextResponse.json({ error: "Errore durante l'invio della richiesta" }, { status: 500 })
  }
}
