import { type NextRequest, NextResponse } from "next/server"

import { getChatWidgetByPublicKey, listChatWidgets } from "@/lib/chat-widgets/repository"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
import { forwardWebTrafficSetup } from "@/lib/web-traffic/federation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS })
}

function hostOf(value: string | null | undefined): string {
  if (!value) return ""
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "")
  }
}

async function propertyFromSantaddeoHotel(hotelId: string): Promise<string | null> {
  const db = createServiceClient()
  const { data: link } = await db
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", "santaddeo")
    .eq("external_tenant_id", hotelId)
    .maybeSingle()
  if (!link?.customer_account_id) return null

  const { data: account } = await db
    .from("customer_accounts")
    .select("property_id")
    .eq("id", link.customer_account_id)
    .maybeSingle()
  return (account?.property_id as string | null) ?? null
}

async function propertyFromTrackingKey(writeKey: string): Promise<string | null> {
  const db = createServiceClient()
  const { data } = await db
    .from("tracking_sites")
    .select("property_id,is_active")
    .eq("write_key", writeKey)
    .maybeSingle()
  if (!data?.property_id || data.is_active === false) return null
  return data.property_id as string
}

async function santaddeoHotelForProperty(propertyId: string): Promise<string | null> {
  const db = createServiceClient()
  const { data: account } = await db
    .from("customer_accounts")
    .select("id")
    .eq("property_id", propertyId)
    .maybeSingle()
  if (!account?.id) return null

  const { data: link } = await db
    .from("suite_tenant_links")
    .select("external_tenant_id")
    .eq("customer_account_id", account.id)
    .eq("product_key", "santaddeo")
    .maybeSingle()
  return (link?.external_tenant_id as string | null) ?? null
}

async function originAllowed(propertyId: string, origin: string): Promise<boolean> {
  const originHost = hostOf(origin)
  if (!originHost) return true

  const db = createServiceClient()
  const { data: property } = await db
    .from("properties")
    .select("custom_domain, subdomain")
    .eq("id", propertyId)
    .maybeSingle()

  const allowed = new Set<string>()
  const custom = hostOf(property?.custom_domain as string | null)
  if (custom) allowed.add(custom)
  const subdomain = String(property?.subdomain || "").trim().toLowerCase()
  if (subdomain) allowed.add(`${subdomain}.hotelaccelerator.com`)

  const widgets = await listChatWidgets(propertyId).catch(() => [])
  for (const widget of widgets) {
    const host = hostOf(widget.siteUrl)
    if (host) allowed.add(host)
  }

  // Installazioni storiche possono non avere ancora un dominio salvato.
  // In quel caso non blocchiamo il loader; appena esiste almeno un dominio
  // configurato, invece, il manifest viene servito solo a quel sito.
  if (allowed.size === 0) return true
  return allowed.has(originHost)
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const source = q.get("source") || "unknown"
  const origin = q.get("origin") || request.headers.get("origin") || request.headers.get("referer") || ""

  let propertyId = q.get("property_id")?.trim() || ""
  const santaddeoHotelId = q.get("santaddeo_hotel_id")?.trim() || ""
  const chatKey = q.get("chat_key")?.trim() || ""
  const trackingKey = q.get("tracking_key")?.trim() || ""

  if (!propertyId && santaddeoHotelId) {
    propertyId = (await propertyFromSantaddeoHotel(santaddeoHotelId)) || ""
  }

  if (!propertyId && chatKey) {
    const widget = await getChatWidgetByPublicKey(chatKey)
    propertyId = widget?.propertyId || ""
  }

  if (!propertyId && trackingKey) {
    propertyId = (await propertyFromTrackingKey(trackingKey)) || ""
  }

  if (!propertyId) return json({ error: "suite_tenant_not_resolved" }, 404)
  if (!(await originAllowed(propertyId, origin))) return json({ error: "origin_not_allowed" }, 403)

  const db = createServiceClient()
  const [widgets, messagesResult, webTrafficActive] = await Promise.all([
    listChatWidgets(propertyId).catch(() => []),
    db
      .from("message_rules")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("is_active", true),
    isModuleActive(db, propertyId, "web_traffic").catch(() => false),
  ])

  const originHost = hostOf(origin)
  const activeWidgets = widgets.filter((widget) => widget.isActive && widget.publicKey)
  const chat =
    activeWidgets.find((widget) => originHost && hostOf(widget.siteUrl) === originHost) ||
    activeWidgets.find((widget) => !widget.siteUrl) ||
    activeWidgets[0] ||
    null

  let tracking: null | {
    enabled: boolean
    provider: "santaddeo"
    publicToken?: string
    scriptUrl?: string
    alreadyPresent: boolean
  } = null

  if (webTrafficActive) {
    const hotelId = santaddeoHotelId || (await santaddeoHotelForProperty(propertyId)) || ""
    if (hotelId && source === "santaddeo") {
      tracking = { enabled: true, provider: "santaddeo", alreadyPresent: true }
    } else if (hotelId) {
      try {
        const upstream = await forwardWebTrafficSetup(hotelId)
        const setup = upstream.payload as { publicToken?: string; scriptUrl?: string }
        if (upstream.status === 200 && setup.publicToken && setup.scriptUrl) {
          tracking = {
            enabled: true,
            provider: "santaddeo",
            publicToken: setup.publicToken,
            scriptUrl: setup.scriptUrl,
            alreadyPresent: false,
          }
        }
      } catch {
        // Il bootstrap deve continuare con chat/messaggi anche se Santaddeo non risponde.
      }
    }
  }

  return json({
    version: 1,
    propertyId,
    source,
    features: {
      tracking,
      chat: chat ? { enabled: true, publicKey: chat.publicKey, scriptUrl: "/widget/chat.js" } : { enabled: false },
      messages: { enabled: (messagesResult.count ?? 0) > 0 },
    },
  })
}
