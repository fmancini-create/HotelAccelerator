import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { verifyOAuthState } from "@/lib/social/oauth-state"
import { getMetaGraphVersion, getSocialProvider, isSocialProvider } from "@/lib/social/providers"
import { upsertSocialAccount } from "@/lib/social/store"

function redirectResult(request: NextRequest, provider: string, params: Record<string, string>) {
  const url = new URL(`/admin/channels/${provider === "x" ? "twitter" : provider}`, request.nextUrl.origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

async function exchangeMeta(code: string, redirectUri: string) {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) throw new Error("Credenziali Meta non configurate")
  const url = new URL(`https://graph.facebook.com/${getMetaGraphVersion()}/oauth/access_token`)
  url.searchParams.set("client_id", appId)
  url.searchParams.set("client_secret", appSecret)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("code", code)
  const response = await fetch(url, { cache: "no-store" })
  const data = (await response.json()) as { access_token?: string; error?: { message?: string } }
  if (!response.ok || !data.access_token) throw new Error(data.error?.message || "Token Meta non ottenuto")
  return data.access_token
}

async function connectMeta(provider: "facebook" | "instagram", propertyId: string, userToken: string) {
  const version = getMetaGraphVersion()
  const fields = provider === "facebook"
    ? "id,name,access_token"
    : "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}"
  const url = new URL(`https://graph.facebook.com/${version}/me/accounts`)
  url.searchParams.set("fields", fields)
  url.searchParams.set("access_token", userToken)
  const response = await fetch(url, { cache: "no-store" })
  const body = (await response.json()) as {
    data?: Array<{
      id: string
      name?: string
      access_token?: string
      instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string }
    }>
    error?: { message?: string }
  }
  if (!response.ok) throw new Error(body.error?.message || "Account Meta non leggibili")

  let connected = 0
  for (const page of body.data || []) {
    const pageToken = page.access_token || userToken
    if (provider === "facebook") {
      await upsertSocialAccount(propertyId, {
        provider,
        channelType: "messenger",
        externalAccountId: page.id,
        displayName: `Facebook · ${page.name || page.id}`,
        config: {
          page_id: page.id,
          page_name: page.name || null,
          capabilities: { direct_messages: true, comments: true },
          webhook_fields: ["messages", "messaging_postbacks", "feed"],
        },
        credentials: { access_token: pageToken },
      })
      connected += 1
      continue
    }

    const ig = page.instagram_business_account
    if (!ig?.id) continue
    await upsertSocialAccount(propertyId, {
      provider,
      channelType: "instagram",
      externalAccountId: ig.id,
      displayName: `Instagram · @${ig.username || ig.name || ig.id}`,
      config: {
        instagram_business_account_id: ig.id,
        page_id: page.id,
        username: ig.username || null,
        profile_picture_url: ig.profile_picture_url || null,
        capabilities: { direct_messages: true, mentions: true, comments: true },
        webhook_fields: ["messages", "messaging_postbacks", "comments", "mentions"],
      },
      credentials: { access_token: pageToken },
    })
    connected += 1
  }
  return connected
}

async function exchangeX(code: string, verifier: string, redirectUri: string) {
  const clientId = process.env.X_CLIENT_ID
  if (!clientId) throw new Error("X_CLIENT_ID non configurato")
  const params = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: verifier,
    client_id: clientId,
  })
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" }
  if (process.env.X_CLIENT_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${process.env.X_CLIENT_SECRET}`).toString("base64")}`
  }
  const response = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers, body: params })
  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    scope?: string
    expires_in?: number
    error_description?: string
  }
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Token X non ottenuto")
  return data
}

async function connectX(propertyId: string, token: { access_token?: string; refresh_token?: string; scope?: string; expires_in?: number }) {
  if (!token.access_token) throw new Error("Token X mancante")
  const response = await fetch("https://api.x.com/2/users/me?user.fields=name,username,profile_image_url", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  })
  const body = (await response.json()) as { data?: { id: string; name?: string; username?: string; profile_image_url?: string }; detail?: string }
  if (!response.ok || !body.data?.id) throw new Error(body.detail || "Profilo X non leggibile")
  const granted = new Set((token.scope || "").split(/\s+/).filter(Boolean))
  const dmEnabled = granted.has("dm.read") && granted.has("dm.write")
  await upsertSocialAccount(propertyId, {
    provider: "x",
    channelType: "x",
    externalAccountId: body.data.id,
    displayName: `X · @${body.data.username || body.data.name || body.data.id}`,
    config: {
      username: body.data.username || null,
      profile_image_url: body.data.profile_image_url || null,
      oauth_scope: Array.from(granted),
      capabilities: { mentions: true, direct_messages: dmEnabled },
      direct_messages_enabled: dmEnabled,
      token_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
    },
    credentials: { access_token: token.access_token, refresh_token: token.refresh_token },
  })
  return 1
}

async function exchangeLinkedIn(code: string, redirectUri: string) {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("Credenziali LinkedIn non configurate")
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })
  const data = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string }
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Token LinkedIn non ottenuto")
  return data
}

function organizationIdFromAcl(element: Record<string, unknown>): string | null {
  const target = String(element.organizationTarget || element.organization || element.organizationUrn || "")
  const match = target.match(/urn:li:organization:(\d+)/)
  return match?.[1] || null
}

async function connectLinkedIn(propertyId: string, token: { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }) {
  if (!token.access_token) throw new Error("Token LinkedIn mancante")
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    "X-Restli-Protocol-Version": "2.0.0",
  }
  const aclResponse = await fetch("https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED", { headers, cache: "no-store" })
  const aclBody = (await aclResponse.json()) as { elements?: Record<string, unknown>[]; message?: string }
  if (!aclResponse.ok) throw new Error(aclBody.message || "Organizzazioni LinkedIn non leggibili: verifica Community Management")

  let connected = 0
  const seen = new Set<string>()
  for (const acl of aclBody.elements || []) {
    const organizationId = organizationIdFromAcl(acl)
    if (!organizationId || seen.has(organizationId)) continue
    seen.add(organizationId)
    let name = organizationId
    try {
      const orgResponse = await fetch(`https://api.linkedin.com/v2/organizations/${organizationId}`, { headers, cache: "no-store" })
      if (orgResponse.ok) {
        const org = (await orgResponse.json()) as { localizedName?: string; vanityName?: string }
        name = org.localizedName || org.vanityName || organizationId
      }
    } catch {}
    await upsertSocialAccount(propertyId, {
      provider: "linkedin",
      channelType: "linkedin",
      externalAccountId: organizationId,
      displayName: `LinkedIn · ${name}`,
      config: {
        organization_id: organizationId,
        organization_urn: `urn:li:organization:${organizationId}`,
        oauth_scope: (token.scope || "").split(/\s+/).filter(Boolean),
        capabilities: { posts: true, comments: true, reactions: true, direct_messages: false },
        community_management_required: true,
        direct_messages_supported: false,
        token_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      },
      credentials: { access_token: token.access_token, refresh_token: token.refresh_token },
    })
    connected += 1
  }
  return connected
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params
  if (!isSocialProvider(rawProvider)) return NextResponse.json({ error: "Provider non supportato" }, { status: 404 })

  const provider = getSocialProvider(rawProvider)
  const errorParam = request.nextUrl.searchParams.get("error_description") || request.nextUrl.searchParams.get("error")
  if (errorParam) return redirectResult(request, provider.id, { error: errorParam })

  try {
    const code = request.nextUrl.searchParams.get("code")
    const stateRaw = request.nextUrl.searchParams.get("state")
    if (!code || !stateRaw) throw new Error("Callback OAuth incompleta")
    const state = verifyOAuthState(stateRaw)
    if (state.provider !== provider.id) throw new Error("Provider OAuth non coerente")
    const propertyId = await getAuthenticatedPropertyId(request)
    if (propertyId !== state.propertyId) throw new Error("Tenant OAuth non coerente")
    const redirectUri = new URL(`/api/channels/social/${provider.id}/callback`, request.nextUrl.origin).toString()

    let connected = 0
    if (provider.id === "facebook" || provider.id === "instagram") {
      const token = await exchangeMeta(code, redirectUri)
      connected = await connectMeta(provider.id, propertyId, token)
    } else if (provider.id === "x") {
      const verifier = request.cookies.get("ha-social-pkce-x")?.value
      if (!verifier) throw new Error("PKCE X scaduto: ripeti la connessione")
      const token = await exchangeX(code, verifier, redirectUri)
      connected = await connectX(propertyId, token)
    } else {
      const token = await exchangeLinkedIn(code, redirectUri)
      connected = await connectLinkedIn(propertyId, token)
    }

    if (connected === 0) {
      const message = provider.id === "instagram"
        ? "Nessun profilo Instagram Business collegato alle Pagine autorizzate"
        : provider.id === "linkedin"
          ? "Nessuna Pagina LinkedIn amministrata trovata: verifica approvazione Community Management"
          : "Nessun account autorizzato trovato"
      return redirectResult(request, provider.id, { error: message })
    }
    const response = redirectResult(request, provider.id, { connected: String(connected) })
    if (provider.id === "x") response.cookies.delete("ha-social-pkce-x")
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connessione OAuth fallita"
    return redirectResult(request, provider.id, { error: message })
  }
}
