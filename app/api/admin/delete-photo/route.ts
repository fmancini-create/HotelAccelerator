import { del } from "@vercel/blob"
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
    const { photoId } = body

    // Get photo URL per eliminare da Blob
    const { data: photo } = await supabase.from("photos").select("url").eq("id", photoId).single()

    if (photo?.url) {
      // Elimina da Vercel Blob
      await del(photo.url)
    }

    // Elimina dal database (cascade eliminerà anche photo_categories)
    const { error: deleteError } = await supabase.from("photos").delete().eq("id", photoId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete error:", error)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
