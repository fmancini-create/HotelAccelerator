import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailLabelsWithCounts } from "@/lib/gmail-client"
import { resolveGmailChannelId } from "@/lib/gmail-channel-resolver"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      return NextResponse.json(
        {
          labels: [],
          systemLabels: [],
          error: "Autenticazione temporaneamente non verificabile",
          code: "GMAIL_TEMPORARILY_UNAVAILABLE",
        },
        { status: 503, headers: { "Retry-After": "15" } },
      )
    }

    if (!user) {
      return NextResponse.json(
        { labels: [], systemLabels: [], error: "Sessione scaduta", code: "APP_AUTH_REQUIRED" },
        { status: 401 },
      )
    }

    const requestedChannelId = request.nextUrl.searchParams.get("channelId")
    const { channelId, reason } = await resolveGmailChannelId(supabase, user.id, requestedChannelId)
    console.log(`[Gmail][labels] channel resolution: ${reason}, channelId=${channelId ?? "null"}`)

    if (!channelId) {
      return NextResponse.json(
        { labels: [], systemLabels: [], error: "Canale Gmail non configurato" },
        { status: 404 },
      )
    }

    // Which mailbox are we actually showing? Surface it so the UI can label the inbox.
    const { data: channelRow } = await supabase
      .from("email_channels")
      .select("email_address, display_name, name")
      .eq("id", channelId)
      .maybeSingle()
    const account = channelRow
      ? {
          email: channelRow.email_address || null,
          name: channelRow.display_name || channelRow.name || null,
        }
      : null

    const { labels, error, status, reconnectRequired } = await getGmailLabelsWithCounts(channelId, supabase)

    if (error) {
      console.error("[Gmail] Error fetching labels:", error)
      return NextResponse.json(
        {
          labels: [],
          systemLabels: [],
          error,
          code: reconnectRequired ? "GMAIL_RECONNECT_REQUIRED" : "GMAIL_TEMPORARILY_UNAVAILABLE",
        },
        {
          status: reconnectRequired ? 401 : status === 429 ? 429 : 503,
          headers: reconnectRequired ? undefined : { "Retry-After": "15" },
        },
      )
    }

    const systemLabels = labels
      .filter((label) => label.type === "system")
      .map((label) => ({
        id: label.id,
        name: label.name,
        type: label.type,
        messagesTotal: label.messagesTotal || 0,
        messagesUnread: label.messagesUnread || 0,
        threadsTotal: label.threadsTotal || 0,
        threadsUnread: label.threadsUnread || 0,
      }))

    const userLabels = labels
      .filter((label) => label.type === "user")
      .map((label) => ({
        id: label.id,
        name: label.name,
        type: label.type,
        color: label.color?.backgroundColor || null,
        messagesTotal: label.messagesTotal || 0,
        messagesUnread: label.messagesUnread || 0,
        threadsTotal: label.threadsTotal || 0,
        threadsUnread: label.threadsUnread || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      labels: userLabels,
      systemLabels,
      account,
    })
  } catch (error) {
    console.error("[Gmail] Labels error:", error)
    return NextResponse.json(
      {
        labels: [],
        systemLabels: [],
        error: "Servizio Gmail temporaneamente non disponibile",
        code: "GMAIL_TEMPORARILY_UNAVAILABLE",
      },
      { status: 503, headers: { "Retry-After": "15" } },
    )
  }
}
