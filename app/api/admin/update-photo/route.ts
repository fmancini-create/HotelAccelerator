import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireTenantAdmin, accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"

export async function POST(request: NextRequest) {
  try {
    // Prima chiamava auth.getUser() su un client di SERVIZIO, che non legge i
    // cookie: rispondeva sempre 401, anche a un amministratore legittimo.
    const identity = await requireTenantAdmin(request)

    const supabase = createServiceClient()

    const body = await request.json()
    const { photoId, alt, isPublished, categoryIds } = body

    // Il ruolo di servizio SCAVALCA le politiche: senza questo filtro si
    // potrebbe modificare (e pubblicare) la foto di un altro cliente.
    let modifica = supabase
      .from("photos")
      .update({
        alt,
        is_published: isPublished,
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoId)
    if (!identity.isSuperAdmin) modifica = modifica.eq("property_id", identity.propertyId)
    const { data: modificate, error: updateError } = await modifica.select("id")

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Nessuna riga modificata = la foto non esiste o non e' di questo tenant.
    if (!modificate || modificate.length === 0) {
      return NextResponse.json({ error: "Foto non trovata" }, { status: 404 })
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
    // Un diniego deve tornare 401/403, non il 500 generico qui sotto.
    if (isAccessError(error) || (error as { name?: string })?.name === "AccessError") {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Accesso negato" },
        { status: accessErrorStatus(error) },
      )
    }
    console.error("Update error:", error)
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}
