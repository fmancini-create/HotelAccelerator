/**
 * Test endpoint per verificare che la notifica admin di nuova
 * registrazione arrivi davvero ai superadmin attivi.
 *
 * Usage:
 *   POST /api/superadmin/test-admin-notification
 *
 * Logica:
 *  1. Auth: solo super_admin
 *  2. Carica i destinatari (profiles WHERE role='super_admin' AND is_active=true)
 *  3. Invia email di test usando lo stesso template/flow del signup reale
 *  4. Ritorna l'esito (recipients + audit_log_id)
 *
 * Visibilita': permette di testare la pipeline notify senza dover
 * creare un signup reale e senza inquinare auth.users.
 */
import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { getAdminNewUserNotification } from "@/lib/email-templates"
import { getSuperAdminEmails } from "@/lib/email/get-superadmin-recipients"

export const runtime = "nodejs"

export async function POST() {
  const { user } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const svc = await createServiceRoleClient()
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // Step 1: chi sono i destinatari?
  const recipients = await getSuperAdminEmails()
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "no_recipients", details: "Nessun super_admin attivo trovato" },
      { status: 500 },
    )
  }

  // Step 2: invia email usando lo stesso template del signup reale
  const fakeName = "Test Notifica Admin"
  const fakeEmail = "test-signup@santaddeo.com"
  const html = getAdminNewUserNotification(fakeName, fakeEmail)

  try {
    const result = await sendEmail({
      to: recipients,
      subject: `[SANTADDEO] [TEST] Notifica admin signup`,
      html,
      type: "admin_new_user",
      replyTo: fakeEmail,
      metadata: {
        source: "/api/superadmin/test-admin-notification",
        is_test: true,
        triggered_by: user.id,
      },
    })

    return NextResponse.json({
      ok: true,
      recipients,
      messageId: result?.messageId ?? null,
      info: "Email di test inviata. Controlla la casella dei superadmin entro 1-2 minuti. Se non arriva: controlla SPAM, env vars EMAIL_*, e SMTP credentials.",
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        recipients,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    )
  }
}
