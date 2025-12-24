import { type NextRequest, NextResponse } from "next/server"
import { put, del, list } from "@vercel/blob"

// Helper per verificare autenticazione (semplificato - in produzione usare JWT/session)
function isAuthenticated(request: NextRequest): boolean {
  // In produzione, verificare token JWT o session
  return true
}

// GET - Lista tutte le foto dal Blob storage
export async function GET(request: NextRequest) {
  try {
    const { blobs } = await list()
    return NextResponse.json({
      success: true,
      files: blobs.map((b) => ({ url: b.url, pathname: b.pathname })),
    })
  } catch (error) {
    console.error("Errore lista foto:", error)
    return NextResponse.json({ error: "Errore durante il caricamento" }, { status: 500 })
  }
}

// POST - Upload nuove foto
export async function POST(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]
    const category = formData.get("category") as string

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nessun file fornito" }, { status: 400 })
    }

    if (!category) {
      return NextResponse.json({ error: "Categoria non specificata" }, { status: 400 })
    }

    // Mappa categoria a percorso
    const categoryPaths: Record<string, string> = {
      suite: "images/suite",
      "suite-private-access": "images/suite-private-access",
      "tuscan-style": "images/tuscan-style",
      "dependance-deluxe": "images/dependance/deluxe",
      "dependance-economy": "images/dependance/economy",
      piscina: "images/piscina",
      ristorante: "images/ristorante",
      giardino: "images/giardino",
      common: "images/common",
    }

    const categoryPath = categoryPaths[category]
    if (!categoryPath) {
      return NextResponse.json({ error: "Categoria non valida" }, { status: 400 })
    }

    const uploadedFiles: string[] = []

    for (const file of files) {
      // Genera nome file sicuro
      const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "-")
      const timestamp = Date.now()
      const fileName = `${timestamp}-${originalName}`
      const pathname = `${categoryPath}/${fileName}`

      // Upload su Vercel Blob
      const blob = await put(pathname, file, {
        access: "public",
      })

      uploadedFiles.push(blob.url)
    }

    return NextResponse.json({
      success: true,
      message: `${uploadedFiles.length} foto caricate con successo`,
      files: uploadedFiles,
    })
  } catch (error) {
    console.error("Errore upload:", error)
    return NextResponse.json({ error: "Errore durante l'upload" }, { status: 500 })
  }
}

// DELETE - Elimina foto
export async function DELETE(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    const body = await request.json()
    const { files } = body as { files: string[] }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nessun file specificato" }, { status: 400 })
    }

    const deletedFiles: string[] = []
    const errors: string[] = []

    for (const fileUrl of files) {
      try {
        // Vercel Blob delete richiede l'URL completo
        await del(fileUrl)
        deletedFiles.push(fileUrl)
      } catch (err) {
        errors.push(`Errore eliminazione ${fileUrl}: ${err}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `${deletedFiles.length} foto eliminate`,
      deletedFiles,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Errore eliminazione:", error)
    return NextResponse.json({ error: "Errore durante l'eliminazione" }, { status: 500 })
  }
}

// PATCH - Sposta foto tra categorie (copia + elimina)
export async function PATCH(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    const body = await request.json()
    const { moves } = body as { moves: { from: string; toCategory: string }[] }

    if (!moves || moves.length === 0) {
      return NextResponse.json({ error: "Nessuno spostamento specificato" }, { status: 400 })
    }

    const categoryPaths: Record<string, string> = {
      suite: "images/suite",
      "suite-private-access": "images/suite-private-access",
      "tuscan-style": "images/tuscan-style",
      "dependance-deluxe": "images/dependance/deluxe",
      "dependance-economy": "images/dependance/economy",
      piscina: "images/piscina",
      ristorante: "images/ristorante",
      giardino: "images/giardino",
      common: "images/common",
    }

    const movedFiles: { from: string; to: string }[] = []
    const errors: string[] = []

    for (const move of moves) {
      try {
        const { from, toCategory } = move
        const targetPath = categoryPaths[toCategory]

        if (!targetPath) {
          errors.push(`Categoria non valida: ${toCategory}`)
          continue
        }

        // Estrai nome file dall'URL
        const urlParts = from.split("/")
        const fileName = urlParts[urlParts.length - 1]
        const newPathname = `${targetPath}/${fileName}`

        // Scarica il file originale
        const response = await fetch(from)
        if (!response.ok) {
          errors.push(`File non trovato: ${from}`)
          continue
        }

        const fileBlob = await response.blob()

        // Carica nella nuova posizione
        const newBlob = await put(newPathname, fileBlob, {
          access: "public",
        })

        // Elimina l'originale
        await del(from)

        movedFiles.push({
          from,
          to: newBlob.url,
        })
      } catch (err) {
        errors.push(`Errore spostamento: ${err}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `${movedFiles.length} foto spostate`,
      movedFiles,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Errore spostamento:", error)
    return NextResponse.json({ error: "Errore durante lo spostamento" }, { status: 500 })
  }
}
