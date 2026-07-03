import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptChannelSecrets } from "@/lib/email/channel-secrets"
import { encryptSecret } from "@/lib/crypto/secrets"
import { OAUTH_PROVIDERS } from "@/lib/oauth-config"

// Esito del rinnovo/registrazione di una Gmail watch (Pub/Sub push).
export type GmailWatchResult = {
  channelId: string
  email?: string
  success: boolean
  expiration?: string
  historyId?: string
  error?: string
}

/**
 * Refresh in-process del token OAuth Gmail per un canale.
 *
 * Sostituisce il vecchio self-fetch a `/api/channels/email/oauth/refresh`
 * (che richiedeva una sessione utente): la logica gira qui, direttamente sul
 * client Supabase passato, così può essere usata sia da route autenticate sia
 * da cron con service client. Ritorna il nuovo access token in chiaro, oppure
 * null se il refresh fallisce.
 */
async function refreshGmailToken(
  supabase: SupabaseClient,
  channelId: string,
  refreshToken: string | null | undefined,
): Promise<string | null> {
  if (!refreshToken) return null

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const config = OAUTH_PROVIDERS.gmail

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!tokenResponse.ok) return null

  const tokens = await tokenResponse.json()
  const oauth_expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // WRITE-ENCRYPT: cifra i token prima del salvataggio (coerente con la route
  // di refresh e col resto della pipeline email).
  await supabase
    .from("email_channels")
    .update({
      oauth_access_token: encryptSecret(tokens.access_token),
      oauth_expiry,
      ...(tokens.refresh_token && { oauth_refresh_token: encryptSecret(tokens.refresh_token) }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", channelId)

  return tokens.access_token
}

/**
 * Registra/rinnova la Gmail watch (Pub/Sub push) per un singolo canale,
 * interamente in-process. Nessun self-fetch, nessuna dipendenza dalla sessione
 * HTTP: accetta qualunque client Supabase (user-scoped o service).
 *
 * Il chiamante è responsabile dell'autorizzazione:
 *  - route utente: passa il client user-scoped dopo il controllo accesso;
 *  - cron: passa il service client.
 */
export async function renewGmailWatch(
  supabase: SupabaseClient,
  channelId: string,
): Promise<GmailWatchResult> {
  const { data: rawChannel, error: channelError } = await supabase
    .from("email_channels")
    .select("*")
    .eq("id", channelId)
    .single()

  if (channelError || !rawChannel) {
    return { channelId, success: false, error: "Canale non trovato" }
  }

  // DUAL-READ: tollera segreti legacy in chiaro e valori cifrati `enc:v1:...`.
  const channel = decryptChannelSecrets(rawChannel)

  if (channel.provider !== "gmail") {
    return { channelId, email: channel.email_address, success: false, error: "Push notifications solo per Gmail" }
  }

  let accessToken: string | undefined = channel.oauth_access_token

  // Refresh del token se scaduto (in-process).
  if (channel.oauth_expiry && new Date(channel.oauth_expiry) < new Date()) {
    const refreshed = await refreshGmailToken(supabase, channelId, channel.oauth_refresh_token)
    if (!refreshed) {
      return {
        channelId,
        email: channel.email_address,
        success: false,
        error: "Token scaduto. Ricollegare l'account.",
      }
    }
    accessToken = refreshed
  }

  const watchResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName: process.env.GOOGLE_PUBSUB_TOPIC,
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    }),
  })

  if (!watchResponse.ok) {
    let details: string | undefined
    try {
      const errorData = await watchResponse.json()
      details = errorData?.error?.message
    } catch {
      details = `HTTP ${watchResponse.status}`
    }
    return { channelId, email: channel.email_address, success: false, error: details || "Errore watch" }
  }

  const watchData = await watchResponse.json()
  // watchData: { historyId, expiration } — expiration è Unix ms.
  const expirationDate = new Date(Number.parseInt(watchData.expiration))

  await supabase
    .from("email_channels")
    .update({
      push_enabled: true,
      gmail_watch_expiration: expirationDate.toISOString(),
      gmail_history_id: Number.parseInt(watchData.historyId),
      updated_at: new Date().toISOString(),
    })
    .eq("id", channelId)

  return {
    channelId,
    email: channel.email_address,
    success: true,
    expiration: expirationDate.toISOString(),
    historyId: watchData.historyId,
  }
}
