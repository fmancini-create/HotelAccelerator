/**
 * Modulo unificato per l'invio email transazionali.
 *
 * Centralizza:
 *  - Validazione SMTP env vars (fail-safe in dev)
 *  - Redirect a TEST_EMAIL in development
 *  - Audit log su email_audit_log (best-effort, non blocca l'invio)
 *  - Supporto per to: string | string[] e replyTo
 *  - Brand di default "SANTADDEO" + reply-to friendly
 *
 * Sostituisce/unifica:
 *  - lib/email-smtp.ts (deprecato, ora wrapper)
 *  - lib/email/send-email.ts (deprecato, ora wrapper)
 */

// nodemailer non ha @types installati: usiamo require dinamico tipato.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const nodemailer: any = require("nodemailer")
import { createClient } from "@supabase/supabase-js"

const BRAND_NAME = "SANTADDEO"
const DEFAULT_FROM = `${BRAND_NAME} <${process.env.SMTP_USER || "noreply@santaddeo.com"}>`

/**
 * Risolve il mittente in modo robusto. `SMTP_FROM` a volte è configurato per
 * errore con un HOSTNAME (es. "smtp.gmail.com") invece di un indirizzo email:
 * in quel caso va scartato, altrimenti finisce nell'header From e degrada la
 * deliverability (SPF/DKIM). Accettiamo SMTP_FROM solo se contiene una email
 * plausibile ("@" + dominio), sia in forma nuda sia "Nome <email@dominio>".
 */
function resolveFromAddress(explicitFrom?: string): string {
  const looksLikeEmail = (v: string): boolean => {
    const m = v.match(/<([^>]+)>/) // estrae l'indirizzo da "Nome <addr>"
    const addr = (m ? m[1] : v).trim()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)
  }
  if (explicitFrom && looksLikeEmail(explicitFrom)) return explicitFrom
  const envFrom = process.env.SMTP_FROM
  if (envFrom && looksLikeEmail(envFrom)) return envFrom
  if (envFrom) {
    console.warn(`[email] SMTP_FROM ignorato perché non è un indirizzo email valido: "${envFrom}". Uso il default.`)
  }
  return DEFAULT_FROM
}

// ────────────────────────────────────────────────────────────────────────────
// Audit log helper. Best-effort: se Supabase non è disponibile o la tabella
// non esiste, non rompere l'invio email. Il log usa il service-role per
// bypassare la RLS (inserimento sempre permesso lato applicazione).
// ────────────────────────────────────────────────────────────────────────────
async function logEmailEvent(args: {
  emailType: string
  recipients: string[]
  subject?: string
  status: "sent" | "error" | "skipped"
  provider?: string
  messageId?: string
  errorMessage?: string
  hotelId?: string
  userId?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) return

    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    await supabase.from("email_audit_log").insert({
      email_type: args.emailType,
      recipients: args.recipients,
      subject: args.subject ?? null,
      status: args.status,
      provider: args.provider ?? "smtp",
      message_id: args.messageId ?? null,
      error_message: args.errorMessage ?? null,
      hotel_id: args.hotelId ?? null,
      user_id: args.userId ?? null,
      metadata: args.metadata ?? {},
    })
  } catch (e) {
    // Non rompere mai l'invio email a causa del logging
    console.warn("[email-audit] Failed to log email event:", e instanceof Error ? e.message : e)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface SendEmailArgs {
  to: string | string[]
  subject: string
  html: string
  /** Mittente custom. Default: SMTP_FROM env var o "SANTADDEO <noreply@...>". */
  from?: string
  /** CC visibili in chiaro nel header dell'email (l'utente li vede). */
  cc?: string | string[]
  /** BCC nascosti: copia inviata senza che il destinatario principale lo veda.
   *  Usato tipicamente per inviare copia a support@santaddeo.com per audit. */
  bcc?: string | string[]
  /** Reply-To header (es. supporto@). */
  replyTo?: string
  /** Header SMTP custom (es. List-Unsubscribe per email di notifica). */
  headers?: Record<string, string>
  /** Allegati email. `path`/`href` possono essere URL http(s): nodemailer li
   *  scarica e li allega. In alternativa `content` (Buffer/string) + filename. */
  attachments?: Array<{
    filename: string
    path?: string
    href?: string
    content?: Buffer | string
    contentType?: string
  }>
  /** Categoria per audit log (es. "signup_verify", "team_invite"). */
  type?: string
  /** Hotel id collegato (per filtri audit). */
  hotelId?: string
  /** User id collegato (per filtri audit). */
  userId?: string
  /** Metadata libera salvata in audit log. */
  metadata?: Record<string, unknown>
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const { to, subject, html, from, cc, bcc, replyTo, headers, attachments, type, hotelId, userId, metadata } =
    args

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean)
  const emailType = type || "uncategorized"

  if (recipients.length === 0) {
    const err = "No recipients provided"
    await logEmailEvent({ emailType, recipients: [], subject, status: "error", errorMessage: err, hotelId, userId, metadata })
    return { success: false, error: err }
  }

  const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS

  // SMTP non configurato: simula in dev, errore in prod
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !smtpPass) {
    const isDev = process.env.NODE_ENV === "development"
    if (isDev) {
      console.log("[email] SMTP non configurato (dev), simulazione invio a:", recipients)
      await logEmailEvent({
        emailType,
        recipients,
        subject,
        status: "skipped",
        errorMessage: "SMTP not configured (dev simulation)",
        hotelId,
        userId,
        metadata: { ...metadata, simulated: true },
      })
      return { success: true, messageId: `simulated-${Date.now()}@local` }
    }
    const err = "SMTP not configured"
    console.error(`[email] ${err}`)
    await logEmailEvent({ emailType, recipients, subject, status: "error", errorMessage: err, hotelId, userId, metadata })
    return { success: false, error: err }
  }

  // In development: redirige TUTTE le email a TEST_EMAIL per evitare invii
  // accidentali a utenti reali durante lo sviluppo. In dev SCARTA anche cc/bcc
  // per evitare invii laterali a indirizzi reali (es. support@) durante test.
  let finalRecipients = recipients
  const ccList = cc ? (Array.isArray(cc) ? cc.filter(Boolean) : [cc].filter(Boolean)) : []
  const bccList = bcc ? (Array.isArray(bcc) ? bcc.filter(Boolean) : [bcc].filter(Boolean)) : []
  let finalCc = ccList
  let finalBcc = bccList
  if (process.env.NODE_ENV === "development" && process.env.TEST_EMAIL) {
    console.log(
      `[email] DEV MODE: redirect da [${recipients.join(", ")}] a ${process.env.TEST_EMAIL}` +
        (ccList.length ? `, cc scartate: [${ccList.join(", ")}]` : "") +
        (bccList.length ? `, bcc scartate: [${bccList.join(", ")}]` : ""),
    )
    finalRecipients = [process.env.TEST_EMAIL]
    finalCc = []
    finalBcc = []
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "465"),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      // Timeout espliciti: senza questi, se il server SMTP non risponde
      // nodemailer resta appeso finche' Vercel uccide la function (504) e il
      // catch NON scatta -> l'invio "sparisce" senza traccia in audit. Con i
      // timeout un blocco fallisce in fretta e viene loggato come "error".
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    })

    const info = await transporter.sendMail({
      from: resolveFromAddress(from),
      to: finalRecipients.join(", "),
      ...(finalCc.length > 0 ? { cc: finalCc.join(", ") } : {}),
      ...(finalBcc.length > 0 ? { bcc: finalBcc.join(", ") } : {}),
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    })

    console.log(
      `[email] Sent (${emailType}):`,
      info.messageId,
      "→",
      finalRecipients.join(", "),
      finalCc.length ? `cc: ${finalCc.join(", ")}` : "",
      finalBcc.length ? `bcc: ${finalBcc.join(", ")}` : "",
    )

    await logEmailEvent({
      emailType,
      recipients: finalRecipients,
      subject,
      status: "sent",
      messageId: info.messageId,
      hotelId,
      userId,
      metadata: {
        ...metadata,
        original_recipients: recipients !== finalRecipients ? recipients : undefined,
        cc: finalCc.length > 0 ? finalCc : undefined,
        bcc: finalBcc.length > 0 ? finalBcc : undefined,
      },
    })

    return { success: true, messageId: info.messageId }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[email] Send failed (${emailType}):`, errMsg)

    await logEmailEvent({
      emailType,
      recipients: finalRecipients,
      subject,
      status: "error",
      errorMessage: errMsg,
      hotelId,
      userId,
      metadata,
    })

    return { success: false, error: errMsg }
  }
}
