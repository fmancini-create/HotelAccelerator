// OAuth Configuration for Gmail and Outlook
// Supports property_id isolation

export const OAUTH_PROVIDERS = {
  gmail: {
    name: "Gmail",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    apiBase: "https://gmail.googleapis.com/gmail/v1",
  },
  outlook: {
    name: "Outlook",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "https://graph.microsoft.com/Mail.Read",
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/User.Read",
      "offline_access",
    ],
    apiBase: "https://graph.microsoft.com/v1.0",
  },
} as const

export type OAuthProvider = keyof typeof OAUTH_PROVIDERS

export function getOAuthRedirectUri(provider: OAuthProvider): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${baseUrl}/api/channels/email/oauth/callback`
}

export function buildOAuthUrl(provider: OAuthProvider, state: string, clientId: string): string {
  const config = OAUTH_PROVIDERS[provider]
  const redirectUri = getOAuthRedirectUri(provider)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  })

  return `${config.authUrl}?${params.toString()}`
}
