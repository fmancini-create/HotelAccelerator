import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"

export const SUPPORT_ATTACHMENT_BUCKET = "support-private"
export const SUPPORT_ATTACHMENT_MAX_FILES = 5
export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const SUPPORT_ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024

export const SUPPORT_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

export interface StoredSupportAttachment {
  id: string
  name: string
  mime_type: string
  size_bytes: number
  storage_path: string
  bucket: typeof SUPPORT_ATTACHMENT_BUCKET
}

export interface FederatedSupportAttachment {
  id: string
  name: string
  mime_type: string
  size_bytes: number
  source_url: string
}

export function safeSupportFileName(name: string) {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\\/\0\r\n\t]+/g, "-")
    .replace(/[^a-zA-Z0-9._() -]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
  return (cleaned || "allegato").slice(-140)
}

export function validateSupportFile(input: { name: string; mime_type: string; size_bytes: number }) {
  if (!input.name?.trim()) return "Nome file non valido"
  if (!SUPPORT_ATTACHMENT_MIME_TYPES.has(input.mime_type)) return "Tipo di file non consentito"
  if (!Number.isInteger(input.size_bytes) || input.size_bytes <= 0 || input.size_bytes > SUPPORT_ATTACHMENT_MAX_BYTES) {
    return "Il file supera il limite di 10 MB"
  }
  return null
}

export function validateSupportAttachmentList<T extends { name: string; mime_type: string; size_bytes: number }>(attachments: T[]) {
  if (attachments.length > SUPPORT_ATTACHMENT_MAX_FILES) return "Puoi allegare al massimo 5 file"
  let total = 0
  for (const attachment of attachments) {
    const error = validateSupportFile(attachment)
    if (error) return error
    total += attachment.size_bytes
  }
  if (total > SUPPORT_ATTACHMENT_MAX_TOTAL_BYTES) return "Gli allegati superano il limite complessivo di 25 MB"
  return null
}

export function createSupportUploadPath(propertyId: string, userId: string, fileName: string) {
  return `${propertyId}/${userId}/${randomUUID()}-${safeSupportFileName(fileName)}`
}

export function validateOwnedSupportAttachments(
  attachments: StoredSupportAttachment[],
  propertyId: string,
  userId: string,
) {
  const listError = validateSupportAttachmentList(attachments)
  if (listError) return listError
  const expectedPrefix = `${propertyId}/${userId}/`
  for (const attachment of attachments) {
    if (attachment.bucket !== SUPPORT_ATTACHMENT_BUCKET || !attachment.storage_path.startsWith(expectedPrefix)) {
      return "Riferimento allegato non valido"
    }
  }
  return null
}

function deterministicFileId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24)
}

function trustedFederatedSource(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return false
    const host = parsed.hostname.toLowerCase()
    return host.endsWith(".supabase.co") || host.endsWith(".supabase.in")
  } catch {
    return false
  }
}

export async function copyFederatedSupportAttachments(input: {
  attachments: FederatedSupportAttachment[]
  hubPropertyId: string
  product: string
  tenantRef: string
  threadId: string
  messageId: string
}): Promise<StoredSupportAttachment[]> {
  const listError = validateSupportAttachmentList(input.attachments)
  if (listError) throw new Error(`invalid_support_attachments:${listError}`)
  if (input.attachments.length === 0) return []

  const supabase = createServiceClient()
  const stored: StoredSupportAttachment[] = []

  for (const attachment of input.attachments) {
    if (!trustedFederatedSource(attachment.source_url)) throw new Error("untrusted_support_attachment_source")
    const response = await fetch(attachment.source_url, { cache: "no-store", signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`support_attachment_fetch_failed:${response.status}`)

    const declaredLength = Number(response.headers.get("content-length") || 0)
    if (declaredLength > SUPPORT_ATTACHMENT_MAX_BYTES) throw new Error("support_attachment_too_large")
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength <= 0 || bytes.byteLength > SUPPORT_ATTACHMENT_MAX_BYTES) throw new Error("support_attachment_too_large")

    const id = deterministicFileId(`${input.product}:${input.tenantRef}:${input.threadId}:${input.messageId}:${attachment.id}`)
    const storagePath = `${input.hubPropertyId}/federated/${input.product}/${input.tenantRef}/${input.threadId}/${input.messageId}/${id}-${safeSupportFileName(attachment.name)}`
    const { error } = await supabase.storage.from(SUPPORT_ATTACHMENT_BUCKET).upload(storagePath, bytes, {
      contentType: attachment.mime_type,
      upsert: true,
    })
    if (error) throw error

    stored.push({
      id,
      name: safeSupportFileName(attachment.name),
      mime_type: attachment.mime_type,
      size_bytes: bytes.byteLength,
      storage_path: storagePath,
      bucket: SUPPORT_ATTACHMENT_BUCKET,
    })
  }

  return stored
}

export function escapeSupportHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function supportMessageHtml(input: {
  content: string
  reporterName?: string | null
  reporterEmail?: string | null
  sourcePath?: string | null
  conversationId: string
  messageId: string
  attachments?: StoredSupportAttachment[]
}) {
  const context: string[] = []
  if (input.reporterName || input.reporterEmail) {
    const who = [input.reporterName, input.reporterEmail ? `<${input.reporterEmail}>` : null].filter(Boolean).join(" ")
    context.push(`<strong>Segnalato da:</strong> ${escapeSupportHtml(who)}`)
  }
  if (input.sourcePath) context.push(`<strong>Pagina:</strong> ${escapeSupportHtml(input.sourcePath)}`)

  const body = escapeSupportHtml(input.content).replace(/\n/g, "<br>")
  const attachments = input.attachments ?? []
  const attachmentHtml = attachments.length
    ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb"><strong>Allegati (${attachments.length})</strong><ul>${attachments.map((attachment, index) => {
        const href = `https://www.hotelaccelerator.com/api/inbox/${encodeURIComponent(input.conversationId)}/attachments/${encodeURIComponent(input.messageId)}/${index}`
        const kb = Math.max(1, Math.round(attachment.size_bytes / 1024))
        return `<li><a href="${href}">${escapeSupportHtml(attachment.name)}</a> <span style="color:#6b7280">(${kb} KB)</span></li>`
      }).join("")}</ul></div>`
    : ""

  return `${context.length ? `<div style="margin-bottom:12px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px">${context.join("<br>")}</div>` : ""}<div>${body}</div>${attachmentHtml}`
}
