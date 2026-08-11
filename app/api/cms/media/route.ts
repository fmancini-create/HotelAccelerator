import { randomUUID } from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId, getAuthenticatedUser } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"

const BUCKET = "cms-media"
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"])
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Errore sconosciuto"
  const status = message.includes("Non autenticato") ? 401 : message.includes("non valido") || message.includes("troppo") ? 400 : 500
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: NextRequest) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("cms", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const service = createServiceClient()
    const { data, error } = await service
      .from("cms_media_assets")
      .select("id, public_url, original_name, mime_type, size_bytes, alt_text, width, height, created_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(250)

    if (error) throw new Error(error.message)
    return NextResponse.json({ assets: data ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("cms", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const user = await getAuthenticatedUser(request).catch(() => null)
    const form = await request.formData()
    const file = form.get("file")
    const altText = String(form.get("alt_text") || "").trim().slice(0, 500) || null

    if (!(file instanceof File)) throw new Error("File non valido")
    if (!ALLOWED_TYPES.has(file.type)) throw new Error("Formato immagine non valido")
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) throw new Error("File troppo grande: massimo 10 MB")

    const extension = EXTENSIONS[file.type]
    const storagePath = `${propertyId}/${randomUUID()}.${extension}`
    const bytes = Buffer.from(await file.arrayBuffer())
    const service = createServiceClient()

    const { error: uploadError } = await service.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    })
    if (uploadError) throw new Error(uploadError.message)

    const { data: publicData } = service.storage.from(BUCKET).getPublicUrl(storagePath)
    const publicUrl = publicData.publicUrl

    const { data, error: insertError } = await service
      .from("cms_media_assets")
      .insert({
        property_id: propertyId,
        storage_path: storagePath,
        public_url: publicUrl,
        original_name: file.name.slice(0, 255) || `immagine.${extension}`,
        mime_type: file.type,
        size_bytes: file.size,
        alt_text: altText,
        created_by: user && "userId" in user ? user.userId : null,
      })
      .select("id, public_url, original_name, mime_type, size_bytes, alt_text, width, height, created_at")
      .single()

    if (insertError) {
      await service.storage.from(BUCKET).remove([storagePath])
      throw new Error(insertError.message)
    }

    return NextResponse.json({ asset: data }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("cms", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const assetId = request.nextUrl.searchParams.get("id")
    if (!assetId) throw new Error("ID media non valido")

    const service = createServiceClient()
    const { data: asset, error: readError } = await service
      .from("cms_media_assets")
      .select("id, storage_path")
      .eq("id", assetId)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (readError) throw new Error(readError.message)
    if (!asset) return NextResponse.json({ error: "Media non trovato" }, { status: 404 })

    const { error: storageError } = await service.storage.from(BUCKET).remove([asset.storage_path])
    if (storageError) throw new Error(storageError.message)

    const { error: deleteError } = await service
      .from("cms_media_assets")
      .delete()
      .eq("id", asset.id)
      .eq("property_id", propertyId)

    if (deleteError) throw new Error(deleteError.message)
    return NextResponse.json({ deleted: true })
  } catch (error) {
    return errorResponse(error)
  }
}
