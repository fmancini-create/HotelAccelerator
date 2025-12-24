import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

const REAL_FILES = [
  // Dependance Economy
  "bedroom-white-elegant.jpg",
  "bedroom-modern-beige-bathroom.jpg",
  "bedroom-cozy-warm.jpg",
  "bedroom-clean-white-bathroom.jpg",
  // Dependance Deluxe
  "deluxe-suite-bedroom-golden-art.jpg",
  "deluxe-suite-mezzanine-loft.jpg",
  "deluxe-suite-barcelona-armchair.jpg",
  "deluxe-suite-bathroom-modern.jpg",
  // Suite
  "suite-bedroom-tuscan-charm.jpg",
  "suite-living-fireplace.jpg",
  "suite-bathroom-elegant.jpg",
  // Suite Private Access
  "suite-private-bedroom-1.jpg",
  "suite-private-bedroom-2.jpg",
  "suite-private-bathroom.jpg",
  // Economy Private Access
  "economy-private-bedroom-1.jpg",
  "economy-private-bedroom-2.jpg",
  "economy-private-bathroom.jpg",
  // All other real images from public/images
]

export async function POST() {
  try {
    const supabase = await createClient()

    // Get all photos from database
    const { data: photos, error: fetchError } = await supabase.from("photos").select("id, filename, url")

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const photosToDelete: string[] = []

    // Mark photos for deletion if their filename doesn't match real files
    for (const photo of photos || []) {
      const filename = photo.filename || photo.url.split("/").pop() || ""
      const isRealFile = REAL_FILES.includes(filename)

      if (!isRealFile) {
        photosToDelete.push(photo.id)
      }
    }

    // Delete photos without physical files
    if (photosToDelete.length > 0) {
      const { error: deleteError } = await supabase.from("photos").delete().in("id", photosToDelete)

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      totalPhotos: photos?.length || 0,
      deletedPhotos: photosToDelete.length,
      remainingPhotos: (photos?.length || 0) - photosToDelete.length,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
