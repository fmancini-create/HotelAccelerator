import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export const dynamic = "force-dynamic"

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB: e' un logo in una testata, non una gallery
const TIPI_AMMESSI = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"]

/**
 * Carica il logo di un widget e restituisce l'URL.
 *
 * Il file e' `access: "public"` perche' deve essere leggibile dal sito del
 * cliente senza autenticazione: e' un logo, un dato pubblico per definizione.
 * Il nome porta un suffisso casuale cosi' due caricamenti con lo stesso nome
 * non si sovrascrivono fra widget diversi.
 */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "Nessun file caricato" }, { status: 400 })

    if (!TIPI_AMMESSI.includes(file.type)) {
      return NextResponse.json(
        { error: "Formati ammessi: PNG, JPEG, SVG o WebP" },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Il logo supera il limite di 2 MB" }, { status: 400 })
    }

    const nomeSicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const blob = await put(`chat-widgets/${propertyId}/${nomeSicuro}`, file, {
      access: "public",
      addRandomSuffix: true,
    })

    return NextResponse.json({ logoUrl: blob.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}
