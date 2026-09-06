import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getWhatsAppChannelByPhoneNumberId } from "@/lib/whatsapp/channels"
import { getGraphVersion } from "@/lib/whatsapp/types"
import { getPlatformWhatsAppConfig } from "@/lib/whatsapp/platform"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const BUCKET = "support-private"
const MAX_MEDIA_BYTES = 25 * 1024 * 1024

function accessToken(channel: Awaited<ReturnType<typeof getWhatsAppChannelByPhoneNumberId>>) {
  return channel?.credentials?.access_token || getPlatformWhatsAppConfig().systemUserToken || ""
}

function safeMime(value: string | null) {
  const mime = (value || "application/octet-stream").split(";")[0].trim().toLowerCase()
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime) ? mime : "application/octet-stream"
}

function extensionForMime(mime: string) {
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  if (mime === "image/heic") return "heic"
  if (mime === "image/heif") return "heif"
  return "bin"
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phoneNumberId: string; mediaId: string }> },
) {
  const propertyId = await getAuthenticatedPropertyId(request)
  const { phoneNumberId, mediaId } = await params
  if (!phoneNumberId || !mediaId) return NextResponse.json({ error: "Media non valido" }, { status: 400 })

  const supabase = createServiceClient()
  const channel = await getWhatsAppChannelByPhoneNumberId(supabase, phoneNumberId)
  if (!channel || channel.property_id !== propertyId) {
    return NextResponse.json({ error: "Media non disponibile" }, { status: 404 })
  }

  const token = accessToken(channel)
  if (!token) return NextResponse.json({ error: "Credenziali WhatsApp mancanti" }, { status: 503 })

  const prefix = `${propertyId}/whatsapp/${channel.id}/${mediaId}`
  const { data: cached } = await supabase.storage.from(BUCKET).list(`${propertyId}/whatsapp/${channel.id}`, {
    search: mediaId,
    limit: 5,
  })
  const cachedFile = cached?.find((item) => item.name.startsWith(mediaId + "."))
  if (cachedFile) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(`${propertyId}/whatsapp/${channel.id}/${cachedFile.name}`, 120)
    if (data?.signedUrl) return NextResponse.redirect(data.signedUrl, 302)
  }

  const version = getGraphVersion(channel.config)
  const metaRes = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(phoneNumberId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  const metaJson = await metaRes.json().catch(() => null)
  const mediaUrl = typeof metaJson?.url === "string" ? metaJson.url : ""
  if (!metaRes.ok || !mediaUrl) {
    return NextResponse.json({ error: "Media WhatsApp non recuperabile" }, { status: 502 })
  }

  const binaryRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!binaryRes.ok) return NextResponse.json({ error: "Download media WhatsApp fallito" }, { status: 502 })

  const declared = Number(binaryRes.headers.get("content-length") || 0)
  if (declared > MAX_MEDIA_BYTES) return NextResponse.json({ error: "Media troppo grande" }, { status: 413 })

  const bytes = new Uint8Array(await binaryRes.arrayBuffer())
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "Media troppo grande o vuoto" }, { status: 413 })
  }

  const mime = safeMime(binaryRes.headers.get("content-type") || metaJson?.mime_type || null)
  const storagePath = `${prefix}.${extensionForMime(mime)}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: true,
  })
  if (uploadError) {
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=60",
      },
    })
  }

  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 120)
  if (data?.signedUrl) return NextResponse.redirect(data.signedUrl, 302)

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=60",
    },
  })
}
