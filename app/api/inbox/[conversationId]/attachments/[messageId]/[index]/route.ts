import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { SUPPORT_ATTACHMENT_BUCKET, type StoredSupportAttachment } from "@/lib/support-attachments"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string; messageId: string; index: string }> },
) {
  const propertyId = await getAuthenticatedPropertyId(request)
  const { conversationId, messageId, index } = await params
  const attachmentIndex = Number(index)
  if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0 || attachmentIndex > 20) {
    return NextResponse.json({ error: "Allegato non valido" }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: message, error } = await supabase
    .from("messages")
    .select("attachments")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("property_id", propertyId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "Impossibile leggere l'allegato" }, { status: 500 })
  if (!message) return NextResponse.json({ error: "Messaggio non trovato" }, { status: 404 })

  const attachments = Array.isArray(message.attachments) ? message.attachments as StoredSupportAttachment[] : []
  const attachment = attachments[attachmentIndex]
  if (!attachment || attachment.bucket !== SUPPORT_ATTACHMENT_BUCKET || !attachment.storage_path) {
    return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 })
  }

  const { data, error: signError } = await supabase.storage
    .from(SUPPORT_ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path, 120, { download: attachment.name })
  if (signError || !data?.signedUrl) return NextResponse.json({ error: "Download non disponibile" }, { status: 500 })

  return NextResponse.redirect(data.signedUrl, 302)
}
