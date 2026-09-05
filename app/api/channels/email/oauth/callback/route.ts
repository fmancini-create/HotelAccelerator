import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { OAUTH_PROVIDERS, type OAuthProvider, getOAuthRedirectUri } from "@/lib/oauth-config"
import { EmailChannelService } from "@/lib/platform-services"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { ConflictError } from "@/lib/errors"

function fromBase64Url(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const pad = base64.length % 4
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64
  return Buffer.from(padded, "base64").toString()
}

function isCalendarOAuthState(state: string | null): state is string {
  // Email OAuth state is a single base64url payload. Calendar OAuth state is
  // HMAC-signed as <payload>.<signature>, so the dot safely distinguishes it.
  return Boolean(state?.includes("."))
}

function forwardCalendarOAuth(
  request: NextRequest,
  state: string,
  code: string | null,
  error: string | null,
) {
  const target = new URL("/api/admin/crm/calendar/oauth/google/callback", request.url)
  target.searchParams.set("state", state)
  if (code) target.searchParams.set("code", code)
  if (error) target.searchParams.set("error", error)
  return NextResponse.redirect(target)
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  // Google Cloud already authorizes this callback for Gmail. Calendar OAuth
  // intentionally reuses it, then gets forwarded to its dedicated handler.
  if (isCalendarOAuthState(state)) {
    return forwardCalendarOAuth(request, state, code, error)
  }

  if (error) {
    return NextResponse.redirect(new URL(`/admin/channels/email?error=${encodeURIComponent(error)}`, request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin/channels/email?error=missing_params", request.url))
  }

  try {
    const stateData = JSON.parse(fromBase64Url(state))
    const { property_id, provider } = stateData as {
      property_id: string
      provider: OAuthProvider
    }

    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      return NextResponse.redirect(new URL("/admin/channels/email?error=state_expired", request.url))
    }

    // Il tenant scritto nello state non e' una fonte autorizzativa: arriva dal
    // browser ed e' modificabile. Dopo il ritorno da Google deve coincidere con
    // il tenant autenticato (compreso il cookie scelto dal superadmin).
    const authenticatedPropertyId = await getAuthenticatedPropertyId(request)
    if (authenticatedPropertyId !== property_id) {
      return NextResponse.redirect(new URL("/admin/channels/email?error=tenant_mismatch", request.url))
    }

    const clientId = provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID
    const clientSecret = provider === "gmail" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL("/admin/channels/email?error=config_missing", request.url))
    }

    const config = OAUTH_PROVIDERS[provider]
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: getOAuthRedirectUri(provider),
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Token exchange failed:", errorData)
      return NextResponse.redirect(new URL("/admin/channels/email?error=token_exchange_failed", request.url))
    }

    const tokens = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokens

    let userEmail: string

    if (provider === "gmail") {
      const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      const profile = await profileResponse.json()
      userEmail = profile.email
    } else {
      const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      const profile = await profileResponse.json()
      userEmail = profile.mail || profile.userPrincipalName
    }

    if (!userEmail) {
      return NextResponse.redirect(new URL("/admin/channels/email?error=email_not_found", request.url))
    }

    const supabase = await createClient()
    const service = new EmailChannelService(supabase)

    const channel = await service.upsertOAuthChannel(
      authenticatedPropertyId,
      provider,
      userEmail,
      access_token,
      refresh_token,
      expires_in,
    )

    const destination = new URL("/admin/channels/email", request.url)
    destination.searchParams.set("success", "connected")
    if (provider === "gmail") destination.searchParams.set("initial_sync", channel.id)
    return NextResponse.redirect(destination)
  } catch (error) {
    if (error instanceof ConflictError) {
      // Il dettaglio viene mostrato nella pagina Canali, non nel log: il
      // conflitto e' gestito e non deve rivelare il tenant proprietario.
      return NextResponse.redirect(new URL("/admin/channels/email?error=email_already_connected", request.url))
    }
    console.error("OAuth callback error:", error)
    return NextResponse.redirect(new URL("/admin/channels/email?error=callback_failed", request.url))
  }
}
