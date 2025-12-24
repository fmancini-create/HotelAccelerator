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
    console.error("Update error:", error)
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}
