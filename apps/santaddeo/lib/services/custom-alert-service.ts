// Custom Alert Service - Evaluates availability-based alert rules
// Integrated into sync-and-etl cron (every 15 minutes)

import { createServiceRoleClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email/send-email"

interface CustomAlertRule {
  id: string
  hotel_id: string
  name: string
  condition_type: "rooms_remaining" | "rooms_remaining_by_type"
  condition_operator: "lte" | "gte" | "eq"
  condition_value: number
  room_type_id: string | null
  days_ahead: number
  notify_email: boolean
  notify_popup: boolean
  cooldown_hours: number
  last_triggered_at: string | null
}

interface TriggeredAlert {
  rule: CustomAlertRule
  matchingDates: {
    date: string
    roomsAvailable: number
    roomTypeName?: string
  }[]
  hotelName: string
}

/**
 * Evaluates all active custom alert rules for all hotels
 * Called by sync-and-etl cron every 15 minutes
 */
export async function evaluateCustomAlertRules(): Promise<{
  evaluated: number
  triggered: number
  errors: string[]
}> {
  const supabase = await createServiceRoleClient()
  const errors: string[] = []
  let evaluated = 0
  let triggered = 0

  try {
    // Fetch all active rules with hotel info
    const { data: rules, error: rulesError } = await supabase
      .from("custom_alert_rules")
      .select(`
        *,
        hotel:hotels(id, name),
        room_type:room_types(id, name)
      `)
      .eq("is_active", true)

    if (rulesError) {
      throw new Error(`Failed to fetch custom alert rules: ${rulesError.message}`)
    }

    if (!rules || rules.length === 0) {
      return { evaluated: 0, triggered: 0, errors: [] }
    }

    console.log(`[CustomAlertService] Evaluating ${rules.length} active rules`)

    // Group rules by hotel for efficient querying
    const rulesByHotel = new Map<string, typeof rules>()
    for (const rule of rules) {
      const hotelRules = rulesByHotel.get(rule.hotel_id) || []
      hotelRules.push(rule)
      rulesByHotel.set(rule.hotel_id, hotelRules)
    }

    // Process each hotel
    for (const [hotelId, hotelRules] of rulesByHotel) {
      try {
        const hotelName = hotelRules[0]?.hotel?.name || hotelId

        // Get availability data for the next max(days_ahead) days
        const maxDaysAhead = Math.max(...hotelRules.map((r) => r.days_ahead))
        const today = new Date()
        const endDate = new Date(today)
        endDate.setDate(endDate.getDate() + maxDaysAhead)

        const todayStr = today.toISOString().split("T")[0]
        const endDateStr = endDate.toISOString().split("T")[0]

        // Fetch availability from rms_availability_daily
        const { data: availability, error: availError } = await supabase
          .from("rms_availability_daily")
          .select("date, room_type_id, total_rooms, rooms_available, rooms_out_of_service")
          .eq("hotel_id", hotelId)
          .gte("date", todayStr)
          .lte("date", endDateStr)

        if (availError) {
          errors.push(`Hotel ${hotelId}: ${availError.message}`)
          continue
        }

        // Also get room types for names
        const { data: roomTypes } = await supabase
          .from("room_types")
          .select("id, name")
          .eq("hotel_id", hotelId)

        const roomTypeMap = new Map(roomTypes?.map((rt) => [rt.id, rt.name]) || [])

        // Evaluate each rule for this hotel
        for (const rule of hotelRules) {
          evaluated++

          // Check cooldown
          if (rule.last_triggered_at) {
            const lastTriggered = new Date(rule.last_triggered_at)
            const cooldownMs = rule.cooldown_hours * 60 * 60 * 1000
            if (Date.now() - lastTriggered.getTime() < cooldownMs) {
              continue // Still in cooldown
            }
          }

          // Calculate the end date for this rule
          const ruleEndDate = new Date(today)
          ruleEndDate.setDate(ruleEndDate.getDate() + rule.days_ahead)
          const ruleEndDateStr = ruleEndDate.toISOString().split("T")[0]

          // Filter availability for this rule's date range
          const relevantAvailability = (availability || []).filter(
            (a) => a.date >= todayStr && a.date <= ruleEndDateStr
          )

          // Calculate rooms remaining per date
          const matchingDates: TriggeredAlert["matchingDates"] = []

          if (rule.condition_type === "rooms_remaining") {
            // Total rooms remaining across all types per date
            const dateMap = new Map<string, number>()
            for (const a of relevantAvailability) {
              const current = dateMap.get(a.date) || 0
              const available = Math.max(0, (a.rooms_available || 0))
              dateMap.set(a.date, current + available)
            }

            for (const [date, roomsAvailable] of dateMap) {
              if (evaluateCondition(roomsAvailable, rule.condition_operator, rule.condition_value)) {
                matchingDates.push({ date, roomsAvailable })
              }
            }
          } else if (rule.condition_type === "rooms_remaining_by_type" && rule.room_type_id) {
            // Rooms remaining for specific type per date
            const typeAvailability = relevantAvailability.filter(
              (a) => a.room_type_id === rule.room_type_id
            )

            for (const a of typeAvailability) {
              const roomsAvailable = Math.max(0, (a.rooms_available || 0))
              if (evaluateCondition(roomsAvailable, rule.condition_operator, rule.condition_value)) {
                matchingDates.push({
                  date: a.date,
                  roomsAvailable,
                  roomTypeName: roomTypeMap.get(rule.room_type_id) || rule.room_type_id,
                })
              }
            }
          }

          // If any dates match, trigger the alert
          if (matchingDates.length > 0) {
            triggered++

            const triggeredAlert: TriggeredAlert = {
              rule,
              matchingDates: matchingDates.sort((a, b) => a.date.localeCompare(b.date)),
              hotelName,
            }

            await triggerAlert(supabase, triggeredAlert, roomTypeMap.get(rule.room_type_id || ""))
          }
        }
      } catch (hotelError: any) {
        errors.push(`Hotel ${hotelId}: ${hotelError.message}`)
      }
    }

    return { evaluated, triggered, errors }
  } catch (error: any) {
    console.error("[CustomAlertService] Error:", error)
    errors.push(error.message)
    return { evaluated, triggered, errors }
  }
}

/**
 * Evaluate a condition based on operator
 */
function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case "lte":
      return value <= threshold
    case "gte":
      return value >= threshold
    case "eq":
      return value === threshold
    default:
      return false
  }
}

/**
 * Trigger an alert - send notifications and update last_triggered_at
 */
async function triggerAlert(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  alert: TriggeredAlert,
  roomTypeName?: string
): Promise<void> {
  const { rule, matchingDates, hotelName } = alert

  console.log(`[CustomAlertService] Triggering alert "${rule.name}" for hotel ${hotelName}`)

  // Update last_triggered_at
  await supabase
    .from("custom_alert_rules")
    .update({ last_triggered_at: new Date().toISOString() })
    .eq("id", rule.id)

  // Build notification message
  const conditionText = rule.condition_type === "rooms_remaining_by_type" && roomTypeName
    ? `camere "${roomTypeName}"`
    : "camere totali"

  const operatorText = {
    lte: "minore o uguale a",
    gte: "maggiore o uguale a",
    eq: "uguale a",
  }[rule.condition_operator]

  // FIX 13/05/2026: Mostrare TUTTE le date critiche nel messaggio popup.
  // L'utente attiva le notifiche proprio per sapere subito quali date sono
  // coinvolte; troncare a 3 con "+N altre date" rende inutile la notifica.
  // Il container del popup ha overflow-y-auto, quindi puo' scrollare anche
  // con elenchi lunghi.
  const datesShortList = matchingDates
    .map((d) => `${formatDateIt(d.date)} (${d.roomsAvailable} cam.)`)
    .join(", ")

  // Messaggio per popup con tutte le date critiche ben visibili
  const message = `${hotelName}: ${conditionText} ${operatorText} ${rule.condition_value}. Date critiche: ${datesShortList}`

  // Send popup notification (user_notifications)
  if (rule.notify_popup) {
    // Get users who should receive this notification (hotel users)
    const { data: hotelUsers } = await supabase
      .from("hotel_users")
      .select("user_id")
      .eq("hotel_id", rule.hotel_id)

    // Also get users via organization
    const { data: hotel } = await supabase
      .from("hotels")
      .select("organization_id")
      .eq("id", rule.hotel_id)
      .single()

    const { data: orgUsers } = hotel?.organization_id
      ? await supabase
          .from("profiles")
          .select("id")
          .eq("organization_id", hotel.organization_id)
      : { data: [] }

    const userIds = new Set<string>()
    hotelUsers?.forEach((hu) => userIds.add(hu.user_id))
    orgUsers?.forEach((ou) => userIds.add(ou.id))

    // Check notification preferences for each user
    for (const userId of userIds) {
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("booking_alerts_popup")
        .eq("user_id", userId)
        .eq("hotel_id", rule.hotel_id)
        .single()

      // Default to true if no preferences set
      const shouldNotify = prefs?.booking_alerts_popup ?? true

      if (shouldNotify) {
        // FIX 11/05/2026: La colonna è "body" non "message", e "metadata" non esiste
        const { error: insertError } = await supabase.from("user_notifications").insert({
          user_id: userId,
          hotel_id: rule.hotel_id,
          type: "custom_alert",
          title: `Alert: ${rule.name}`,
          body: message,
          is_read: false,
        })
        if (insertError) {
          console.error(`[CustomAlertService] Failed to create notification for user ${userId}:`, insertError)
        } else {
          console.log(`[CustomAlertService] Created popup notification for user ${userId}`)
        }
      }
    }
  }

  // Send email notification
  if (rule.notify_email) {
    // Get users with email notifications enabled
    const { data: hotelUsers } = await supabase
      .from("hotel_users")
      .select("user_id, profiles(email)")
      .eq("hotel_id", rule.hotel_id)

    const { data: hotel } = await supabase
      .from("hotels")
      .select("organization_id")
      .eq("id", rule.hotel_id)
      .single()

    const { data: orgUsers } = hotel?.organization_id
      ? await supabase
          .from("profiles")
          .select("id, email")
          .eq("organization_id", hotel.organization_id)
      : { data: [] }

    const userEmails = new Map<string, string>()
    hotelUsers?.forEach((hu: any) => {
      if (hu.profiles?.email) userEmails.set(hu.user_id, hu.profiles.email)
    })
    orgUsers?.forEach((ou: any) => {
      if (ou.email) userEmails.set(ou.id, ou.email)
    })

    // Check preferences and send emails
    for (const [userId, email] of userEmails) {
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("booking_alerts_email")
        .eq("user_id", userId)
        .eq("hotel_id", rule.hotel_id)
        .single()

      // Default to false for email (opt-in)
      const shouldEmail = prefs?.booking_alerts_email ?? false

      if (shouldEmail) {
        try {
          await sendEmail({
            to: email,
            subject: `[${hotelName}] Alert: ${rule.name}`,
            html: `
              <h2>Alert Disponibilità</h2>
              <p>La regola "<strong>${rule.name}</strong>" si è attivata per <strong>${hotelName}</strong>.</p>
              <p>${conditionText} rimanenti ${operatorText} ${rule.condition_value}:</p>
              <ul>
                ${matchingDates.map((d) => `<li>${formatDateIt(d.date)}: <strong>${d.roomsAvailable}</strong> camere</li>`).join("")}
              </ul>
              <p>Accedi alla piattaforma per gestire la disponibilità.</p>
            `,
          })
        } catch (emailError) {
          console.error(`[CustomAlertService] Failed to send email to ${email}:`, emailError)
        }
      }
    }
  }
}

/**
 * Format date in Italian format (es. "Lun 15 Gen")
 */
function formatDateIt(dateStr: string): string {
  const date = new Date(dateStr)
  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"]
  const months = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`
}
