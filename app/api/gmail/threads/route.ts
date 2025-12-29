// Gmail Threads API - Direct Gmail API source of truth - with rate limiting protection
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"

const API_VERSION = "v744" // Debug marker - rate limit fix

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options)

    if (res.status === 429) {
      // Rate limited - wait and retry with exponential backoff
      const waitTime = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      console.log(`[v0] ${API_VERSION} - Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}`)
      await delay(waitTime)
      continue
    }

    return res
  }

  // Return last response even if it failed
  return fetch(url, options)
}

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
    const { data: channelPermission } = await supabase
      .from("user_channel_permissions")
      .select("channel_id")
      .eq("user_id", user.id)
      .limit(1)
      .single()

    if (channelPermission) {
      channelId = channelPermission.channel_id
    } else {
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

  console.log(`[v0] ${API_VERSION} - Fetching Gmail threads:`, { labelId, pageToken: pageToken ? "present" : "none" })

  try {
    const params = new URLSearchParams()
    if (labelId && labelId !== "ALL") {
      params.set("labelIds", labelId)
    }
    if (pageToken) {
      params.set("pageToken", pageToken)
    }
    params.set("maxResults", "25")
    if (q) {
      params.set("q", q)
    }

    const threadsListRes = await fetchWithRetry(`https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`, {
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

    console.log(`[v0] ${API_VERSION} - Gmail threads.list response:`, {
      threadsCount: threadsListData.threads?.length || 0,
      resultSizeEstimate: threadsListData.resultSizeEstimate,
      nextPageToken: threadsListData.nextPageToken ? "present" : "none",
    })

    const threadIds = threadsListData.threads?.map((t: any) => t.id) || []

    const BATCH_SIZE = 5
    const threadChunks = chunkArray(threadIds, BATCH_SIZE)
    const allThreads: any[] = []

    for (let i = 0; i < threadChunks.length; i++) {
      const chunk = threadChunks[i]

      const chunkResults = await Promise.all(
        chunk.map(async (threadId: string) => {
          const threadRes = await fetchWithRetry(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${token}` } },
          )

          if (!threadRes.ok) {
            console.error(`[v0] ${API_VERSION} - thread.get error for`, threadId, threadRes.status)
            return null
          }

          const threadData = await threadRes.json()
          const messages = threadData.messages || []
          const lastMessage = messages[messages.length - 1]

          const headers = lastMessage?.payload?.headers || []
          const getHeader = (name: string) =>
            headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

          const labels = lastMessage?.labelIds || []
          const isUnread = labels.includes("UNREAD")
          const isStarred = labels.includes("STARRED")

          const fromHeader = getHeader("From")
          const fromMatch = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]*)>?$/)
          const senderName = fromMatch?.[1]?.trim() || fromMatch?.[2]?.split("@")[0] || ""
          const senderEmail = fromMatch?.[2] || fromHeader

          const internalDate = lastMessage?.internalDate ? Number.parseInt(lastMessage.internalDate) : Date.now()

          return {
            id: threadId,
            gmail_thread_id: threadId,
            historyId: threadData.historyId,
            messagesCount: messages.length,
            subject: getHeader("Subject") || "(nessun oggetto)",
            snippet: lastMessage?.snippet || "",
            from: { name: senderName, email: senderEmail },
            labels,
            isUnread,
            isStarred,
            internalDate,
            date: new Date(internalDate).toISOString(),
          }
        }),
      )

      allThreads.push(...chunkResults)

      if (i < threadChunks.length - 1) {
        await delay(100)
      }
    }

    const validThreads = allThreads.filter(Boolean).sort((a: any, b: any) => b.internalDate - a.internalDate)

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
