// Gmail Threads API - Direct Gmail API source of truth - with rate limiting protection
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"

const API_VERSION = "v813-rate-limit-content-check"

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 5,
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)

      // Handle rate limiting with exponential backoff
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After")
        const waitTime = retryAfter ? Number.parseInt(retryAfter) * 1000 : Math.pow(2, attempt + 1) * 1000
        console.log(
          `[GMAIL-RATE-LIMIT] 429 Too Many Requests, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`,
        )
        await delay(waitTime)
        continue
      }

      // Check content type before parsing
      const contentType = res.headers.get("content-type") || ""

      if (!res.ok) {
        const errorText = await res.text()
        if (errorText.toLowerCase().includes("too many requests") || errorText.toLowerCase().includes("rate limit")) {
          const waitTime = Math.pow(2, attempt + 1) * 1000
          console.log(
            `[GMAIL-RATE-LIMIT] Rate limit detected in response body, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`,
          )
          await delay(waitTime)
          continue
        }
        console.error(`[GMAIL-FETCH] Error ${res.status}: ${errorText.substring(0, 200)}`)
        return { ok: false, status: res.status, error: errorText }
      }

      // Only parse as JSON if content type indicates JSON
      if (contentType.includes("application/json")) {
        const data = await res.json()
        return { ok: true, status: res.status, data }
      } else {
        const text = await res.text()
        if (text.toLowerCase().includes("too many requests") || text.toLowerCase().includes("rate limit")) {
          const waitTime = Math.pow(2, attempt + 1) * 1000
          console.log(
            `[GMAIL-RATE-LIMIT] Rate limit detected in 200 response body, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`,
          )
          await delay(waitTime)
          continue
        }
        // Try to parse as JSON anyway (some APIs don't set content-type correctly)
        try {
          const data = JSON.parse(text)
          return { ok: true, status: res.status, data }
        } catch {
          console.error(`[GMAIL-FETCH] Non-JSON response: ${text.substring(0, 200)}`)
          return { ok: false, status: res.status, error: text }
        }
      }
    } catch (fetchError) {
      console.error(`[GMAIL-FETCH] Network error on attempt ${attempt + 1}:`, fetchError)
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt + 1) * 1000
        await delay(waitTime)
        continue
      }
      return { ok: false, status: 0, error: "Network error" }
    }
  }

  return { ok: false, status: 429, error: "Rate limit exceeded after max retries" }
}

export async function GET(request: NextRequest) {
  console.log(`[GMAIL-THREADS] ========== BUILD ${API_VERSION} ==========`)
  console.log(`[GMAIL-THREAD-VERIFY] ========== GMAIL THREADS API ${API_VERSION} ==========`)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.log(`[GMAIL-THREAD-VERIFY] No user found`)
    return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
  }

  let channelId: string | null = null

  const { data: adminUser } = await supabase.from("admin_users").select("role").eq("id", user.id).single()

  if (adminUser?.role === "super_admin") {
    console.log(`[GMAIL-THREAD-VERIFY] User is super_admin, getting first active Gmail channel`)
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
    console.log(`[GMAIL-THREAD-VERIFY] No Gmail channel found for user`)
    return NextResponse.json({ error: "Canale Gmail non configurato", debugVersion: API_VERSION }, { status: 404 })
  }

  console.log(`[GMAIL-THREAD-VERIFY] Found channel: ${channelId}`)

  const { token, error: tokenError } = await getValidGmailToken(channelId)
  if (!token) {
    console.log(`[GMAIL-THREAD-VERIFY] Token error: ${tokenError}`)
    return NextResponse.json(
      { error: tokenError || "Token non disponibile", debugVersion: API_VERSION },
      { status: 401 },
    )
  }

  const searchParams = request.nextUrl.searchParams
  const labelId = searchParams.get("labelId") || "INBOX"
  const pageToken = searchParams.get("pageToken") || undefined
  const q = searchParams.get("q") || undefined

  console.log(
    `[GMAIL-THREAD-VERIFY] Fetching Gmail threads: labelId=${labelId}, pageToken=${pageToken ? "present" : "none"}`,
  )

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

    const threadsListResult = await fetchWithRetry(`https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!threadsListResult.ok) {
      console.error(`[GMAIL-THREAD-VERIFY] Gmail API threads.list error: ${threadsListResult.status}`)
      return NextResponse.json(
        {
          error: threadsListResult.error || "Errore Gmail API",
          debugVersion: API_VERSION,
          rateLimited: threadsListResult.status === 429,
        },
        { status: threadsListResult.status || 500 },
      )
    }

    const threadsListData = threadsListResult.data

    console.log(
      `[GMAIL-THREAD-VERIFY] threads.list response: count=${threadsListData.threads?.length || 0}, nextPageToken=${threadsListData.nextPageToken ? "present" : "none"}`,
    )

    const threadIds = threadsListData.threads?.map((t: any) => t.id) || []

    const BATCH_SIZE = 3
    const threadChunks = chunkArray(threadIds, BATCH_SIZE)
    const allThreads: any[] = []
    const dataBugThreads: string[] = []

    for (let i = 0; i < threadChunks.length; i++) {
      const chunk = threadChunks[i]

      const chunkResults = await Promise.all(
        chunk.map(async (threadId: string) => {
          const threadResult = await fetchWithRetry(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
            { headers: { Authorization: `Bearer ${token}` } },
          )

          if (!threadResult.ok) {
            console.error(`[GMAIL-THREAD-VERIFY] thread.get FAILED for ${threadId}: ${threadResult.status}`)
            return null
          }

          const threadData = threadResult.data
          const messages = threadData.messages || []
          const lastMessage = messages[messages.length - 1]

          const headers = lastMessage?.payload?.headers || []
          const getHeader = (name: string) =>
            headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

          const allLabelsSet = new Set<string>()
          const messageIds: string[] = []

          messages.forEach((msg: any) => {
            messageIds.push(msg.id)
            const msgLabels = msg.labelIds || []
            msgLabels.forEach((label: string) => allLabelsSet.add(label))
          })

          const labels = Array.from(allLabelsSet)

          if (labelId && labelId !== "ALL" && labelId !== "INBOX" && !labels.includes(labelId)) {
            labels.push(labelId)
          }

          if (labels.length === 0) {
            console.error(`[GMAIL-THREAD-VERIFY] ❌ DATA BUG: Thread ${threadId} has NO LABELS`)
            dataBugThreads.push(threadId)
          }

          console.log(
            `[GMAIL-THREAD-VERIFY] Thread ${threadId}: messageIds=[${messageIds.join(",")}], labels=[${labels.join(",")}]`,
          )

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
            messageIds,
            subject: getHeader("Subject") || "(nessun oggetto)",
            snippet: lastMessage?.snippet || "",
            from: { name: senderName, email: senderEmail },
            labels,
            isUnread,
            isStarred,
            internalDate,
            date: new Date(internalDate).toISOString(),
            _hasDataBug: labels.length === 0,
          }
        }),
      )

      allThreads.push(...chunkResults)

      if (i < threadChunks.length - 1) {
        await delay(200)
      }
    }

    const validThreads = allThreads
      .filter((t) => t !== null && !t._hasDataBug)
      .sort((a: any, b: any) => b.internalDate - a.internalDate)

    if (dataBugThreads.length > 0) {
      console.error(
        `[GMAIL-THREAD-VERIFY] ⚠️ ${dataBugThreads.length} threads had DATA BUG (no labels) and were excluded: [${dataBugThreads.join(",")}]`,
      )
    }

    console.log(
      `[GMAIL-THREAD-VERIFY] Returning ${validThreads.length} valid threads (${dataBugThreads.length} excluded for DATA BUG)`,
    )

    return NextResponse.json({
      threads: validThreads,
      nextPageToken: threadsListData.nextPageToken || null,
      resultSizeEstimate: threadsListData.resultSizeEstimate || 0,
      debugVersion: API_VERSION,
      _debug: {
        version: API_VERSION,
        rawThreadsCount: threadIds.length,
        processedThreadsCount: validThreads.length,
        dataBugCount: dataBugThreads.length,
        hasNextPage: !!threadsListData.nextPageToken,
        labelId,
      },
    })
  } catch (error) {
    console.error(`[GMAIL-THREAD-VERIFY] Error:`, error)
    return NextResponse.json(
      { error: "Errore durante il recupero dei thread", debugVersion: API_VERSION },
      { status: 500 },
    )
  }
}
