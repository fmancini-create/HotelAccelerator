import { createServerClient } from "@/lib/supabase/server"

export async function getPhotosByCategory(categorySlug: string) {
  const supabase = await createServerClient()

  // For now, return all published photos since category system is not yet implemented
  const { data: photos, error } = await supabase
    .from("photos")
    .select("id, url, alt")
    .eq("is_published", true)
    .order("id", { ascending: true })

  if (error) {
    console.error("Error fetching photos:", error)
    return []
  }

  if (!photos || photos.length === 0) {
    console.log(`[v0] No photos found for category: ${categorySlug}`)
    return []
  }

  return photos.map((photo) => ({
    src: photo.url,
    alt: photo.alt || "Villa I Barronci photo",
  }))
}
