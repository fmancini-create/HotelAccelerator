import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()

    // Verifica autenticazione
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    const uploadedPhotos = []

    // Upload ogni file su Vercel Blob
    for (const file of files) {
      // Upload su Vercel Blob (cartella unica /gallery)
      const blob = await put(`gallery/${file.name}`, file, {
        access: "public",
      })

      // Salva nel database
      const { data: photo, error: dbError } = await supabase
        .from("photos")
        .insert({
          url: blob.url,
          alt: file.name.replace(/\.[^/.]+$/, ""), // Nome file senza estensione come alt di default
          is_published: false, // Non pubblicata di default
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
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
