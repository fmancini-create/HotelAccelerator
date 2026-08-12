import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export const dynamic = "force-dynamic"

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

/**
 * Upload a PDF to Vercel Blob and return its URL. The caller then creates a
 * knowledge_source of type 'pdf' with this file_url, which the indexer fetches.
 */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "Nessun file caricato" }, { status: 400 })

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    if (!isPdf) return NextResponse.json({ error: "Sono ammessi solo file PDF" }, { status: 400 })
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Il file supera il limite di 20 MB" }, { status: 400 })
    }

    // Namespace by property and add a random suffix so URLs are not guessable.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const blob = await put(`knowledge/${propertyId}/${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
    })

    return NextResponse.json({ fileUrl: blob.url, filename: file.name })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
