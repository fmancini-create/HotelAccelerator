import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import {
  SUPPORT_ATTACHMENT_BUCKET,
  createSupportUploadPath,
  validateSupportFile,
} from "@/lib/support-attachments"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(160),
  size_bytes: z.number().int().positive(),
})

export async function POST(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "File non valido" }, { status: 400 })
  const validationError = validateSupportFile(parsed.data)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const path = createSupportUploadPath(identity.propertyId, identity.userId, parsed.data.name)
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage.from(SUPPORT_ATTACHMENT_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    console.error("[internal-support] signed upload unavailable", { code: error?.message || "no_token" })
    return NextResponse.json({ error: "Impossibile preparare l'allegato" }, { status: 500 })
  }

  return NextResponse.json({
    bucket: SUPPORT_ATTACHMENT_BUCKET,
    path,
    token: data.token,
  })
}
