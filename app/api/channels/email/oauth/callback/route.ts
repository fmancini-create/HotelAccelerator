import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { OAUTH_PROVIDERS, type OAuthProvider, getOAuthRedirectUri } from "@/lib/oauth-config"
import { EmailChannelService } from "@/lib/platform-services"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    return NextResponse.redirect(new URL(`/admin/channels/email?error=${encodeURIComponent(error)}`, request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin/channels/email?error=missing_params", request.url))
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString())
    const { property_id, provider } = stateData as {
      property_id: string
      provider: OAuthProvider
    }

    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      return NextResponse.redirect(new URL("/admin/channels/email?error=state_expired", request.url))
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

    await service.upsertOAuthChannel(property_id, provider, userEmail, access_token, refresh_token, expires_in)

    return NextResponse.redirect(new URL("/admin/channels/email?success=connected", request.url))
  } catch (error) {
    console.error("OAuth callback error:", error)
    return NextResponse.redirect(new URL("/admin/channels/email?error=callback_failed", request.url))
  }
}
