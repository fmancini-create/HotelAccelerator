import { sendEmail as coreSendEmail } from "@/lib/email"
import {
  getTeamInviteEmail,
  getAlertNotificationEmail,
  getSystemAlertEmail,
} from "@/lib/email-templates"
import { createServiceRoleClient } from "@/lib/supabase/server"

export interface EmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
}

export interface AlertEmailParams {
  hotelName: string
  alertName: string
  severity: "green" | "orange" | "red"
  metric: string
  currentValue: number
  threshold: number
  message: string
  dashboardUrl: string
}

export interface InviteEmailParams {
  inviteeName: string
  inviterName: string
  hotelName: string
  role: string
  inviteUrl: string
}

/**
 * EmailService - wrapper attorno a lib/email.ts (Layer 1)
 * Mantenuto per retrocompatibilita con il codice esistente.
 */
export class EmailService {
  private static instance: EmailService

  private constructor() {}

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService()
    }
    return EmailService.instance
  }

  async send(params: EmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Se to e' un array, invia sequenzialmente (regola: no Promise.all per SMTP)
    const recipients = Array.isArray(params.to) ? params.to : [params.to]

    let lastResult: { success: boolean; messageId?: string; error?: string } = { success: false }

    for (const recipient of recipients) {
      try {
        lastResult = await coreSendEmail({
          to: recipient,
          subject: params.subject,
          html: params.html,
          from: params.from,
          replyTo: params.replyTo,
          headers: params.headers,
        })
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error("[EmailService] Errore invio a", recipient, ":", errMsg)
        lastResult = { success: false, error: errMsg }
      }
    }

    return lastResult
  }

  async sendAlertNotification(to: string, params: AlertEmailParams): Promise<{ success: boolean }> {
    const html = getAlertNotificationEmail(params)
    return this.send({
      to,
      subject: `[${params.severity.toUpperCase()}] ${params.alertName} - ${params.hotelName}`,
      html,
    })
  }

  async sendTeamInvitation(to: string, params: InviteEmailParams): Promise<{ success: boolean }> {
    const html = getTeamInviteEmail(
      params.inviteeName,
      params.inviterName,
      params.hotelName,
      params.role,
      params.inviteUrl,
    )
    return this.send({
      to,
      subject: `Invito a ${params.hotelName} - SANTADDEO`,
      html,
    })
  }

  // --- Throttled system alert methods ---

  /**
   * Check if an alert of this type was already sent for this hotel
   * within the throttle window (default: 1 hour).
   * Returns true if we CAN send (no recent alert found).
   */
  async canSendAlert(
    alertType: string,
    hotelId: string | null,
    throttleMinutes: number = 60,
  ): Promise<boolean> {
    try {
      const supabase = await createServiceRoleClient()
      const cutoff = new Date(Date.now() - throttleMinutes * 60 * 1000).toISOString()

      let query = supabase
        .from("email_logs")
        .select("id", { count: "exact", head: true })
        .eq("alert_type", alertType)
        .eq("success", true)
        .gte("sent_at", cutoff)

      if (hotelId) {
        query = query.eq("hotel_id", hotelId)
      } else {
        query = query.is("hotel_id", null)
      }

      const { count } = await query
      return (count ?? 0) === 0
    } catch (err) {
      console.error("[EmailService] canSendAlert check failed:", err)
      // On error, allow sending (fail-open for alerts)
      return true
    }
  }

  /**
   * Resolve the best recipient email for an alert on a specific hotel.
   * Lookup cascade: property_admin -> super_admin -> fallback.
   * Uses hotel_users junction table joined with profiles.
   */
  private async resolveAlertRecipient(hotelId: string | null): Promise<string> {
    const FALLBACK = "info@santaddeo.com"
    if (!hotelId) return FALLBACK

    try {
      const supabase = await createServiceRoleClient()

      // 1. Look for property_admin for this hotel
      const { data: adminRows } = await supabase
        .from("hotel_users")
        .select("user_id, profiles!inner(email)")
        .eq("hotel_id", hotelId)
        .eq("role", "property_admin")
        .limit(1)

      if (adminRows && adminRows.length > 0) {
        const email = (adminRows[0] as any).profiles?.email
        if (email) return email
      }

      // 2. Fallback: look for super_admin for this hotel
      const { data: superRows } = await supabase
        .from("hotel_users")
        .select("user_id, profiles!inner(email)")
        .eq("hotel_id", hotelId)
        .eq("role", "super_admin")
        .limit(1)

      if (superRows && superRows.length > 0) {
        const email = (superRows[0] as any).profiles?.email
        if (email) return email
      }

      return FALLBACK
    } catch (err) {
      console.error("[EmailService] resolveAlertRecipient failed:", err)
      return FALLBACK
    }
  }

  /**
   * Send a system alert email ONLY if no identical alert was sent
   * in the last `throttleMinutes` (default: 60).
   * Resolves recipient dynamically from hotel_users/profiles.
   * Logs the result to email_logs regardless of outcome.
   */
  async sendAlertIfNotRecent(params: {
    alertType: string
    hotelId: string | null
    hotelName?: string
    summary: string
    details: string[]
    recipient?: string
    throttleMinutes?: number
  }): Promise<{ sent: boolean; throttled: boolean; error?: string }> {
    const {
      alertType,
      hotelId,
      hotelName,
      summary,
      details,
      throttleMinutes = 60,
    } = params

    // Throttle check
    const allowed = await this.canSendAlert(alertType, hotelId, throttleMinutes)
    if (!allowed) {
      console.log(`[EmailService] Alert "${alertType}" throttled for hotel ${hotelId || "global"} (sent < ${throttleMinutes}m ago)`)
      return { sent: false, throttled: true }
    }

    // Resolve recipient: explicit override > dynamic lookup > fallback
    const resolvedRecipient = params.recipient
      ? params.recipient
      : await this.resolveAlertRecipient(hotelId)

    // Build email
    const dashboardUrl = hotelId
      ? `${process.env.NEXT_PUBLIC_APP_URL || "https://www.santaddeo.com"}/dashboard?hotel_id=${hotelId}`
      : `${process.env.NEXT_PUBLIC_APP_URL || "https://www.santaddeo.com"}/superadmin`

    const html = getSystemAlertEmail({
      alertType,
      hotelName,
      summary,
      details,
      dashboardUrl,
    })

    const subject = hotelName
      ? `[ALERT] ${alertType} - ${hotelName}`
      : `[ALERT] ${alertType} - SANTADDEO`

    // Send
    const result = await this.send({ to: resolvedRecipient, subject, html })

    // Log to email_logs with the actual recipient used
    try {
      const supabase = await createServiceRoleClient()
      await supabase.from("email_logs").insert({
        hotel_id: hotelId,
        alert_type: alertType,
        message: summary,
        recipient_email: resolvedRecipient,
        success: result.success,
      })
    } catch (logErr) {
      console.error("[EmailService] Failed to log alert email:", logErr)
    }

    if (!result.success) {
      return { sent: false, throttled: false, error: result.error }
    }

    console.log(`[EmailService] Alert "${alertType}" sent for hotel ${hotelId || "global"} to ${resolvedRecipient}`)
    return { sent: true, throttled: false }
  }
}

// Export singleton
export const emailService = EmailService.getInstance()
