import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { verifyAdvertisingOAuthState } from "@/lib/advertising/oauth-state"
import { isAdvertisingProvider } from "@/lib/advertising/types"
import { connectAdvertisingProvider, exchangeAdvertisingCode } from "@/lib/advertising/provider-client"

function redirectToAds(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/marketing/ads", request.nextUrl.origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params
  if (!isAdvertisingProvider(rawProvider)) {
    return NextResponse.json({ error: "Provider advertising non supportato" }, { status: 404 })
  }

  const providerError =
    request.nextUrl.searchParams.get("error_description") ||
    request.nextUrl.searchParams.get("error_message") ||
    request.nextUrl.searchParams.get("error")
  if (providerError) return redirectToAds(request, { provider: rawProvider, error: providerError })

  try {
    await requireAreaApi("marketing", request)
    const code = request.nextUrl.searchParams.get("code") || request.nextUrl.searchParams.get("auth_code")
    const rawState = request.nextUrl.searchParams.get("state")
    if (!code || !rawState) throw new Error("Callback OAuth advertising incompleta")

    const state = verifyAdvertisingOAuthState(rawState)
    if (state.provider !== rawProvider) throw new Error("Provider OAuth advertising non coerente")

    const propertyId = await getAuthenticatedPropertyId(request)
    if (propertyId !== state.propertyId) throw new Error("Tenant OAuth advertising non coerente")

    const redirectUri = new URL(
      `/api/admin/marketing/ads/connect/${rawProvider}/callback`,
      request.nextUrl.origin,
    ).toString()
    const token = await exchangeAdvertisingCode(rawProvider, code, redirectUri)
    const result = await connectAdvertisingProvider(propertyId, rawProvider, token)

    if (result.connected === 0) {
      return redirectToAds(request, {
        provider: rawProvider,
        error: "Nessun account pubblicitario autorizzato trovato",
      })
    }

    return redirectToAds(request, {
      provider: rawProvider,
      connected: String(result.connected),
      imported: String(result.campaigns),
      metrics: String(result.metrics),
      sync_errors: String(result.syncErrors.length),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connessione advertising fallita"
    return redirectToAds(request, { provider: rawProvider, error: message })
  }
}
