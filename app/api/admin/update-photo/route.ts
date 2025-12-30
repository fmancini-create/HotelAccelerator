import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { photoUpdateSchema, validateInput, sanitizeHtml } from "@/lib/input-validation"
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
      validatedBody = validateInput(photoUpdateSchema, body)
    } catch (e) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { photoId, alt, isPublished, categoryIds } = validatedBody

    // Verify photo belongs to user's property BEFORE updating
    const { data: existingPhoto, error: fetchError } = await supabase
      .from("photos")
      .select("property_id")
      .eq("id", photoId)
      .single()

    if (fetchError || !existingPhoto) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }

    // CRITICAL: Verify photo belongs to user's property
    if (existingPhoto.property_id && existingPhoto.property_id !== propertyId) {
      console.error(
        `[SECURITY] Cross-tenant update attempt: user property ${propertyId}, photo property ${existingPhoto.property_id}`,
      )
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Sanitize alt text to prevent XSS
    const sanitizedAlt = alt ? sanitizeHtml(alt) : undefined

    // Aggiorna foto (filter by property_id for extra safety)
    const { error: updateError } = await supabase
      .from("photos")
      .update({
        ...(sanitizedAlt !== undefined && { alt: sanitizedAlt }),
        ...(isPublished !== undefined && { is_published: isPublished }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoId)
      .eq("property_id", propertyId) // Extra safety

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Aggiorna categorie se fornite
    if (categoryIds) {
      // Rimuovi vecchie associazioni
      await supabase.from("photo_categories").delete().eq("photo_id", photoId)

      // Aggiungi nuove associazioni
      if (categoryIds.length > 0) {
        const associations = categoryIds.map((catId: string) => ({
          photo_id: photoId,
          category_id: catId,
        }))

        await supabase.from("photo_categories").insert(associations)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Update error:", error)
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}
