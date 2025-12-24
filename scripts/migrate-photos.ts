import { readdir, readFile } from "fs/promises"
import { join } from "path"
import { put } from "@vercel/blob"

const IMAGES_DIR = join(process.cwd(), "public", "images")

// Mappa le cartelle alle categorie
const CATEGORY_MAP: Record<string, string> = {
  "dependance/economy": "Economy",
  "dependance/deluxe": "Dependance Deluxe",
  suite: "Suite",
  "suite-private-access": "Suite Private Access",
  "palazzo-tempi": "Palazzo Tempi",
  "tuscan-style": "Tuscan Style",
}

async function getAllImages(dir: string, baseDir = ""): Promise<Array<{ path: string; category: string }>> {
  const images: Array<{ path: string; category: string }> = []

  try {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const relativePath = join(baseDir, entry.name)

      if (entry.isDirectory()) {
        // Ricorsione nelle sottocartelle
        const subImages = await getAllImages(fullPath, relativePath)
        images.push(...subImages)
      } else if (entry.isFile() && /\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
        // Determina la categoria dal percorso
        let category = "Uncategorized"
        for (const [path, cat] of Object.entries(CATEGORY_MAP)) {
          if (relativePath.startsWith(path)) {
            category = cat
            break
          }
        }

        images.push({ path: fullPath, category })
      }
    }
  } catch (error) {
    console.log(`[v0] Cartella non trovata: ${dir}, skip...`)
  }

  return images
}

async function migratePhotos() {
  console.log("[v0] Inizio migrazione foto...")

  // Raccogli tutte le immagini
  const images = await getAllImages(IMAGES_DIR)
  console.log(`[v0] Trovate ${images.length} immagini da migrare`)

  let migrated = 0
  let errors = 0

  for (const image of images) {
    try {
      console.log(`[v0] Migrazione: ${image.path}`)

      // Leggi il file
      const fileBuffer = await readFile(image.path)
      const fileName = image.path.split("/").pop() || "unknown.jpg"

      // Carica su Vercel Blob
      const blob = await put(fileName, fileBuffer, {
        access: "public",
        addRandomSuffix: false,
      })

      console.log(`[v0] ✓ Caricato: ${blob.url}`)
      console.log(`[v0]   Categoria: ${image.category}`)

      migrated++
    } catch (error) {
      console.error(`[v0] ✗ Errore su ${image.path}:`, error)
      errors++
    }
  }

  console.log(`[v0] Migrazione completata!`)
  console.log(`[v0] Successo: ${migrated}, Errori: ${errors}`)
}

migratePhotos().catch(console.error)
