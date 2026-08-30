import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createOAuthState, createPkcePair } from "@/lib/social/oauth-state"
import { getMetaGraphVersion, getSocialProvider, isSocialProvider, oauthScopes } from "@/lib/social/providers"

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params
  if (!isSocialProvider(rawProvider)) {
    return NextResponse.json({ error: "Provider social non supportato" }, { status: 404 })
  }

  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const provider = getSocialProvider(rawProvider)
    const state = createOAuthState(provider.id, propertyId)
    const callbackUrl = new URL(`/api/channels/social/${provider.id}/callback`, request.nextUrl.origin).toString()

    let authorizeUrl: URL
    let pkceVerifier: string | null = null

    if (provider.id === "facebook" || provider.id === "instagram") {
      const appId = process.env.META_APP_ID
      if (!appId || !process.env.META_APP_SECRET) {
        return NextResponse.json({ error: "Credenziali Meta non configurate" }, { status: 503 })
      }
      authorizeUrl = new URL(`https://www.facebook.com/${getMetaGraphVersion()}/dialog/oauth`)
      authorizeUrl.searchParams.set("client_id", appId)
      authorizeUrl.searchParams.set("redirect_uri", callbackUrl)
      authorizeUrl.searchParams.set("state", state)
      authorizeUrl.searchParams.set("scope", oauthScopes(provider.id).join(","))
      authorizeUrl.searchParams.set("response_type", "code")
    } else if (provider.id === "x") {
      const clientId = process.env.X_CLIENT_ID
      if (!clientId) return NextResponse.json({ error: "X_CLIENT_ID non configurato" }, { status: 503 })
      const pkce = createPkcePair()
      pkceVerifier = pkce.verifier
      authorizeUrl = new URL("https://x.com/i/oauth2/authorize")
      authorizeUrl.searchParams.set("response_type", "code")
      authorizeUrl.searchParams.set("client_id", clientId)
      authorizeUrl.searchParams.set("redirect_uri", callbackUrl)
      authorizeUrl.searchParams.set("scope", oauthScopes(provider.id).join(" "))
      authorizeUrl.searchParams.set("state", state)
      authorizeUrl.searchParams.set("code_challenge", pkce.challenge)
      authorizeUrl.searchParams.set("code_challenge_method", "S256")
    } else {
      const clientId = process.env.LINKEDIN_CLIENT_ID
      if (!clientId || !process.env.LINKEDIN_CLIENT_SECRET) {
        return NextResponse.json({ error: "Credenziali LinkedIn non configurate" }, { status: 503 })
      }
      authorizeUrl = new URL("https://www.linkedin.com/oauth/v2/authorization")
      authorizeUrl.searchParams.set("response_type", "code")
      authorizeUrl.searchParams.set("client_id", clientId)
      authorizeUrl.searchParams.set("redirect_uri", callbackUrl)
      authorizeUrl.searchParams.set("scope", oauthScopes(provider.id).join(" "))
      authorizeUrl.searchParams.set("state", state)
    }

    const response = NextResponse.redirect(authorizeUrl)
    if (pkceVerifier) {
      response.cookies.set(`ha-social-pkce-${provider.id}`, pkceVerifier, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: `/api/channels/social/${provider.id}/callback`,
        maxAge: 10 * 60,
      })
    }
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connessione OAuth non disponibile"
    const status = message.toLowerCase().includes("autentic") || message.toLowerCase().includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
