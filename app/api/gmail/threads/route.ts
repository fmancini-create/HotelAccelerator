// Gmail Threads API - Direct Gmail API source of truth - NO LOCAL LIMITS
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  // Get user's property
  const { data: propertyUser } = await supabase
    .from("property_users")
    .select("property_id")
    .eq("user_id", user.id)
    .single()

  if (!propertyUser) {
    return NextResponse.json({ error: "Property non trovata" }, { status: 404 })
  }

  // Get email channel
  const { data: channel } = await supabase
    .from("email_channels")
    .select("id")
    .eq("property_id", propertyUser.property_id)
    .eq("provider", "gmail")
    .eq("is_active", true)
    .single()

  if (!channel) {
    return NextResponse.json({ error: "Canale Gmail non configurato" }, { status: 404 })
  }

  const { token, error: tokenError } = await getValidGmailToken(channel.id)
  if (!token) {
    return NextResponse.json({ error: tokenError || "Token non disponibile" }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const labelId = searchParams.get("labelId") || "INBOX"
  const pageToken = searchParams.get("pageToken") || undefined
  const q = searchParams.get("q") || undefined

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
      console.error("[Gmail API] threads.list error:", threadsListRes.status, errorBody)
      return NextResponse.json({ error: "Errore Gmail API" }, { status: threadsListRes.status })
    }

    const threadsListData = await threadsListRes.json()

    console.log("[v0] Gmail threads.list raw response:", {
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
          console.error("[Gmail API] thread.get error for", threadId, threadRes.status)
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

    return NextResponse.json({
      threads: validThreads,
      nextPageToken: threadsListData.nextPageToken || null,
      resultSizeEstimate: threadsListData.resultSizeEstimate || 0,
      // Debug info
      _debug: {
        rawThreadsCount: threadIds.length,
        processedThreadsCount: validThreads.length,
        hasNextPage: !!threadsListData.nextPageToken,
        labelId,
      },
    })
  } catch (error) {
    console.error("[Gmail API] Error:", error)
    return NextResponse.json({ error: "Errore durante il recupero dei thread" }, { status: 500 })
  }
}
