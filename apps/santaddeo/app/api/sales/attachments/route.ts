import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB per file
// Estensioni consentite: documenti e immagini comuni. Niente eseguibili.
const ALLOWED_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
])

/**
 * POST /api/sales/attachments
 * Carica un allegato (multipart form-data, campo "file") su Vercel Blob e
 * ritorna { url, filename, size, contentType }. L'URL verra' passato in fase
 * di invio email per allegare il file. Riservato a venditori e super admin.
 */
export async function POST(request: Request) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "no_file" }, { status: 400 })
  }

  const filename = (file.name || "allegato").replace(/[^\w.\- ]+/g, "_").slice(0, 120)
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : ""
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: "ext_not_allowed", message: "Tipo di file non consentito." }, { status: 415 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large", message: "Allegato troppo grande (max 10 MB)." }, { status: 413 })
  }

  try {
    const blob = await put(`sales-attachments/${user.id}/${Date.now()}-${filename}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || undefined,
    })
    return NextResponse.json({
      url: blob.url,
      filename,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    })
  } catch (e) {
    console.error("[sales/attachments] upload error:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "upload_failed" }, { status: 500 })
  }
}
