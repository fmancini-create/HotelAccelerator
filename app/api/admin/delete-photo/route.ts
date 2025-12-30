import { del } from "@vercel/blob"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { photoDeleteSchema, validateInput } from "@/lib/input-validation"
import type { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user's property
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()

    const body = await request.json()

    // Validate input
    let validatedBody
    try {
      validatedBody = validateInput(photoDeleteSchema, body)
    } catch {
      return NextResponse.json({ error: "Invalid photo ID" }, { status: 400 })
    }

    const { photoId } = validatedBody

    // Get photo URL AND verify it belongs to user's property (tenant isolation)
    const { data: photo, error: fetchError } = await supabase
      .from("photos")
      .select("url, property_id")
      .eq("id", photoId)
      .single()

    if (fetchError || !photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }

    // CRITICAL: Verify photo belongs to user's property
    if (photo.property_id && photo.property_id !== propertyId) {
      console.error(
        `[SECURITY] Cross-tenant deletion attempt: user property ${propertyId}, photo property ${photo.property_id}`,
      )
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    if (photo?.url) {
      // Elimina da Vercel Blob
      try {
        await del(photo.url)
      } catch (blobError) {
        console.error("Blob delete error:", blobError)
        // Continue with DB deletion even if blob fails
      }
    }

    // Elimina dal database (cascade eliminerà anche photo_categories)
    const { error: deleteError } = await supabase
      .from("photos")
      .delete()
      .eq("id", photoId)
      .eq("property_id", propertyId) // Extra safety: filter by property

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Delete error:", error)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
