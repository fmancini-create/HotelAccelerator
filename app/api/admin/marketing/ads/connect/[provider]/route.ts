import { type NextRequest, NextResponse } from "next/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { createAdvertisingOAuthState } from "@/lib/advertising/oauth-state"
import { isAdvertisingProvider } from "@/lib/advertising/types"

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    await requireAreaApi("marketing", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const { provider: rawProvider } = await context.params
    if (!isAdvertisingProvider(rawProvider)) return NextResponse.json({ error: "Provider non supportato" }, { status: 404 })

    const callback = new URL(`/api/admin/marketing/ads/connect/${rawProvider}/callback`, request.nextUrl.origin).toString()
    const state = createAdvertisingOAuthState(rawProvider, propertyId)
    let target: URL

    if (rawProvider === "google") {
      const clientId = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
      if (!clientId || !(process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET) || !process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
        return NextResponse.json({ error: "Credenziali Google Ads non configurate" }, { status: 503 })
      }
      target = new URL("https://accounts.google.com/o/oauth2/v2/auth")
      target.searchParams.set("client_id", clientId)
      target.searchParams.set("redirect_uri", callback)
      target.searchParams.set("response_type", "code")
      target.searchParams.set("scope", "https://www.googleapis.com/auth/adwords")
      target.searchParams.set("access_type", "offline")
      target.searchParams.set("prompt", "consent")
      target.searchParams.set("state", state)
    } else if (rawProvider === "meta") {
      const appId = process.env.META_APP_ID
      if (!appId || !process.env.META_APP_SECRET) {
        return NextResponse.json({ error: "Credenziali Meta non configurate" }, { status: 503 })
      }
      const version = process.env.META_GRAPH_VERSION || "v26.0"
      target = new URL(`https://www.facebook.com/${version}/dialog/oauth`)
      target.searchParams.set("client_id", appId)
      target.searchParams.set("redirect_uri", callback)
      target.searchParams.set("response_type", "code")
      target.searchParams.set("scope", "ads_read,ads_management,business_management")
      target.searchParams.set("state", state)
    } else {
      const appId = process.env.TIKTOK_ADS_APP_ID || process.env.TIKTOK_APP_ID
      const secret = process.env.TIKTOK_ADS_APP_SECRET || process.env.TIKTOK_APP_SECRET
      if (!appId || !secret) return NextResponse.json({ error: "Credenziali TikTok Ads non configurate" }, { status: 503 })
      target = new URL("https://ads.tiktok.com/marketing_api/auth")
      target.searchParams.set("app_id", appId)
      target.searchParams.set("redirect_uri", callback)
      target.searchParams.set("state", state)
    }

    return NextResponse.redirect(target)
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Connessione advertising non disponibile"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
