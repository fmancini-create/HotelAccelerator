import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { getMemberEffectiveAreas } from "@/lib/auth/area-access"
import { getAccessibleChannelIds, getChannelAccess } from "@/lib/channel-access"
import { BASELINE_AREA_KEYS } from "@/lib/platform/areas"
import { readDashboardUserSettings } from "@/lib/platform/dashboard-user-settings"
import { computeOperatorPerformance, GIORNI_PREDEFINITI } from "@/lib/platform/operator-performance"
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

  // Calls arrive newest first. At each missed call, completedAt already contains
  // any successful contact with the same number that happened AFTER it.
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

export async function GET(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) {
    return NextResponse.json({ error: "Sessione non valida" }, { status: 401 })
  }

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
    return { hiddenPanels: [], goals: { responsesTarget: null, conversationsTarget: null, medianResponseSecondsTarget: null } }
  })

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
    },
    todos: [],
    messages: [],
    calls: { latest: [], callbacks: [] },
  }

  // Performance is self-only here. The existing admin performance endpoint still
  // owns team comparisons; this route never exposes another operator's row.
  if (userId) {
    try {
      const { data: kpi } = await sb
        .from("operator_kpi_settings")
        .select("enabled")
        .eq("property_id", propertyId)
        .eq("user_id", userId)
        .maybeSingle()

      if (kpi?.enabled) {
        const performance = await computeOperatorPerformance(sb, propertyId, GIORNI_PREDEFINITI)
        const me = performance.righe.find((row) => row.genere === "persona" && row.id === userId)
        result.performance = {
          enabled: true,
          days: performance.giorni,
          responses: me?.risposte ?? 0,
          conversations: me?.conversazioni ?? 0,
          medianResponseSeconds: me?.attesaMedianaSec ?? null,
          measuredResponses: me?.attesaSu ?? 0,
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
      }
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
