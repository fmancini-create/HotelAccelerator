/**
 * Reset password endpoint.
 *
 * L'utente arriva qui DOPO aver cliccato il magic link "recovery" inviato da
 * /api/auth/forgot-password. A quel punto ha gia' una sessione recovery
 * attiva (cookie Supabase). Questo endpoint:
 *  - Valida la nuova password con le STESSE regole del signup (8+ chars
 *    + lettera + numero) per coerenza.
 *  - Chiama supabase.auth.updateUser({password}) usando la sessione
 *    recovery attiva nel cookie SSR.
 *  - Rate limit per IP per evitare brute-force.
 *  - Logga su email_audit_log con type="password_changed" (best-effort).
 */

import { type NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { createClient } from "@/lib/supabase/server"

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

const PWD_MIN = 8
const PWD_MAX = 128

function validatePassword(pw: unknown): { ok: true; password: string } | { ok: false; error: string } {
  if (typeof pw !== "string") return { ok: false, error: "Password richiesta" }
  if (pw.length < PWD_MIN) return { ok: false, error: `La password deve essere di almeno ${PWD_MIN} caratteri` }
  if (pw.length > PWD_MAX) return { ok: false, error: "Password troppo lunga" }
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) {
    return { ok: false, error: "La password deve contenere almeno una lettera e un numero" }
  }
  return { ok: true, password: pw }
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request)

    // Rate limit IP
    const rl = await checkRateLimit({
      scope: "reset_password_ip",
      identifier: clientIp,
      max: 10,
      windowSeconds: 600,
    })
    if (!rl.success) {
      const minutes = Math.ceil((rl.resetAt - Date.now()) / 60000)
      return NextResponse.json(
        { error: `Troppi tentativi. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.` },
        { status: 429 },
      )
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Payload non valido" }, { status: 400 })
    }

    const v = validatePassword(body?.password)
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 })
    }

    // SSR client legge i cookie della sessione recovery
    const supabase = await createClient()

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      console.warn(
        "[reset-password] No active session, cannot update password:",
        userError?.message || "no user",
      )
      return NextResponse.json(
        {
          error:
            "Sessione non valida o scaduta. Richiedi un nuovo link di recupero password.",
          code: "no_session",
        },
        { status: 401 },
      )
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: v.password })
    if (updateError) {
      console.error("[reset-password] updateUser failed:", updateError.message)
      // Errore tipico: "New password should be different from the old password"
      // Lo passiamo all'utente in chiaro perche' non rivela enumerazione (deve gia'
      // essere autenticato come recovery per arrivare qui).
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    // Audit log best-effort (non blocca la response)
    try {
      const { createServiceRoleClient } = await import("@/lib/supabase/server")
      const adminClient = await createServiceRoleClient()
      await adminClient.from("email_audit_log").insert({
        email_type: "password_changed",
        recipients: [userData.user.email],
        subject: "Password aggiornata",
        status: "skipped", // non e' una mail effettiva, solo audit dell'azione
        provider: "internal",
        user_id: userData.user.id,
        metadata: { ip: clientIp, source: "/api/auth/reset-password" },
      })
    } catch (auditErr) {
      console.warn("[reset-password] Audit log skip:", auditErr instanceof Error ? auditErr.message : String(auditErr))
    }

    console.log("[reset-password] Password updated for", userData.user.email)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[reset-password] Unhandled error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore interno" },
      { status: 500 },
    )
  }
}
