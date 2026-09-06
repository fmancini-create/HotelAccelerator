import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { richiediOperatore } from "@/lib/inbox/identity"
import { getWhatsAppChannelById } from "@/lib/whatsapp/channels"
import {
  expectedOutboundStagingPrefix,
  validateWhatsAppOutboundMedia,
  WHATSAPP_OUTBOUND_BUCKET,
} from "@/lib/whatsapp/outbound-media"

export const runtime = "nodejs"

interface UploadRequest {
  channelId?: string
  name?: string
  mimeType?: string
  size?: number
}

function safeFilename(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
  return cleaned.slice(0, 120) || "media"
}

export async function POST(request: NextRequest) {
  try {
    const operatore = await richiediOperatore(request)
    const propertyId = operatore.propertyId
    const payload = (await request.json()) as UploadRequest
    const channelId = payload.channelId?.trim() || ""
    const name = payload.name?.trim() || "media"
    const mimeType = payload.mimeType?.trim() || ""
    const size = Number(payload.size || 0)

    if (!channelId) {
      return NextResponse.json({ error: "Seleziona il numero WhatsApp da usare." }, { status: 400 })
    }

    const validation = validateWhatsAppOutboundMedia(name, mimeType, size)
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })

    const supabase = createServiceClient()
    const channel = await getWhatsAppChannelById(supabase, propertyId, channelId)
    if (!channel) {
      return NextResponse.json({ error: "Canale WhatsApp non disponibile per questa struttura." }, { status: 404 })
    }

    const path = `${expectedOutboundStagingPrefix(propertyId, channel.id)}${crypto.randomUUID()}-${safeFilename(name)}`
    const { data, error } = await supabase.storage
      .from(WHATSAPP_OUTBOUND_BUCKET)
      .createSignedUploadUrl(path, { upsert: false })

    if (error || !data?.token) {
      console.error("[WhatsApp media upload] signed URL error:", error)
      return NextResponse.json({ error: "Impossibile preparare l'upload dell'allegato WhatsApp." }, { status: 500 })
    }

    return NextResponse.json({
      path,
      token: data.token,
      bucket: WHATSAPP_OUTBOUND_BUCKET,
      kind: validation.kind,
      mimeType: validation.mimeType,
    })
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500
    console.error("[WhatsApp media upload] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante la preparazione dell'allegato WhatsApp." },
      { status },
    )
  }
}
