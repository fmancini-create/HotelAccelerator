import { createServerClient } from "@/lib/supabase/server"

export type PublishedPhoto = {
  id: string
  url: string
  alt: string
}

export async function getPublishedPhotosByCategory(categorySlug: string): Promise<PublishedPhoto[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("photos")
    .select(`
      id,
      url,
      alt,
      photo_categories!inner (
        category:categories!inner (
          slug
        )
      )
    `)
    .eq("is_published", true)
    .eq("photo_categories.category.slug", categorySlug)

  if (error) {
    console.error("Error fetching photos:", error)
    return []
  }

  return data.map((photo) => ({
    id: photo.id,
    url: photo.url,
    alt: photo.alt || "Villa I Barronci",
  }))
}

export async function getAllPublishedPhotos(): Promise<PublishedPhoto[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("photos")
    .select("id, url, alt")
    .eq("is_published", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching photos:", error)
    return []
  }

  return data.map((photo) => ({
    id: photo.id,
    url: photo.url,
    alt: photo.alt || "Villa I Barronci",
  }))
}
