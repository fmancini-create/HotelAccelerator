import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireTenantAdmin, accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"

export async function POST(request: NextRequest) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("photos", request)
    // Prima chiamava auth.getUser() su un client di SERVIZIO, che non legge i
    // cookie: rispondeva sempre 401, anche a un amministratore legittimo.
    const identity = await requireTenantAdmin(request)

    const supabase = createServiceClient()

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
          // Senza questo la foto nasce SENZA tenant: il ruolo di servizio la
          // scriverebbe comunque, ma poi nessuna lettura protetta la vedrebbe.
          property_id: identity.propertyId,
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
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    // Un diniego deve tornare 401/403, non il 500 generico qui sotto.
    if (isAccessError(error) || (error as { name?: string })?.name === "AccessError") {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Accesso negato" },
        { status: accessErrorStatus(error) },
      )
    }
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
