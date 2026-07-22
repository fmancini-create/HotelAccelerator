/**
 * Resend verification email.
 * Chiamato da components/auth/verify-email-content.tsx quando l'utente clicca
 * "Reinvia email di conferma".
 *
 * Logica:
 *  1. Validazione email format.
 *  2. Rate limit per IP+email (3 richieste / 10 min) per evitare abuse.
 *  3. Genera un nuovo magic link signup via Supabase Admin API.
 *  4. Invia via SMTP usando lib/email.ts (con audit log).
 *  5. Anti-enumeration: se l'email non esiste / e' gia' verificata,
 *     ritorniamo success generico senza inviare nulla.
 */

import { type NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { sendEmail } from "@/lib/email"
import { getVerifyEmailTemplate } from "@/lib/email-templates"

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

export async function POST(request: NextRequest) {
  try {
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Payload non valido" }, { status: 400 })
    }

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Email non valida" }, { status: 400 })
    }

    // Rate limit per IP+email (max 3 richieste / 10 min)
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit({
      scope: "resend_verify",
      identifier: `${clientIp}:${email}`,
      max: 3,
      windowSeconds: 600,
    })
    if (!rl.success) {
      const minutes = Math.ceil((rl.resetAt - Date.now()) / 60000)
      return NextResponse.json(
        { error: `Troppi tentativi. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.` },
        { status: 429 },
      )
    }

    const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      console.error("[resend-verify] Service role key not configured")
      return NextResponse.json({ error: "Configurazione server incompleta" }, { status: 500 })
    }
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SANTADDEO_SUPABASE_URL ||
      PROD_URL

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
    const redirectTo = appUrl ? `${appUrl}/auth/callback?next=/onboarding` : `/auth/callback?next=/onboarding`

    const mlResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ email, type: "signup", redirect_to: redirectTo }),
    })

    const mlData = await mlResponse.json()

    // Anti-enumeration: se l'email non esiste / e' gia' verificata,
    // ritorniamo success generico SENZA inviare email.
    const hashedToken: string | undefined =
      mlData?.hashed_token || mlData?.properties?.hashed_token
    if (!mlResponse.ok || !hashedToken) {
      const errMsg = mlData?.msg || mlData?.error_description || ""
      console.warn("[resend-verify] Magic link generation failed for", email, ":", errMsg)
      return NextResponse.json({ success: true, message: "Email di verifica inviata se l'account esiste." })
    }

    // FIX 12/05/2026: niente piu' rewrite dell'host di action_link (che
    // portava a santaddeo.com/auth/v1/verify → 404). Usiamo hashed_token +
    // /auth/confirm server-side. Stesso pattern di forgot-password e signup.
    const cleanAppUrl = (appUrl || "https://www.santaddeo.com").replace(/\/$/, "")
    const verifyParams = new URLSearchParams({
      token_hash: hashedToken,
      type: "signup",
      next: "/onboarding",
    })
    const verifyLink = `${cleanAppUrl}/auth/confirm?${verifyParams.toString()}`

    const userName = email.split("@")[0]
    const html = getVerifyEmailTemplate(userName, verifyLink)
    const result = await sendEmail({
      to: email,
      subject: "Verifica il tuo account SANTADDEO",
      html,
      type: "signup_verify_resend",
      metadata: { ip: clientIp },
    })

    if (!result.success) {
      console.error("[resend-verify] Send failed:", result.error)
      return NextResponse.json(
        { error: "Non siamo riusciti a inviare l'email. Riprova tra qualche minuto." },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true, message: "Email di verifica inviata", messageId: result.messageId })
  } catch (e) {
    console.error("[resend-verify] Unhandled error:", e)
    return NextResponse.json({ error: "Errore durante l'invio dell'email" }, { status: 500 })
  }
}
