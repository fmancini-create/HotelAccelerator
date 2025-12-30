import { type NextRequest, NextResponse } from "next/server"
import { put, del, list } from "@vercel/blob"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { categorySchema, validateInput } from "@/lib/input-validation"
import { z } from "zod"

// GET - Lista tutte le foto dal Blob storage (authenticated)
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { blobs } = await list()
    return NextResponse.json({
      success: true,
      files: blobs.map((b) => ({ url: b.url, pathname: b.pathname })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Errore lista foto:", error)
    return NextResponse.json({ error: "Errore durante il caricamento" }, { status: 500 })
  }
}

// POST - Upload nuove foto (authenticated + validated)
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]
    const category = formData.get("category") as string

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nessun file fornito" }, { status: 400 })
    }

    // Validate category
    try {
      validateInput(categorySchema, category)
    } catch {
      return NextResponse.json({ error: "Categoria non valida" }, { status: 400 })
    }

    // Validate files
    const maxFileSize = 10 * 1024 * 1024 // 10MB
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]

    for (const file of files) {
      if (file.size > maxFileSize) {
        return NextResponse.json({ error: `File ${file.name} troppo grande (max 10MB)` }, { status: 400 })
      }
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json({ error: `Tipo file non supportato: ${file.type}` }, { status: 400 })
      }
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
    const uploadedFiles: string[] = []

    for (const file of files) {
      // Genera nome file sicuro (sanitize)
      const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "-").substring(0, 100)
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
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Errore upload:", error)
    return NextResponse.json({ error: "Errore durante l'upload" }, { status: 500 })
  }
}

// DELETE - Elimina foto (authenticated + validated)
export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Validate input
    const schema = z.object({
      files: z.array(z.string().url()).min(1).max(100),
    })

    let validatedBody
    try {
      validatedBody = validateInput(schema, body)
    } catch (e) {
      return NextResponse.json({ error: "Input non valido" }, { status: 400 })
    }

    const { files } = validatedBody

    // Validate URLs are from allowed domains
    const allowedDomains = ["blob.vercel-storage.com", "public.blob.vercel-storage.com"]
    for (const fileUrl of files) {
      try {
        const url = new URL(fileUrl)
        const isAllowed = allowedDomains.some((d) => url.hostname.endsWith(d))
        if (!isAllowed) {
          return NextResponse.json({ error: `URL non consentito: ${fileUrl}` }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: `URL non valido: ${fileUrl}` }, { status: 400 })
      }
    }

    const deletedFiles: string[] = []
    const errors: string[] = []

    for (const fileUrl of files) {
      try {
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
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Errore eliminazione:", error)
    return NextResponse.json({ error: "Errore durante l'eliminazione" }, { status: 500 })
  }
}

// PATCH - Sposta foto tra categorie (authenticated + validated)
export async function PATCH(request: NextRequest) {
  try {
    // Verify authentication
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Validate input
    const schema = z.object({
      moves: z
        .array(
          z.object({
            from: z.string().url(),
            toCategory: categorySchema,
          }),
        )
        .min(1)
        .max(50),
    })

    let validatedBody
    try {
      validatedBody = validateInput(schema, body)
    } catch {
      return NextResponse.json({ error: "Input non valido" }, { status: 400 })
    }

    const { moves } = validatedBody

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

        // Validate source URL
        const allowedDomains = ["blob.vercel-storage.com", "public.blob.vercel-storage.com"]
        const url = new URL(from)
        const isAllowed = allowedDomains.some((d) => url.hostname.endsWith(d))
        if (!isAllowed) {
          errors.push(`URL non consentito: ${from}`)
          continue
        }

        // Estrai nome file dall'URL (sanitized)
        const urlParts = from.split("/")
        const fileName = urlParts[urlParts.length - 1].replace(/[^a-zA-Z0-9.-]/g, "-").substring(0, 100)
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
    if (error instanceof Error && error.message === "Non autenticato") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Errore spostamento:", error)
    return NextResponse.json({ error: "Errore durante lo spostamento" }, { status: 500 })
  }
}
