// Gmail Threads API - Direct Gmail API source of truth - NO LOCAL LIMITS
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"

const API_VERSION = "v743" // Debug marker - updated

export async function GET(request: NextRequest) {
  console.log(`[v0] GMAIL THREADS API ${API_VERSION} HIT`)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.log(`[v0] ${API_VERSION} - No user found`)
    return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
  }

  let channelId: string | null = null

  // 1. Check if user is super_admin in admin_users
  const { data: adminUser } = await supabase.from("admin_users").select("role").eq("id", user.id).single()

  if (adminUser?.role === "super_admin") {
    // Super admin: access to first active Gmail channel
    console.log(`[v0] ${API_VERSION} - User is super_admin, getting first active Gmail channel`)
    const { data: channel } = await supabase
      .from("email_channels")
      .select("id")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .limit(1)
      .single()

    channelId = channel?.id || null
  } else {
    // 2. Try user_channel_permissions
    const { data: channelPermission } = await supabase
      .from("user_channel_permissions")
      .select("channel_id")
      .eq("user_id", user.id)
      .limit(1)
      .single()

    if (channelPermission) {
      channelId = channelPermission.channel_id
    } else {
      // 3. Try email_channel_assignments
      const { data: channelAssignment } = await supabase
        .from("email_channel_assignments")
        .select("channel_id")
        .eq("user_id", user.id)
        .limit(1)
        .single()

      channelId = channelAssignment?.channel_id || null
    }
  }

  if (!channelId) {
    console.log(`[v0] ${API_VERSION} - No Gmail channel found for user`)
    return NextResponse.json({ error: "Canale Gmail non configurato", debugVersion: API_VERSION }, { status: 404 })
  }

  console.log(`[v0] ${API_VERSION} - Found channel:`, channelId)

  const { token, error: tokenError } = await getValidGmailToken(channelId)
  if (!token) {
    console.log(`[v0] ${API_VERSION} - Token error:`, tokenError)
    return NextResponse.json(
      { error: tokenError || "Token non disponibile", debugVersion: API_VERSION },
      { status: 401 },
    )
  }

  const searchParams = request.nextUrl.searchParams
  const labelId = searchParams.get("labelId") || "INBOX"
  const pageToken = searchParams.get("pageToken") || undefined
  const q = searchParams.get("q") || undefined

  console.log(`[v0] ${API_VERSION} - Fetching Gmail threads:`, {
    labelId,
    pageToken: pageToken ? "present" : "none",
    q,
  })

  try {
    // Gmail API maxResults max is 500 for threads.list
    const params = new URLSearchParams()
    if (labelId && labelId !== "ALL") {
      params.set("labelIds", labelId)
    }
    if (pageToken) {
      params.set("pageToken", pageToken)
    }
    params.set("maxResults", "100")
    if (q) {
      params.set("q", q)
    }

    // Fetch threads list from Gmail API
    const threadsListRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!threadsListRes.ok) {
      const errorBody = await threadsListRes.text()
      console.error(`[v0] ${API_VERSION} - Gmail API threads.list error:`, threadsListRes.status, errorBody)
      return NextResponse.json(
        { error: "Errore Gmail API", debugVersion: API_VERSION },
        { status: threadsListRes.status },
      )
    }

    const threadsListData = await threadsListRes.json()

    console.log(`[v0] ${API_VERSION} - Gmail threads.list raw response:`, {
      threadsCount: threadsListData.threads?.length || 0,
      resultSizeEstimate: threadsListData.resultSizeEstimate,
      nextPageToken: threadsListData.nextPageToken ? "present" : "none",
      labelId,
    })

    const threadIds = threadsListData.threads?.map((t: any) => t.id) || []

    // Fetch full thread data for each thread (parallel batch)
    const threads = await Promise.all(
      threadIds.map(async (threadId: string) => {
        const threadRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        )

        if (!threadRes.ok) {
          console.error(`[v0] ${API_VERSION} - thread.get error for`, threadId, threadRes.status)
          return null
        }

        const threadData = await threadRes.json()
        const messages = threadData.messages || []
        const lastMessage = messages[messages.length - 1]

        // Extract headers from last message
        const headers = lastMessage?.payload?.headers || []
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

        // Get labels from last message
        const labels = lastMessage?.labelIds || []
        const isUnread = labels.includes("UNREAD")
        const isStarred = labels.includes("STARRED")

        // Get sender info
        const fromHeader = getHeader("From")
        const fromMatch = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]*)>?$/)
        const senderName = fromMatch?.[1]?.trim() || fromMatch?.[2]?.split("@")[0] || ""
        const senderEmail = fromMatch?.[2] || fromHeader

        // Get date from internalDate (milliseconds timestamp)
        const internalDate = lastMessage?.internalDate ? Number.parseInt(lastMessage.internalDate) : Date.now()

        return {
          id: threadId,
          gmail_thread_id: threadId,
          historyId: threadData.historyId,
          messagesCount: messages.length,
          subject: getHeader("Subject") || "(nessun oggetto)",
          snippet: lastMessage?.snippet || "",
          from: {
            name: senderName,
            email: senderEmail,
          },
          labels,
          isUnread,
          isStarred,
          internalDate,
          date: new Date(internalDate).toISOString(),
        }
      }),
    )

    // Filter out nulls and sort by internalDate descending (newest first)
    const validThreads = threads.filter(Boolean).sort((a: any, b: any) => b.internalDate - a.internalDate)

    console.log(`[v0] ${API_VERSION} - Returning ${validThreads.length} threads`)

    return NextResponse.json({
      threads: validThreads,
      nextPageToken: threadsListData.nextPageToken || null,
      resultSizeEstimate: threadsListData.resultSizeEstimate || 0,
      debugVersion: API_VERSION,
      _debug: {
        version: API_VERSION,
        rawThreadsCount: threadIds.length,
        processedThreadsCount: validThreads.length,
        hasNextPage: !!threadsListData.nextPageToken,
        labelId,
      },
    })
  } catch (error) {
    console.error(`[v0] ${API_VERSION} - Error:`, error)
    return NextResponse.json(
      { error: "Errore durante il recupero dei thread", debugVersion: API_VERSION },
      { status: 500 },
    )
  }
}
