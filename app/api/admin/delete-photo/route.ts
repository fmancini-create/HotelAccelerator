import { del } from "@vercel/blob"
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
    // cookie: restituiva sempre null, quindi la rotta rispondeva 401 anche a
    // un amministratore legittimo. Sicura per caso, ma non funzionante.
    const identity = await requireTenantAdmin(request)

    const supabase = createServiceClient()

    const body = await request.json()
    const { photoId } = body

    // Il ruolo di servizio SCAVALCA le politiche di sicurezza: senza questo
    // filtro un amministratore potrebbe cancellare la foto di un altro
    // cliente indovinandone l'identificativo.
    let ricerca = supabase.from("photos").select("url").eq("id", photoId)
    if (!identity.isSuperAdmin) ricerca = ricerca.eq("property_id", identity.propertyId)
    const { data: photo } = await ricerca.maybeSingle()

    if (!photo) {
      return NextResponse.json({ error: "Foto non trovata" }, { status: 404 })
    }

    if (photo.url) {
      // Elimina da Vercel Blob
      await del(photo.url)
    }

    // Elimina dal database (cascade eliminerà anche photo_categories)
    let rimozione = supabase.from("photos").delete().eq("id", photoId)
    if (!identity.isSuperAdmin) rimozione = rimozione.eq("property_id", identity.propertyId)
    const { error: deleteError } = await rimozione

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
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
    console.error("Delete error:", error)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
