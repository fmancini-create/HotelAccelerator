import { createClient } from "@/lib/supabase/server"
import { OAUTH_PROVIDERS } from "@/lib/oauth-config"

interface EmailChannel {
  id: string
  provider: string
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  oauth_expiry: string | null
  property_id: string
}

/**
 * Gets a valid Gmail access token for the channel, refreshing if expired
 */
export async function getValidGmailToken(channelId: string): Promise<{ token: string | null; error: string | null }> {
  const supabase = await createClient()

  // Get channel with OAuth tokens
  const { data: channel, error } = await supabase
    .from("email_channels")
    .select("id, provider, oauth_access_token, oauth_refresh_token, oauth_expiry, property_id")
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
