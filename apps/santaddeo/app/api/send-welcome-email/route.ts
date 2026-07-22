export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { sendEmail } from "@/lib/email"
import { getWelcomeEmail, getAdminNewUserNotification } from "@/lib/email-templates"

const ADMIN_EMAIL = "info@santaddeo.com"

export async function POST(request: Request) {
  try {
    const { name, email } = await request.json()

    if (!name || !email) {
      return NextResponse.json({ error: "name e email sono obbligatori" }, { status: 400 })
    }

    // Invio welcome email all'utente
    const welcomeHtml = getWelcomeEmail(name, email)
    const result = await sendEmail({
      to: email,
      subject: "Benvenuto in SANTADDEO!",
      html: welcomeHtml,
    })

    if (!result.success) {
      console.error("[send-welcome-email] Errore invio welcome:", result.error)
    }

    // Notifica admin (try-catch separato: se fallisce, non blocca)
    try {
      const adminHtml = getAdminNewUserNotification(name, email)
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `Nuova Registrazione: ${name}`,
        html: adminHtml,
      })
    } catch (adminErr) {
      console.error("[send-welcome-email] Errore notifica admin:", adminErr)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[send-welcome-email] Errore:", errMsg)
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 })
  }
}
