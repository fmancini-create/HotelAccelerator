/**
 * Public endpoint per le richieste informazioni dalle landing pages.
 *
 * Flow (refactor 30/04/2026):
 *   1. Rate limiting in-memory per IP (3 req / min).
 *   2. Anti-bot: timestamp form (< 3s = bot), spam name/email/phone heuristics.
 *   3. Validazione campi obbligatori.
 *   4. Insert su `info_requests` (DB persistence).
 *   5. Email di NOTIFICA a tutti i superadmin attivi (helper riusabile,
 *      no piu' info@4bid.it hardcoded). Audit log su email_audit_log.
 *   6. Email di CONFERMA all'utente che ha inviato la richiesta.
 *   7. Tutti gli invii via lib/email.ts (audit log, dev redirect).
 *
 * Le email sono best-effort: errori SMTP non rompono la response.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { getSuperAdminEmails } from "@/lib/email/get-superadmin-recipients"
import {
  getAdminContactRequestNotification,
  getInfoRequestUserConfirmation,
} from "@/lib/email-templates"

// Simple in-memory rate limiter (resets on server restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 3 // max 3 requests per minute per IP

// Disposable email domains commonly used by spammers
const DISPOSABLE_DOMAINS = [
  "korper.nl", "mailinator.com", "tempmail.com", "guerrillamail.com",
  "throwaway.email", "10minutemail.com", "temp-mail.org", "fakeinbox.com",
  "yopmail.com", "trashmail.com", "sharklasers.com", "spam4.me",
]

// Check if name looks like random spam string
function isSpamName(name: string): boolean {
  // Random strings like "yxpgrEJDA7", "ZZqPG70kPD" have high consonant ratio and mixed case/numbers
  const cleaned = name.replace(/\s/g, "")
  if (cleaned.length < 3) return true

  // Check for random alphanumeric patterns
  const hasNumbers = /\d/.test(cleaned)
  const hasUpperLower = /[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned)
  const consonantRatio =
    (cleaned.match(/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/g) || []).length / cleaned.length

  // If name has numbers mixed with letters and high consonant ratio, likely spam
  if (hasNumbers && hasUpperLower && consonantRatio > 0.7) return true

  // Check for very short names with numbers
  if (cleaned.length < 6 && hasNumbers) return true

  return false
}

function isSpamEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase()
  if (!domain) return true

  // Check disposable domains
  if (DISPOSABLE_DOMAINS.includes(domain)) return true

  // Check for random-looking email prefixes
  const prefix = email.split("@")[0]
  if (prefix.length > 15 && /^[a-z0-9]+$/i.test(prefix)) {
    // Long alphanumeric-only prefix is suspicious
    const hasNumbers = /\d/.test(prefix)
    const hasLetters = /[a-zA-Z]/.test(prefix)
    if (hasNumbers && hasLetters && prefix.length > 20) return true
  }

  return false
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }

  entry.count++
  return true
}

export async function POST(request: Request) {
  try {
    // Get client IP for rate limiting
    const forwarded = request.headers.get("x-forwarded-for")
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown"

    // Rate limit check
    if (!checkRateLimit(ip)) {
      console.log("[request-info] Rate limit exceeded for IP:", ip)
      return NextResponse.json({ error: "Troppe richieste. Riprova tra un minuto." }, { status: 429 })
    }

    const data = await request.json()
    console.log("[request-info] Request data:", { ...data, message: data.message ? "..." : null })

    const { name, email, phone, hotel_name, message, _formLoadTime } = data

    // Validate required fields
    if (!name || !email || !phone || !hotel_name) {
      console.log("[request-info] Validation failed - missing fields")
      return NextResponse.json({ error: "Campi obbligatori mancanti" }, { status: 400 })
    }

    // Anti-bot: Check if form was filled too quickly (< 3 seconds = bot)
    if (_formLoadTime) {
      const fillTime = Date.now() - _formLoadTime
      if (fillTime < 3000) {
        console.log("[request-info] Bot detected - form filled too quickly:", fillTime, "ms")
        // Return fake success to not alert the bot
        return NextResponse.json({ success: true })
      }
    }

    // Spam name check
    if (isSpamName(name)) {
      console.log("[request-info] Spam name detected:", name)
      return NextResponse.json({ success: true }) // Fake success
    }

    // Spam email check
    if (isSpamEmail(email)) {
      console.log("[request-info] Spam email detected:", email)
      return NextResponse.json({ success: true }) // Fake success
    }

    // Check for suspicious phone patterns (too many digits, international spam numbers)
    const cleanPhone = phone.replace(/[\s\-()\.]/g, "")
    if (cleanPhone.length > 15 || (cleanPhone.startsWith("+1") && cleanPhone.length > 12)) {
      // Suspicious long phone or spam +1 numbers
      console.log("[request-info] Suspicious phone detected:", phone)
      return NextResponse.json({ success: true }) // Fake success
    }

    const supabase = await createClient()

    // Save to database
    const { data: insertedData, error: dbError } = await supabase
      .from("info_requests")
      .insert({
        name,
        email,
        phone,
        hotel_name,
        message: message || null,
      })
      .select()

    if (dbError) {
      console.error("[request-info] Database error:", dbError)
      return NextResponse.json(
        { error: "Errore nel salvataggio dei dati: " + dbError.message },
        { status: 500 },
      )
    }

    console.log("[request-info] Data inserted successfully:", insertedData)

    // ────────────────────────────────────────────────────────────────────
    // Email 1/2 — Notifica ai SUPERADMIN.
    // Best-effort: errori SMTP non rompono la response (i dati sono salvati).
    // ────────────────────────────────────────────────────────────────────
    try {
      const recipients = await getSuperAdminEmails()
      if (recipients.length > 0) {
        const adminHtml = getAdminContactRequestNotification({
          fullName: name,
          email,
          phone,
          company: hotel_name,
          message: message || "(nessun messaggio)",
          plan: "info",
        })
        await sendEmail({
          to: recipients,
          subject: `[SANTADDEO] Nuova richiesta info da ${name} (${hotel_name})`,
          html: adminHtml,
          type: "info_request_admin_notification",
          replyTo: email,
          metadata: {
            source: "/api/request-info",
            hotel_name,
            recipients_count: recipients.length,
          },
        })
      } else {
        console.warn("[request-info] No admin recipients available")
      }
    } catch (emailError) {
      console.error("[request-info] Admin email error:", emailError)
      // Don't fail the request — data is already saved
    }

    // ────────────────────────────────────────────────────────────────────
    // Email 2/2 — Conferma all'UTENTE.
    // Importante per l'esperienza: dimostra che la richiesta e' arrivata
    // e setta aspettative sul timing della risposta.
    // ────────────────────────────────────────────────────────────────────
    try {
      const userHtml = getInfoRequestUserConfirmation({
        fullName: name,
        hotelName: hotel_name,
      })
      await sendEmail({
        to: email,
        subject: "Abbiamo ricevuto la tua richiesta - SANTADDEO",
        html: userHtml,
        type: "info_request_user_confirmation",
        metadata: {
          source: "/api/request-info",
          hotel_name,
        },
      })
    } catch (emailError) {
      console.error("[request-info] User confirmation email error:", emailError)
      // Don't fail the request — data is already saved
    }

    return NextResponse.json({ success: true, data: insertedData })
  } catch (error) {
    console.error("[request-info] Request error:", error)
    return NextResponse.json(
      {
        error:
          "Errore nel processare la richiesta: " +
          (error instanceof Error ? error.message : "Unknown error"),
      },
      { status: 500 },
    )
  }
}
