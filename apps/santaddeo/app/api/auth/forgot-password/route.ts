/**
 * Forgot password endpoint.
 *
 * Genera un magic link Supabase di tipo "recovery" e invia un'email custom
 * via il nostro sistema (lib/email.ts) con DKIM/SPF/DMARC validati su
 * santaddeo.com, NON via il default Supabase email che finisce in spam.
 *
 * Anti-abuse:
 *  - Rate limit per IP (3/10min) + per email (3/10min) → previene
 *    enumeration brute-force.
 *  - Honeypot field + timestamp (allineato al signup).
 *  - Anti-enumeration: ritorna SEMPRE 200 success, sia che l'email
 *    esista o no, per non rivelare l'esistenza dell'account.
 *  - Audit log su email_audit_log via lib/email.ts.
 */

import { type NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { sendEmail } from "@/lib/email"
import { getPasswordResetEmail } from "@/lib/email-templates"

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

// Risposta canonica anti-enumeration: stesso payload sia che l'email esista
// che non esista. Mai rivelare al client se l'utente e' registrato.
const CANONICAL_OK = {
  success: true,
  message: "Se l'email e' registrata, riceverai a breve un link per reimpostare la password.",
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request)

    // ============================================================
    // 1. Rate limit per IP (Upstash + fallback memoria)
    // ============================================================
    const rlIp = await checkRateLimit({
      scope: "forgot_password_ip",
      identifier: clientIp,
      max: 5,
      windowSeconds: 600, // 10 min
    })
    if (!rlIp.success) {
      const minutes = Math.ceil((rlIp.resetAt - Date.now()) / 60000)
      console.warn("[forgot-password] Rate limited IP:", clientIp)
      return NextResponse.json(
        { error: `Troppi tentativi. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.` },
        { status: 429 },
      )
    }

    // ============================================================
    // 2. Parse + honeypot + email validation
    // ============================================================
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Payload non valido" }, { status: 400 })
    }

    // Honeypot field
    if (body?._hp_field && String(body._hp_field).trim() !== "") {
      console.warn("[forgot-password] Honeypot triggered (field) IP:", clientIp)
      return NextResponse.json(CANONICAL_OK) // finta success anti-detection
    }

    // Honeypot timestamp
    if (body?._hp_ts) {
      const ts = typeof body._hp_ts === "string" ? parseInt(body._hp_ts, 10) : body._hp_ts
      if (Number.isFinite(ts)) {
        const elapsed = Date.now() - (ts as number)
        if (elapsed < 1500) {
          console.warn("[forgot-password] Honeypot triggered (timing) IP:", clientIp)
          return NextResponse.json(CANONICAL_OK)
        }
      }
    }

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!email || !EMAIL_RE.test(email) || email.length > 254) {
      // Risposta generica per non rivelare format di validazione interno
      return NextResponse.json({ error: "Email non valida" }, { status: 400 })
    }

    // ============================================================
    // 3. Rate limit per email (anti enumeration brute force)
    // ============================================================
    const rlEmail = await checkRateLimit({
      scope: "forgot_password_email",
      identifier: email,
      max: 3,
      windowSeconds: 600,
    })
    if (!rlEmail.success) {
      // Risposta generica anti-enumeration anche su rate limit
      console.warn("[forgot-password] Rate limited email:", email)
      return NextResponse.json(CANONICAL_OK)
    }

    // ============================================================
    // 4. Genera magic link recovery via Supabase Admin API
    // ============================================================
    const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      console.error("[forgot-password] SUPABASE_SERVICE_ROLE_KEY missing")
      // Non rivelare l'errore al client; ritorna canonical
      return NextResponse.json(CANONICAL_OK)
    }
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SANTADDEO_SUPABASE_URL ||
      PROD_URL

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
    const redirectTo = appUrl ? `${appUrl}/auth/reset-password` : `/auth/reset-password`

    const mlResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ email, type: "recovery", redirect_to: redirectTo }),
    })

    const mlData = await mlResponse.json()

    // Casi possibili:
    //  - 200 con action_link → utente esiste, manda email
    //  - 422/400 con error_code "user_not_found" → utente non esiste, NON inviare niente
    //  - errore di rete → log + canonical response
    if (!mlResponse.ok) {
      const errorCode = mlData?.error_code || mlData?.code
      if (errorCode === "user_not_found" || mlData?.msg?.includes?.("not found")) {
        // Utente inesistente: niente email, ritorno canonical (anti enumeration)
        console.log("[forgot-password] Email not registered (silent):", email)
        return NextResponse.json(CANONICAL_OK)
      }
      console.error(
        "[forgot-password] generate_link failed:",
        JSON.stringify(mlData).substring(0, 200),
      )
      return NextResponse.json(CANONICAL_OK)
    }

    // ============================================================
    // 5. Costruzione link: usiamo `hashed_token` (Supabase token PKCE
    //    del verifyOtp), NON `action_link`. action_link punta al
    //    Supabase project URL `/auth/v1/verify` (es. xxx.supabase.co)
    //    e in passato veniva "rewritten" con il nostro host santaddeo.com,
    //    risultato: 404 perche' /auth/v1/verify e' un endpoint Supabase
    //    che noi non ospitiamo. Vedi /app/auth/confirm/route.ts per il
    //    nostro handler server-side che fa verifyOtp + setta cookie
    //    httpOnly e redirige al next.
    // ============================================================
    const hashedToken = mlData?.hashed_token || mlData?.properties?.hashed_token
    if (!hashedToken) {
      console.warn(
        "[forgot-password] Missing hashed_token in response; raw:",
        JSON.stringify(mlData).substring(0, 200),
      )
      return NextResponse.json(CANONICAL_OK)
    }

    const cleanAppUrl = (appUrl || PROD_URL).replace(/\/$/, "")
    const resetParams = new URLSearchParams({
      token_hash: hashedToken,
      type: "recovery",
      next: "/auth/reset-password",
    })
    const resetLink = `${cleanAppUrl}/auth/confirm?${resetParams.toString()}`

    // ============================================================
    // 6. Invia email custom via nostro SMTP (DKIM-firmato)
    //    Tentiamo di estrarre il nome dall'utente Supabase tramite
    //    listUsers (best effort) per personalizzare il saluto.
    // ============================================================
    let userName = email.split("@")[0]
    try {
      const userId = mlData?.user?.id
      const meta = mlData?.user?.user_metadata
      const firstName =
        meta?.first_name || meta?.firstName || meta?.name || meta?.full_name?.split?.(" ")?.[0]
      if (firstName && typeof firstName === "string" && firstName.trim()) {
        userName = firstName.trim()
      }
      void userId // riservato per audit, gia' loggato sotto
    } catch {
      // Fallback su username dell'email
    }

    const html = getPasswordResetEmail(userName, resetLink)
    const result = await sendEmail({
      to: email,
      subject: "Reimposta la tua password SANTADDEO",
      html,
      type: "password_reset",
      userId: mlData?.user?.id,
      metadata: { reset_link_present: true, ip: clientIp },
    })

    if (!result.success) {
      console.error("[forgot-password] Email send failed:", result.error)
    } else {
      console.log("[forgot-password] Reset email sent, messageId:", result.messageId)
    }

    // ============================================================
    // 7. Risposta canonica (sempre 200, anti enumeration)
    // ============================================================
    return NextResponse.json(CANONICAL_OK)
  } catch (error) {
    console.error("[forgot-password] Unhandled error:", error)
    // Mai esporre errori interni al client
    return NextResponse.json(CANONICAL_OK)
  }
}
