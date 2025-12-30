import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import type { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user's property
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    // Validate files
    const maxFileSize = 10 * 1024 * 1024 // 10MB
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]
    const maxFiles = 20

    if (files.length > maxFiles) {
      return NextResponse.json({ error: `Maximum ${maxFiles} files allowed` }, { status: 400 })
    }

    for (const file of files) {
      if (file.size > maxFileSize) {
        return NextResponse.json({ error: `File ${file.name} too large (max 10MB)` }, { status: 400 })
      }
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json({ error: `Invalid file type: ${file.type}` }, { status: 400 })
      }
    }

    const uploadedPhotos = []

    // Upload ogni file su Vercel Blob
    for (const file of files) {
      // Sanitize filename
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "-").substring(0, 100)

      // Upload su Vercel Blob (cartella per property)
      const blob = await put(`gallery/${propertyId}/${Date.now()}-${sanitizedName}`, file, {
        access: "public",
      })

      // Salva nel database WITH property_id for tenant isolation
      const { data: photo, error: dbError } = await supabase
        .from("photos")
        .insert({
          url: blob.url,
          alt: file.name.replace(/\.[^/.]+$/, ""), // Nome file senza estensione come alt di default
          is_published: false, // Non pubblicata di default
          property_id: propertyId, // CRITICAL: Associate with user's property
        })
        .select()
        .single()

      if (dbError) {
        console.error("Database error:", dbError)
        continue
      }

      uploadedPhotos.push(photo)
    }

    return NextResponse.json({
      success: true,
      uploaded: uploadedPhotos.length,
      photos: uploadedPhotos,
    })
  } catch (error) {
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
