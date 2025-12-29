import { createClient } from "@/lib/supabase/server"
import { OAUTH_PROVIDERS } from "@/lib/oauth-config"

interface EmailChannel {
  id: string
  provider: string
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  oauth_expiry: string | null
  property_id: string
  email_address?: string
  display_name?: string
}

/**
 * Gets a valid Gmail access token for the channel, refreshing if expired
 */
export async function getValidGmailToken(channelId: string): Promise<{ token: string | null; error: string | null }> {
  const supabase = await createClient()

  // Get channel with OAuth tokens
  const { data: channel, error } = await supabase
    .from("email_channels")
    .select(
      "id, provider, oauth_access_token, oauth_refresh_token, oauth_expiry, property_id, email_address, display_name",
    )
    .eq("id", channelId)
    .single()

  if (error || !channel) {
    return { token: null, error: "Canale non trovato" }
  }

  if (channel.provider !== "gmail") {
    return { token: null, error: "Il canale non è configurato con Gmail" }
  }

  if (!channel.oauth_access_token) {
    return { token: null, error: "Token OAuth mancante. Riconnetti l'account Gmail." }
  }

  // Check if token is expired (with 5 min buffer)
  const isExpired = channel.oauth_expiry ? new Date(channel.oauth_expiry).getTime() < Date.now() + 5 * 60 * 1000 : true

  if (!isExpired) {
    return { token: channel.oauth_access_token, error: null }
  }

  // Token expired - try to refresh
  if (!channel.oauth_refresh_token) {
    return { token: null, error: "Refresh token mancante. Riconnetti l'account Gmail." }
  }

  console.log("[v0] Gmail token expired, refreshing...")

  const config = OAUTH_PROVIDERS.gmail
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return { token: null, error: "Configurazione OAuth mancante" }
  }

  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: channel.oauth_refresh_token,
        grant_type: "refresh_token",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}))
      console.error("[v0] Gmail token refresh failed:", errorData)
      return { token: null, error: "Token scaduto. Riconnetti l'account Gmail." }
    }

    const tokens = await tokenResponse.json()
    const oauth_expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Update channel with new access token
    const { error: updateError } = await supabase
      .from("email_channels")
      .update({
        oauth_access_token: tokens.access_token,
        oauth_expiry,
        ...(tokens.refresh_token && { oauth_refresh_token: tokens.refresh_token }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", channelId)

    if (updateError) {
      console.error("[v0] Failed to update token in database:", updateError)
      // Still return the new token even if DB update fails
    }

    console.log("[v0] Gmail token refreshed successfully")
    return { token: tokens.access_token, error: null }
  } catch (err) {
    console.error("[v0] Gmail token refresh error:", err)
    return { token: null, error: "Errore durante il refresh del token" }
  }
}

/**
 * Makes a Gmail API request with automatic token refresh
 */
export async function gmailFetch(
  channelId: string,
  endpoint: string,
  options: RequestInit = {},
): Promise<{ data: any | null; error: string | null; status: number }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { data: null, error: error || "Token non disponibile", status: 401 }
  }

  const url = endpoint.startsWith("http") ? endpoint : `https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[v0] Gmail API error (${response.status}):`, errorBody)
    return {
      data: null,
      error: response.status === 401 ? "Token non valido. Riconnetti Gmail." : "Errore API Gmail",
      status: response.status,
    }
  }

  const data = await response.json()
  return { data, error: null, status: response.status }
}

/**
 * Sends an email via Gmail API
 */
export async function sendGmailEmail(
  channelId: string,
  to: string,
  subject: string,
  body: string,
  replyToMessageId?: string,
  threadId?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { success: false, error: error || "Token non disponibile" }
  }

  // Get sender email from channel
  const supabase = await createClient()
  const { data: channel } = await supabase
    .from("email_channels")
    .select("email_address, display_name")
    .eq("id", channelId)
    .single()

  if (!channel?.email_address) {
    return { success: false, error: "Email mittente non configurata" }
  }

  // Build RFC 2822 email message
  const fromHeader = channel.display_name ? `${channel.display_name} <${channel.email_address}>` : channel.email_address

  const headers = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
  ]

  // Add threading headers for replies
  if (replyToMessageId) {
    headers.push(`In-Reply-To: ${replyToMessageId}`)
    headers.push(`References: ${replyToMessageId}`)
  }

  const emailContent = headers.join("\r\n") + "\r\n\r\n" + body

  // Base64 URL-safe encode
  const encodedMessage = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  try {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMessage,
        ...(threadId && { threadId }),
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error("[v0] Gmail send error:", response.status, errorBody)
      return { success: false, error: `Errore invio Gmail: ${response.status}` }
    }

    const data = await response.json()
    console.log("[v0] Email sent successfully via Gmail, messageId:", data.id)
    return { success: true, messageId: data.id }
  } catch (err) {
    console.error("[v0] Gmail send exception:", err)
    return { success: false, error: "Errore durante l'invio dell'email" }
  }
}

/**
 * Modifies Gmail message labels (add/remove)
 */
export async function modifyGmailMessage(
  channelId: string,
  messageId: string,
  addLabels: string[] = [],
  removeLabels: string[] = [],
): Promise<{ success: boolean; error?: string }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { success: false, error: error || "Token non disponibile" }
  }

  try {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        addLabelIds: addLabels,
        removeLabelIds: removeLabels,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error("[v0] Gmail modify error:", response.status, errorBody)
      return { success: false, error: `Errore Gmail API: ${response.status}` }
    }

    return { success: true }
  } catch (err) {
    console.error("[v0] Gmail modify exception:", err)
    return { success: false, error: "Errore durante la modifica del messaggio" }
  }
}

/**
 * Marks a Gmail message as read
 */
export async function markGmailAsRead(
  channelId: string,
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  return modifyGmailMessage(channelId, messageId, [], ["UNREAD"])
}

/**
 * Marks a Gmail message as unread
 */
export async function markGmailAsUnread(
  channelId: string,
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  return modifyGmailMessage(channelId, messageId, ["UNREAD"], [])
}

/**
 * Stars a Gmail message
 */
export async function starGmailMessage(
  channelId: string,
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  return modifyGmailMessage(channelId, messageId, ["STARRED"], [])
}

/**
 * Unstars a Gmail message
 */
export async function unstarGmailMessage(
  channelId: string,
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  return modifyGmailMessage(channelId, messageId, [], ["STARRED"])
}

/**
 * Archives a Gmail message (removes from INBOX)
 */
export async function archiveGmailMessage(
  channelId: string,
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  return modifyGmailMessage(channelId, messageId, [], ["INBOX"])
}

/**
 * Moves a Gmail message to trash
 */
export async function trashGmailMessage(
  channelId: string,
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { success: false, error: error || "Token non disponibile" }
  }

  try {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return { success: false, error: `Errore Gmail API: ${response.status}` }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: "Errore durante lo spostamento nel cestino" }
  }
}

/**
 * Restores a Gmail message from trash
 */
export async function untrashGmailMessage(
  channelId: string,
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { success: false, error: error || "Token non disponibile" }
  }

  try {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/untrash`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return { success: false, error: `Errore Gmail API: ${response.status}` }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: "Errore durante il ripristino dal cestino" }
  }
}

/**
 * Moves a Gmail message to spam
 */
export async function spamGmailMessage(
  channelId: string,
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  return modifyGmailMessage(channelId, messageId, ["SPAM"], ["INBOX"])
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Gets Gmail labels with unread counts - OPTIMIZED to avoid rate limiting
 */
export async function getGmailLabelsWithCounts(channelId: string): Promise<{
  labels: Array<{
    id: string
    name: string
    type: string
    messagesTotal?: number
    messagesUnread?: number
    threadsTotal?: number
    threadsUnread?: number
    color?: { backgroundColor?: string; textColor?: string }
  }>
  error?: string
}> {
  const { data, error } = await gmailFetch(channelId, "labels")

  if (error || !data?.labels) {
    return { labels: [], error: error || "Errore caricamento etichette" }
  }

  const essentialSystemLabelIds = ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "STARRED", "UNREAD"]

  const systemLabels = data.labels.filter((l: any) => l.type === "system")
  const userLabels = data.labels.filter((l: any) => l.type === "user")

  // Only fetch details for essential system labels
  const labelsToFetchDetails = [
    ...systemLabels.filter((l: any) => essentialSystemLabelIds.includes(l.id)),
    ...userLabels.slice(0, 20), // Limit user labels to first 20 to avoid rate limiting
  ]

  const labelsWithCounts: any[] = []

  const BATCH_SIZE = 3
  const labelChunks = chunkArray(labelsToFetchDetails, BATCH_SIZE)

  for (let i = 0; i < labelChunks.length; i++) {
    const chunk = labelChunks[i]

    const chunkResults = await Promise.all(
      chunk.map(async (label: any) => {
        const { data: labelData } = await gmailFetch(channelId, `labels/${label.id}`)
        return {
          id: label.id,
          name: label.name,
          type: label.type,
          messagesTotal: labelData?.messagesTotal || 0,
          messagesUnread: labelData?.messagesUnread || 0,
          threadsTotal: labelData?.threadsTotal || 0,
          threadsUnread: labelData?.threadsUnread || 0,
          color: labelData?.color,
        }
      }),
    )

    labelsWithCounts.push(...chunkResults)

    // Add delay between batches to avoid rate limiting
    if (i < labelChunks.length - 1) {
      await delay(200)
    }
  }

  const fetchedIds = new Set(labelsWithCounts.map((l) => l.id))
  const remainingSystemLabels = systemLabels
    .filter((l: any) => !fetchedIds.has(l.id))
    .map((l: any) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      messagesTotal: 0,
      messagesUnread: 0,
      threadsTotal: 0,
      threadsUnread: 0,
    }))

  // Add remaining user labels without counts
  const remainingUserLabels = userLabels.slice(20).map((l: any) => ({
    id: l.id,
    name: l.name,
    type: "user",
    messagesTotal: 0,
    messagesUnread: 0,
    threadsTotal: 0,
    threadsUnread: 0,
  }))

  return {
    labels: [...labelsWithCounts, ...remainingSystemLabels, ...remainingUserLabels],
  }
}
