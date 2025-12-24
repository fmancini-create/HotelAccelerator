import { NextResponse } from "next/server"
import { list } from "@vercel/blob"
import { createClient } from "@supabase/supabase-js"

// Usa service role key per bypassare RLS
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Mappa delle foto reali dalle cartelle public/images/
const HARDCODED_PHOTOS = [
  // Economy (da public/images/dependance/economy/) - 22 foto totali
  {
    src: "/images/dependance/economy/bedroom-white-elegant.jpg",
    category: "Economy",
    name: "bedroom-white-elegant.jpg",
  },
  {
    src: "/images/dependance/economy/bathroom-beige-modern.jpg",
    category: "Economy",
    name: "bathroom-beige-modern.jpg",
  },
  {
    src: "/images/dependance/economy/bedroom-artwork-beams.jpg",
    category: "Economy",
    name: "bedroom-artwork-beams.jpg",
  },
  {
    src: "/images/dependance/economy/bathroom-backlit-mirror-1.jpg",
    category: "Economy",
    name: "bathroom-backlit-mirror-1.jpg",
  },
  {
    src: "/images/dependance/economy/bedroom-desk-tv-corner.jpg",
    category: "Economy",
    name: "bedroom-desk-tv-corner.jpg",
  },
  {
    src: "/images/dependance/economy/bathroom-backlit-mirror-2.jpg",
    category: "Economy",
    name: "bathroom-backlit-mirror-2.jpg",
  },
  {
    src: "/images/dependance/economy/bedroom-private-access.jpg",
    category: "Economy",
    name: "bedroom-private-access.jpg",
  },
  {
    src: "/images/dependance/economy/bathroom-shower-compact.jpg",
    category: "Economy",
    name: "bathroom-shower-compact.jpg",
  },
  {
    src: "/images/dependance/economy/bathroom-double-vanity.png",
    category: "Economy",
    name: "bathroom-double-vanity.png",
  },
  {
    src: "/images/dependance/economy/room-detail-1.jpg",
    category: "Economy",
    name: "room-detail-1.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-2.jpg",
    category: "Economy",
    name: "room-detail-2.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-3.jpg",
    category: "Economy",
    name: "room-detail-3.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-4.jpg",
    category: "Economy",
    name: "room-detail-4.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-5.jpg",
    category: "Economy",
    name: "room-detail-5.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-6.jpg",
    category: "Economy",
    name: "room-detail-6.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-7.jpg",
    category: "Economy",
    name: "room-detail-7.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-8.jpg",
    category: "Economy",
    name: "room-detail-8.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-9.jpg",
    category: "Economy",
    name: "room-detail-9.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-10.jpg",
    category: "Economy",
    name: "room-detail-10.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-11.jpg",
    category: "Economy",
    name: "room-detail-11.jpg",
  },
  {
    src: "/images/dependance/economy/room-detail-12.jpg",
    category: "Economy",
    name: "room-detail-12.jpg",
  },

  // Dependance (da public/images/dependance/) - 5 foto
  { src: "/images/dependance/bedroom-arched-window.jpg", category: "Dependance", name: "bedroom-arched-window.jpg" },
  { src: "/images/dependance/bathroom-modern.jpg", category: "Dependance", name: "bathroom-modern.jpg" },
  { src: "/images/dependance/bedroom-modern-beams.jpg", category: "Dependance", name: "bedroom-modern-beams.jpg" },
  { src: "/images/dependance/artwork-folk-art.jpg", category: "Dependance", name: "artwork-folk-art.jpg" },
  { src: "/images/dependance/suite-living-area.jpg", category: "Dependance", name: "suite-living-area.jpg" },

  // Dependance Deluxe (da public/images/dependance/deluxe/)
  {
    src: "/images/dependance/deluxe/bedroom-antique-wardrobe.jpg",
    category: "Dependance Deluxe",
    name: "bedroom-antique-wardrobe.jpg",
  },
  {
    src: "/images/dependance/deluxe/bathroom-elegant.jpg",
    category: "Dependance Deluxe",
    name: "bathroom-elegant.jpg",
  },
  {
    src: "/images/dependance/deluxe/bedroom-arched-window.jpg",
    category: "Dependance Deluxe",
    name: "bedroom-arched-window.jpg",
  },
  {
    src: "/images/dependance/deluxe/bathroom-double-mirror.jpg",
    category: "Dependance Deluxe",
    name: "bathroom-double-mirror.jpg",
  },
  {
    src: "/images/dependance/deluxe/bedroom-beams-garden-view.jpg",
    category: "Dependance Deluxe",
    name: "bedroom-beams-garden-view.jpg",
  },
  {
    src: "/images/dependance/deluxe/bathroom-mosaic-tiles.jpg",
    category: "Dependance Deluxe",
    name: "bathroom-mosaic-tiles.jpg",
  },
  { src: "/images/dependance/deluxe/bedroom-bright.jpg", category: "Dependance Deluxe", name: "bedroom-bright.jpg" },
  {
    src: "/images/dependance/deluxe/bathroom-yellow-walls.jpg",
    category: "Dependance Deluxe",
    name: "bathroom-yellow-walls.jpg",
  },
  {
    src: "/images/dependance/deluxe/bedroom-contemporary-mix.jpg",
    category: "Dependance Deluxe",
    name: "bedroom-contemporary-mix.jpg",
  },
  {
    src: "/images/dependance/deluxe/bedroom-lamp-detail.jpg",
    category: "Dependance Deluxe",
    name: "bedroom-lamp-detail.jpg",
  },
  {
    src: "/images/dependance/deluxe/bedroom-minimal-white.jpg",
    category: "Dependance Deluxe",
    name: "bedroom-minimal-white.jpg",
  },
  { src: "/images/dependance/deluxe/desk-tv-corner.jpg", category: "Dependance Deluxe", name: "desk-tv-corner.jpg" },
  {
    src: "/images/dependance/deluxe/living-area-artwork.jpg",
    category: "Dependance Deluxe",
    name: "living-area-artwork.jpg",
  },
  {
    src: "/images/dependance/deluxe/magazines-detail.jpg",
    category: "Dependance Deluxe",
    name: "magazines-detail.jpg",
  },
  {
    src: "/images/dependance/deluxe/private-garden-access.jpg",
    category: "Dependance Deluxe",
    name: "private-garden-access.jpg",
  },
  {
    src: "/images/dependance/deluxe/suite-spacious-antique.jpg",
    category: "Dependance Deluxe",
    name: "suite-spacious-antique.jpg",
  },
  { src: "/images/dependance/deluxe/towels-wardrobe.jpg", category: "Dependance Deluxe", name: "towels-wardrobe.jpg" },
  {
    src: "/images/dependance/deluxe/wardrobe-minibar-tv.jpg",
    category: "Dependance Deluxe",
    name: "wardrobe-minibar-tv.jpg",
  },
  {
    src: "/images/dependance/deluxe/artwork-tuscan-sun.jpg",
    category: "Dependance Deluxe",
    name: "artwork-tuscan-sun.jpg",
  },

  // Suite (da public/images/suite/)
  { src: "/images/suite/bedroom-golden-art-frontal.jpg", category: "Suite", name: "bedroom-golden-art-frontal.jpg" },
  { src: "/images/suite/bathroom-mosaic-modern.jpg", category: "Suite", name: "bathroom-mosaic-modern.jpg" },
  { src: "/images/suite/bedroom-arched-window.jpg", category: "Suite", name: "bedroom-arched-window.jpg" },
  { src: "/images/suite/bathroom-mosaic-sink-1.jpg", category: "Suite", name: "bathroom-mosaic-sink-1.jpg" },
  { src: "/images/suite/bedroom-champagne-setup.jpg", category: "Suite", name: "bedroom-champagne-setup.jpg" },
  { src: "/images/suite/bathroom-mosaic-sink-2.jpg", category: "Suite", name: "bathroom-mosaic-sink-2.jpg" },
  { src: "/images/suite/bedroom-painted-wardrobe.jpg", category: "Suite", name: "bedroom-painted-wardrobe.jpg" },
  { src: "/images/suite/bedroom-portrait-painting.jpg", category: "Suite", name: "bedroom-portrait-painting.jpg" },
  {
    src: "/images/suite/bedroom-secretary-desk-mirror.jpg",
    category: "Suite",
    name: "bedroom-secretary-desk-mirror.jpg",
  },
  { src: "/images/suite/bedroom-tv-wardrobe.jpg", category: "Suite", name: "bedroom-tv-wardrobe.jpg" },
  { src: "/images/suite/bedroom-wardrobe-side.jpg", category: "Suite", name: "bedroom-wardrobe-side.jpg" },
  { src: "/images/suite/bedroom-wide-view.jpg", category: "Suite", name: "bedroom-wide-view.jpg" },
  { src: "/images/suite/bedroom-window-wardrobe.jpg", category: "Suite", name: "bedroom-window-wardrobe.jpg" },
  { src: "/images/suite/detail-flowers-magazines.jpg", category: "Suite", name: "detail-flowers-magazines.jpg" },
  { src: "/images/suite/detail-magazines-table.jpg", category: "Suite", name: "detail-magazines-table.jpg" },
  { src: "/images/suite/detail-secretary-magazines.jpg", category: "Suite", name: "detail-secretary-magazines.jpg" },
  { src: "/images/suite/full-view-kitchenette.jpg", category: "Suite", name: "full-view-kitchenette.jpg" },

  // Suite Private Access (da public/images/suite-private-access/)
  {
    src: "/images/suite-private-access/aerial-view-barcelona-chairs.jpg",
    category: "Suite Private Access",
    name: "aerial-view-barcelona-chairs.jpg",
  },
  {
    src: "/images/suite-private-access/bathroom-terracotta-shower.jpg",
    category: "Suite Private Access",
    name: "bathroom-terracotta-shower.jpg",
  },
  {
    src: "/images/suite-private-access/bed-detail-flowers.jpg",
    category: "Suite Private Access",
    name: "bed-detail-flowers.jpg",
  },
  {
    src: "/images/suite-private-access/bed-towels-mirror.jpg",
    category: "Suite Private Access",
    name: "bed-towels-mirror.jpg",
  },
  {
    src: "/images/suite-private-access/bedroom-barcelona-chairs.jpg",
    category: "Suite Private Access",
    name: "bedroom-barcelona-chairs.jpg",
  },
  {
    src: "/images/suite-private-access/bedroom-chaise-staircase.jpg",
    category: "Suite Private Access",
    name: "bedroom-chaise-staircase.jpg",
  },
  {
    src: "/images/suite-private-access/bedroom-glass-shower.jpg",
    category: "Suite Private Access",
    name: "bedroom-glass-shower.jpg",
  },
  {
    src: "/images/suite-private-access/bedroom-wooden-door.jpg",
    category: "Suite Private Access",
    name: "bedroom-wooden-door.jpg",
  },
  {
    src: "/images/suite-private-access/duplex-overview-chaise.jpg",
    category: "Suite Private Access",
    name: "duplex-overview-chaise.jpg",
  },
  {
    src: "/images/suite-private-access/full-suite-view-front.jpg",
    category: "Suite Private Access",
    name: "full-suite-view-front.jpg",
  },
  {
    src: "/images/suite-private-access/full-suite-view.jpg",
    category: "Suite Private Access",
    name: "full-suite-view.jpg",
  },
  {
    src: "/images/suite-private-access/living-area-private-entrance.jpg",
    category: "Suite Private Access",
    name: "living-area-private-entrance.jpg",
  },
  {
    src: "/images/suite-private-access/mezzanine-bedroom.jpg",
    category: "Suite Private Access",
    name: "mezzanine-bedroom.jpg",
  },
  {
    src: "/images/suite-private-access/mezzanine-lounge-tv.jpg",
    category: "Suite Private Access",
    name: "mezzanine-lounge-tv.jpg",
  },
  {
    src: "/images/suite-private-access/mezzanine-wooden-ceiling.jpg",
    category: "Suite Private Access",
    name: "mezzanine-wooden-ceiling.jpg",
  },
  {
    src: "/images/suite-private-access/spiral-staircase-bed.jpg",
    category: "Suite Private Access",
    name: "spiral-staircase-bed.jpg",
  },
  {
    src: "/images/suite-private-access/spiral-staircase-mezzanine.jpg",
    category: "Suite Private Access",
    name: "spiral-staircase-mezzanine.jpg",
  },
  {
    src: "/images/suite-private-access/staircase-bed-side.jpg",
    category: "Suite Private Access",
    name: "staircase-bed-side.jpg",
  },
  {
    src: "/images/suite-private-access/suite-bed-closeup.jpg",
    category: "Suite Private Access",
    name: "suite-bed-closeup.jpg",
  },
  {
    src: "/images/suite-private-access/suite-front-view-mirror.jpg",
    category: "Suite Private Access",
    name: "suite-front-view-mirror.jpg",
  },
  {
    src: "/images/suite-private-access/suite-main-view-2.png",
    category: "Suite Private Access",
    name: "suite-main-view-2.png",
  },

  // Tuscan Style (da public/images/tuscan-style/)
  { src: "/images/tuscan-style/amenities-oro-verde.jpg", category: "Tuscan Style", name: "amenities-oro-verde.jpg" },
  { src: "/images/tuscan-style/bathroom-flowers.jpg", category: "Tuscan Style", name: "bathroom-flowers.jpg" },
  { src: "/images/tuscan-style/bathroom-mirror-sink.jpg", category: "Tuscan Style", name: "bathroom-mirror-sink.jpg" },
  { src: "/images/tuscan-style/bed-bathroom-view.jpg", category: "Tuscan Style", name: "bed-bathroom-view.jpg" },
  { src: "/images/tuscan-style/bed-welcome-towels.jpg", category: "Tuscan Style", name: "bed-welcome-towels.jpg" },
  { src: "/images/tuscan-style/books-champagne-tea.jpg", category: "Tuscan Style", name: "books-champagne-tea.jpg" },
  { src: "/images/tuscan-style/klimt-artwork-detail.jpg", category: "Tuscan Style", name: "klimt-artwork-detail.jpg" },
  { src: "/images/tuscan-style/mirror-view-klimt.jpg", category: "Tuscan Style", name: "mirror-view-klimt.jpg" },
  {
    src: "/images/tuscan-style/nightstand-flowers-phone.jpg",
    category: "Tuscan Style",
    name: "nightstand-flowers-phone.jpg",
  },
  { src: "/images/tuscan-style/room-tv-windows.jpg", category: "Tuscan Style", name: "room-tv-windows.jpg" },
  { src: "/images/tuscan-style/shower-glass-modern.jpg", category: "Tuscan Style", name: "shower-glass-modern.jpg" },
]

export async function POST(request: Request) {
  try {
    console.log("[v0] Starting photo migration...")

    // Verifica categorie esistenti
    const { data: categories } = await supabase.from("photo_categories").select("id, name, slug")

    const categoryMap = new Map(categories?.map((c) => [c.name.toLowerCase(), c.id]) || [])

    let migrated = 0
    let skipped = 0

    // Controlla quali foto esistono già in Blob
    const { blobs } = await list()
    const existingUrls = new Set(blobs.map((b) => b.url))

    for (const photo of HARDCODED_PHOTOS) {
      // Trova la categoria
      const categoryId = categoryMap.get(photo.category.toLowerCase())

      if (!categoryId) {
        console.log(`[v0] Category not found: ${photo.category}, skipping...`)
        skipped++
        continue
      }

      // Crea URL di Blob simulato (dato che le foto sono nella cartella public)
      const blobUrl = `https://blob.vercel-storage.com/${photo.name}`

      // Controlla se già esiste nel database
      const { data: existing } = await supabase.from("photos").select("id").eq("filename", photo.name).maybeSingle()

      if (existing) {
        console.log(`[v0] Photo already exists: ${photo.name}`)
        skipped++
        continue
      }

      // Inserisci nel database
      const { error } = await supabase.from("photos").insert({
        filename: photo.name,
        url: photo.src, // Usa il percorso pubblico per ora
        category_id: categoryId,
        uploaded_by: null, // Sistema di migrazione
      })

      if (error) {
        console.error(`[v0] Error inserting ${photo.name}:`, error)
        continue
      }

      migrated++
      console.log(`[v0] Migrated: ${photo.name} -> ${photo.category}`)
    }

    return NextResponse.json({
      success: true,
      migrated,
      skipped,
      total: HARDCODED_PHOTOS.length,
    })
  } catch (error: any) {
    console.error("[v0] Migration error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
