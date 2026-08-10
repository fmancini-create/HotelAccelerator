import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export async function POST(request: Request) {
  try {
    const supabase = createServiceClient()

    // Verifica autenticazione
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { photoId, alt, isPublished, categoryIds } = body

    // Aggiorna foto
    const { error: updateError } = await supabase
      .from("photos")
      .update({
        alt,
        is_published: isPublished,
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoId)

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
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Update error:", error)
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}
