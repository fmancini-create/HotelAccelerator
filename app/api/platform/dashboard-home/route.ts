import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { getMemberEffectiveAreas } from "@/lib/auth/area-access"
import { getAccessibleChannelIds, getChannelAccess } from "@/lib/channel-access"
import { BASELINE_AREA_KEYS } from "@/lib/platform/areas"
import {
  EMPTY_DASHBOARD_USER_SETTINGS,
  readDashboardUserSettings,
  type DashboardCustomGoalMetric,
  type DashboardCustomGoalPeriod,
} from "@/lib/platform/dashboard-user-settings"
import { getTenantLocalDayStart, resolveTenantTimeZone } from "@/lib/platform/local-day"
import { computeOperatorPerformance, GIORNI_PREDEFINITI } from "@/lib/platform/operator-performance"
import {
  computeOperatorSalesPerformance,
  type OperatorSalesPerformance,
} from "@/lib/platform/operator-sales-performance"
import { InboxReadService } from "@/lib/platform-services/inbox-read.service"
import { createServiceClient } from "@/lib/supabase/server"
import type { ConversationListOptions } from "@/lib/types/inbox-read.types"

export const dynamic = "force-dynamic"

type RawPhoneCall = {
  id: string
  direction: string | null
  status: string | null
  counterpart_number: string | null
  started_at: string | null
  duration_seconds: number | null
  contact_id: string | null
  user_id: string | null
}

type DashboardPhoneCall = {
  id: string
  direction: string | null
  status: string | null
  number: string | null
  started_at: string | null
  duration_seconds: number | null
  contact_id: string | null
  user_id: string | null
}

type ContactLabel = { id: string; name: string | null; company: string | null }
type UserLabel = { id: string; name: string | null }

function callbackState(calls: Array<{ number: string | null; status: string | null; started_at: string | null }>) {
  const completedAt = new Map<string, number>()
  const callbacks: string[] = []
  for (const call of calls) {
    const number = call.number ?? ""
    const at = call.started_at ? new Date(call.started_at).getTime() : 0
    if (!number || !at) continue
    if (call.status === "completed") {
      const previous = completedAt.get(number) ?? 0
      if (at > previous) completedAt.set(number, at)
      continue
    }
    if (call.status === "missed" && !completedAt.has(number)) callbacks.push(number)
  }
  return new Set(callbacks)
}

function customMetricValue(
  sales: OperatorSalesPerformance,
  metric: DashboardCustomGoalMetric | null,
  period: DashboardCustomGoalPeriod | null,
): { value: number | null; unit: "count" | "percent" | null } {
  if (!metric) return { value: null, unit: null }
  const workday = period === "workday"
  if (metric === "quotes_sent") return { value: workday ? sales.quotesSentToday : sales.quotesSent30, unit: "count" }
  if (metric === "completed_calls") return { value: workday ? sales.completedCallsToday : sales.completedCalls30, unit: "count" }
  if (metric === "completed_tasks") return { value: workday ? sales.completedTasksToday : sales.completedTasks30, unit: "count" }
  if (metric === "conversion_rate") return { value: workday ? sales.conversionRateToday : sales.conversionRate30, unit: "percent" }
  return { value: null, unit: null }
}

function customMetricAllowed(
  metric: DashboardCustomGoalMetric | null,
  hasArea: (area: string) => boolean,
): boolean {
  if (!metric) return true
  if (metric === "completed_calls") return hasArea("calls")
  if (metric === "completed_tasks") return hasArea("todos")
  return hasArea("crm")
}

export async function GET(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return NextResponse.json({ error: "Sessione non valida" }, { status: 401 })

  const propertyId = identity.propertyId
  const userId = identity.adminUserId ?? null
  const isAdmin = identity.isSuperAdmin || identity.isTenantAdmin
  const sb = createServiceClient()

  let areas: string[] = []
  if (!isAdmin && userId) {
    try {
      areas = await getMemberEffectiveAreas(propertyId, userId)
    } catch {
      areas = []
    }
  }
  const granted = new Set([...(areas ?? []), ...BASELINE_AREA_KEYS])
  const hasArea = (area: string) => isAdmin || granted.has(area)

  const settings = await readDashboardUserSettings(sb, propertyId, userId).catch((error) => {
    console.error("[dashboard-home] user settings unavailable", error)
    return EMPTY_DASHBOARD_USER_SETTINGS
  })

  const emptyCommercial = {
    enabled: false as boolean | null,
    closedDeals30: null as number | null,
    closedDealsMissingValue30: null as number | null,
    closedRevenueCents30: null as number | null,
    quotesSent30: null as number | null,
    customMetricValue: null as number | null,
    customMetricUnit: null as "count" | "percent" | null,
    customMetric: settings.goals.customGoalMetric,
    customMetricPeriod: settings.goals.customGoalPeriod,
    customMetricAllowed: customMetricAllowed(settings.goals.customGoalMetric, hasArea),
  }

  const result: Record<string, unknown> = {
    hiddenPanels: settings.hiddenPanels,
    goals: settings.goals,
    performance: {
      enabled: false,
      days: GIORNI_PREDEFINITI,
      responses: null,
      conversations: null,
      medianResponseSeconds: null,
      measuredResponses: 0,
      todayResponses: null,
      todayConversations: null,
      timeZone: "Europe/Rome",
    },
    commercial: emptyCommercial,
    todos: [],
    messages: [],
    calls: { latest: [], callbacks: [] },
  }

  // Performance self-only: il confronto fra operatori resta sulle superfici admin.
  if (userId) {
    try {
      const [{ data: kpi }, { data: property }] = await Promise.all([
        sb
          .from("operator_kpi_settings")
          .select("enabled")
          .eq("property_id", propertyId)
          .eq("user_id", userId)
          .maybeSingle(),
        sb.from("properties").select("timezone").eq("id", propertyId).maybeSingle(),
      ])
      const timeZone = resolveTenantTimeZone(property?.timezone)

      if (kpi?.enabled) {
        const now = new Date()
        const dayStart = getTenantLocalDayStart(now, timeZone)
        const rollingStart = new Date(now.getTime() - GIORNI_PREDEFINITI * 86_400_000)
        const dailyWindowDays = Math.max((now.getTime() - dayStart.getTime()) / 86_400_000, 1 / 86_400)
        const [performance, todayPerformance] = await Promise.all([
          computeOperatorPerformance(sb, propertyId, GIORNI_PREDEFINITI),
          computeOperatorPerformance(sb, propertyId, dailyWindowDays),
        ])
        const me = performance.righe.find((row) => row.genere === "persona" && row.id === userId)
        const todayMe = todayPerformance.righe.find((row) => row.genere === "persona" && row.id === userId)

        result.performance = {
          enabled: true,
          days: performance.giorni,
          responses: me?.risposte ?? 0,
          conversations: me?.conversazioni ?? 0,
          medianResponseSeconds: me?.attesaMedianaSec ?? null,
          measuredResponses: me?.attesaSu ?? 0,
          todayResponses: todayMe?.risposte ?? 0,
          todayConversations: todayMe?.conversazioni ?? 0,
          timeZone,
        }

        // I risultati di vendita derivano dal CRM e non vengono esposti sotto il
        // solo permesso Inbox. La card ha una propria area `crm` nel manifest.
        if (hasArea("crm")) {
          try {
            const sales = await computeOperatorSalesPerformance(
              sb,
              propertyId,
              userId,
              dayStart.toISOString(),
              rollingStart.toISOString(),
              { includeCalls: hasArea("calls"), includeTasks: hasArea("todos") },
            )
            const custom = customMetricValue(sales, settings.goals.customGoalMetric, settings.goals.customGoalPeriod)
            result.commercial = {
              enabled: true,
              closedDeals30: sales.closedDeals30,
              closedDealsMissingValue30: sales.closedDealsMissingValue30,
              closedRevenueCents30: sales.closedRevenueCents30,
              quotesSent30: sales.quotesSent30,
              customMetricValue: custom.value,
              customMetricUnit: custom.unit,
              customMetric: settings.goals.customGoalMetric,
              customMetricPeriod: settings.goals.customGoalPeriod,
              customMetricAllowed: customMetricAllowed(settings.goals.customGoalMetric, hasArea),
            }
          } catch (commercialError) {
            console.error("[dashboard-home] commercial performance unavailable", commercialError)
            result.commercial = { ...emptyCommercial, enabled: null }
          }
        }
      } else {
        result.performance = {
          enabled: false,
          days: GIORNI_PREDEFINITI,
          responses: null,
          conversations: null,
          medianResponseSeconds: null,
          measuredResponses: 0,
          todayResponses: null,
          todayConversations: null,
          timeZone,
        }
      }
    } catch (error) {
      console.error("[dashboard-home] self performance unavailable", error)
      result.performance = {
        enabled: null,
        days: GIORNI_PREDEFINITI,
        responses: null,
        conversations: null,
        medianResponseSeconds: null,
        measuredResponses: 0,
        todayResponses: null,
        todayConversations: null,
        timeZone: "Europe/Rome",
      }
      result.commercial = emptyCommercial
    }
  }

  if (hasArea("todos") && userId) {
    try {
      const { data, error } = await sb
        .from("todos")
        .select("id,title,status,priority,due_date,external_source")
        .eq("property_id", propertyId)
        .eq("assigned_to", userId)
        .in("status", ["open", "in_progress"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(6)
      if (error) throw error
      result.todos = data ?? []
    } catch (error) {
      console.error("[dashboard-home] todos unavailable", error)
      result.todos = null
    }
  }

  if (hasArea("inbox")) {
    try {
      const channelAccess = await getChannelAccess(request)
      let access: ConversationListOptions["access"] | undefined
      if (!channelAccess.isAdmin && channelAccess.adminUserId) {
        const ids = await getAccessibleChannelIds(channelAccess.supabase, propertyId, channelAccess.adminUserId)
        access = { restrict: true, ...ids }
      } else if (!channelAccess.isAdmin) {
        access = { restrict: true, emailChannelIds: [], messagingChannelIds: [], chatChannelIds: [] }
      }

      const inbox = new InboxReadService(sb)
      const conversations = await inbox.listConversations(propertyId, {
        status: "open",
        limit: 5,
        offset: 0,
        sort: "date_desc",
        access,
      })
      result.messages = conversations.map((conversation) => ({
        id: conversation.id,
        subject: conversation.subject,
        channel: conversation.channel,
        unreadCount: conversation.unread_count,
        lastMessageAt: conversation.last_message_at,
        contactName: conversation.contact?.name ?? conversation.contact?.email ?? "Ospite",
        preview: conversation.last_message?.preview ?? "",
      }))
    } catch (error) {
      console.error("[dashboard-home] messages unavailable", error)
      result.messages = null
    }
  }

  if (hasArea("calls")) {
    try {
      const { data, error } = await sb
        .from("phone_calls")
        .select("id,direction,status,counterpart_number,started_at,duration_seconds,contact_id,user_id")
        .eq("property_id", propertyId)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(60)
      if (error) throw error

      const rows: DashboardPhoneCall[] = ((data ?? []) as RawPhoneCall[]).map((call) => ({
        id: call.id,
        direction: call.direction,
        status: call.status,
        number: call.counterpart_number,
        started_at: call.started_at,
        duration_seconds: call.duration_seconds,
        contact_id: call.contact_id,
        user_id: call.user_id,
      }))

      const contactIds = [...new Set(rows.map((call) => call.contact_id).filter(Boolean))] as string[]
      const userIds = [...new Set(rows.map((call) => call.user_id).filter(Boolean))] as string[]
      const [contacts, users] = await Promise.all([
        contactIds.length
          ? sb.from("contacts").select("id,name,company").eq("property_id", propertyId).in("id", contactIds)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? sb.from("admin_users").select("id,name").eq("property_id", propertyId).in("id", userIds)
          : Promise.resolve({ data: [] }),
      ])
      const contactById = new Map<string, ContactLabel>(
        ((contacts.data ?? []) as ContactLabel[]).map((contact) => [contact.id, contact]),
      )
      const userById = new Map<string, string | null>(
        ((users.data ?? []) as UserLabel[]).map((user) => [user.id, user.name]),
      )
      const callbackNumbers = callbackState(rows)

      const mapped = rows.map((call) => {
        const contact = call.contact_id ? contactById.get(call.contact_id) : null
        return {
          id: call.id,
          direction: call.direction,
          status: call.status ?? "completed",
          number: call.number,
          startedAt: call.started_at,
          durationSeconds: call.duration_seconds,
          contactName: contact?.name ?? contact?.company ?? null,
          handledBy: call.user_id ? userById.get(call.user_id) ?? null : null,
          needsCallback: call.direction === "inbound" && call.status === "missed" && !!call.number && callbackNumbers.has(call.number),
        }
      })

      result.calls = {
        latest: mapped.slice(0, 5),
        callbacks: mapped.filter((call) => call.needsCallback).slice(0, 5),
      }
    } catch (error) {
      console.error("[dashboard-home] calls unavailable", error)
      result.calls = null
    }
  }

  return NextResponse.json(result)
}
