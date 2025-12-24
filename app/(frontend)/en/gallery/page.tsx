import type { Metadata } from "next"
import Image from "next/image"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

export const metadata: Metadata = {
  title: "Gallery - Villa I Barronci Resort & Spa in Chianti",
  description:
    "Discover images of Villa I Barronci Resort & Spa: elegant rooms, panoramic pool, Da Tiberio restaurant and the beauty of Tuscan Chianti.",
  alternates: {
    canonical: "/en/gallery",
    languages: {
      it: "/gallery",
      de: "/de/galerie",
      fr: "/fr/galerie",
    },
  },
}

const galleryImages = [
  {
    src: "/images/pool/piscina-tramonto.jpg",
    alt: "Panoramic pool at sunset with view of Chianti hills",
    title: "Pool at Sunset",
    category: "Pool & Relax",
  },
  {
    src: "/images/archi-colazione.jpg",
    alt: "Brick arches with breakfast and view of the Tuscan garden",
    title: "Breakfast under the Arches",
    category: "Restaurant & Breakfast",
  },
  {
    src: "/images/villa-esterno.jpg",
    alt: "Villa I Barronci exterior with garden and Tuscan architecture",
    title: "Villa I Barronci",
    category: "Property",
  },
  {
    src: "/images/cantina-antinori/antinori-panorama.webp",
    alt: "Panoramic interior view of Antinori Winery with logo and vineyards",
    title: "Antinori Winery",
    category: "Surroundings",
  },
  {
    src: "/images/cantina-antinori/antinori-spiral-full.webp",
    alt: "Iconic spiral staircase of Antinori Winery seen from glass walls",
    title: "Antinori Architecture",
    category: "Surroundings",
  },
  {
    src: "/images/cantina-antinori/antinori-spiral-portrait.webp",
    alt: "Detail of helical staircase Antinori Winery with vineyard view",
    title: "Modern Design",
    category: "Surroundings",
  },
]

export default function GalleryPage() {
  return (
    <main className="min-h-screen">
      <Navigation />

      <section className="relative h-[50vh] flex items-center justify-center">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(/images/pool/piscina-tramonto.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 text-center text-white px-4">
          <h1 className="font-serif text-5xl md:text-6xl mb-4 text-balance">Gallery</h1>
          <p className="text-xl md:text-2xl text-pretty max-w-2xl mx-auto">
            Discover the beauty of Villa I Barronci through images
          </p>
        </div>
      </section>

      <section className="bg-[#f5f1e8] py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {galleryImages.map((image, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-lg shadow-lg hover:shadow-2xl transition-all duration-300"
              >
                <div className="aspect-[4/3] relative">
                  <Image
                    src={image.src || "/placeholder.svg"}
                    alt={image.alt}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                      <p className="text-sm uppercase tracking-wider mb-2">{image.category}</p>
                      <h3 className="text-xl font-serif">{image.title}</h3>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-3xl md:text-4xl mb-6">Come live the experience</h2>
          <p className="text-lg mb-8 max-w-2xl mx-auto text-pretty">
            Book your stay at Villa I Barronci and immerse yourself in the beauty of Tuscan Chianti
          </p>
          <a
            href="https://ibarronci.reserve-online.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#8b7355] text-white px-8 py-3 rounded hover:bg-[#6d5940] transition-colors"
          >
            BOOK NOW
          </a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
