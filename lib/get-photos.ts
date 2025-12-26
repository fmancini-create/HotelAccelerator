// instead of database which has no category support yet

const CATEGORY_IMAGES: Record<string, { src: string; alt: string }[]> = {
  "dependance-deluxe": [
    { src: "/images/dependance/deluxe/bedroom-arched-window.jpg", alt: "Camera Dependance Deluxe - finestra ad arco" },
    {
      src: "/images/dependance/deluxe/bedroom-beams-garden-view.jpg",
      alt: "Camera Dependance Deluxe - travi e vista giardino",
    },
    { src: "/images/dependance/deluxe/bedroom-bright.jpg", alt: "Camera Dependance Deluxe - luminosa" },
    {
      src: "/images/dependance/deluxe/bedroom-contemporary-mix.jpg",
      alt: "Camera Dependance Deluxe - stile contemporaneo",
    },
    { src: "/images/dependance/deluxe/bedroom-minimal-white.jpg", alt: "Camera Dependance Deluxe - stile minimal" },
    {
      src: "/images/dependance/deluxe/suite-spacious-antique.jpg",
      alt: "Camera Dependance Deluxe - spaziosa con arredi antichi",
    },
    { src: "/images/dependance/deluxe/bathroom-elegant.jpg", alt: "Bagno Dependance Deluxe - elegante" },
    { src: "/images/dependance/deluxe/bathroom-mosaic-tiles.jpg", alt: "Bagno Dependance Deluxe - mosaico" },
    { src: "/images/dependance/deluxe/bathroom-double-mirror.jpg", alt: "Bagno Dependance Deluxe - doppio specchio" },
    { src: "/images/dependance/deluxe/bathroom-yellow-walls.jpg", alt: "Bagno Dependance Deluxe - pareti gialle" },
    {
      src: "/images/dependance/deluxe/private-garden-access.jpg",
      alt: "Dependance Deluxe - accesso privato al giardino",
    },
    { src: "/images/dependance/deluxe/living-area-artwork.jpg", alt: "Dependance Deluxe - zona living con arte" },
  ],
  "economy-private-access": [
    { src: "/images/dependance/economy/bedroom-private-access.jpg", alt: "Camera Economy - accesso privato" },
    { src: "/images/dependance/economy/bedroom-white-elegant.jpg", alt: "Camera Economy - elegante bianca" },
    { src: "/images/dependance/economy/bedroom-artwork-beams.jpg", alt: "Camera Economy - arte e travi" },
    { src: "/images/dependance/economy/bedroom-desk-tv-corner.jpg", alt: "Camera Economy - angolo scrivania e TV" },
    {
      src: "/images/dependance/economy/bathroom-backlit-mirror-1.jpg",
      alt: "Bagno Economy - specchio retroilluminato",
    },
    {
      src: "/images/dependance/economy/bathroom-backlit-mirror-2.jpg",
      alt: "Bagno Economy - specchio retroilluminato",
    },
    { src: "/images/dependance/economy/bathroom-beige-modern.jpg", alt: "Bagno Economy - moderno beige" },
    { src: "/images/dependance/economy/bathroom-shower-compact.jpg", alt: "Bagno Economy - doccia compatta" },
  ],
  suite: [
    { src: "/images/suite/bedroom-arched-window.jpg", alt: "Suite - finestra ad arco" },
    { src: "/images/suite/bedroom-champagne-setup.jpg", alt: "Suite - setup champagne" },
    { src: "/images/suite/bedroom-golden-art-frontal.jpg", alt: "Suite - arte dorata" },
    { src: "/images/suite/bedroom-painted-wardrobe.jpg", alt: "Suite - armadio dipinto" },
    { src: "/images/suite/bedroom-portrait-painting.jpg", alt: "Suite - ritratto" },
    { src: "/images/suite/bedroom-wide-view.jpg", alt: "Suite - vista ampia" },
    { src: "/images/suite/bathroom-mosaic-modern.jpg", alt: "Bagno Suite - mosaico moderno" },
    { src: "/images/suite/bathroom-mosaic-sink-1.jpg", alt: "Bagno Suite - lavabo mosaico" },
    { src: "/images/suite/full-view-kitchenette.jpg", alt: "Suite - vista completa con angolo cottura" },
  ],
  "suite-private-access": [
    { src: "/images/suite-private-access/full-suite-view.jpg", alt: "Suite Private Access - vista completa" },
    {
      src: "/images/suite-private-access/bedroom-barcelona-chairs.jpg",
      alt: "Suite Private Access - poltrone Barcelona",
    },
    {
      src: "/images/suite-private-access/bedroom-chaise-staircase.jpg",
      alt: "Suite Private Access - chaise longue e scala",
    },
    { src: "/images/suite-private-access/mezzanine-bedroom.jpg", alt: "Suite Private Access - camera soppalco" },
    { src: "/images/suite-private-access/spiral-staircase-bed.jpg", alt: "Suite Private Access - scala a chiocciola" },
    {
      src: "/images/suite-private-access/living-area-private-entrance.jpg",
      alt: "Suite Private Access - ingresso privato",
    },
    {
      src: "/images/suite-private-access/bathroom-terracotta-shower.jpg",
      alt: "Bagno Suite Private Access - doccia terracotta",
    },
    { src: "/images/suite-private-access/duplex-overview-chaise.jpg", alt: "Suite Private Access - vista duplex" },
  ],
  "tuscan-style": [
    { src: "/images/suite/bedroom-arched-window.jpg", alt: "Tuscan Style - finestra ad arco" },
    { src: "/images/suite/bedroom-painted-wardrobe.jpg", alt: "Tuscan Style - armadio dipinto" },
    { src: "/images/suite/bedroom-portrait-painting.jpg", alt: "Tuscan Style - ritratto" },
    { src: "/images/suite/bathroom-mosaic-modern.jpg", alt: "Bagno Tuscan Style - mosaico moderno" },
  ],
  piscina: [{ src: "/images/pool/piscina-tramonto.jpg", alt: "Piscina al tramonto" }],
  ristorante: [{ src: "/images/archi-colazione.jpg", alt: "Ristorante - colazione sotto gli archi" }],
}

export async function getPhotosByCategory(categorySlug: string) {
  // Use hardcoded images for now since database categories are not populated
  const images = CATEGORY_IMAGES[categorySlug]

  if (images && images.length > 0) {
    return images
  }

  // Fallback: try to load from database
  try {
    const { createServerClient } = await import("@/lib/supabase/server")
    const supabase = await createServerClient()

    const { data: photos, error } = await supabase
      .from("photos")
      .select("id, url, alt")
      .eq("is_published", true)
      .order("id", { ascending: true })
      .limit(12)

    if (error || !photos || photos.length === 0) {
      console.log(`[v0] No photos found for category: ${categorySlug}`)
      return []
    }

    return photos.map((photo) => ({
      src: photo.url,
      alt: photo.alt || "Villa I Barronci photo",
    }))
  } catch {
    return []
  }
}
