import type { Metadata } from "next"
import Image from "next/image"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

export const metadata: Metadata = {
  title: "Galerie - Villa I Barronci Resort & Spa im Chianti",
  description:
    "Entdecken Sie Bilder der Villa I Barronci Resort & Spa: elegante Zimmer, Panoramapool, Restaurant Da Tiberio und die Schönheit des toskanischen Chianti.",
  alternates: {
    canonical: "/de/galerie",
    languages: {
      it: "/gallery",
      en: "/en/gallery",
      fr: "/fr/galerie",
    },
  },
}

const galleryImages = [
  {
    src: "/images/pool/piscina-tramonto.jpg",
    alt: "Panoramapool bei Sonnenuntergang mit Blick auf die Chianti-Hügel",
    title: "Pool bei Sonnenuntergang",
    category: "Pool & Entspannung",
  },
  {
    src: "/images/archi-colazione.jpg",
    alt: "Backsteinbögen mit Frühstück und Blick auf den toskanischen Garten",
    title: "Frühstück unter den Bögen",
    category: "Restaurant & Frühstück",
  },
  {
    src: "/images/villa-esterno.jpg",
    alt: "Villa I Barronci Außenbereich mit Garten und toskanischer Architektur",
    title: "Villa I Barronci",
    category: "Anlage",
  },
  {
    src: "/images/cantina-antinori/antinori-panorama.webp",
    alt: "Panorama-Innenansicht der Antinori-Kellerei mit Logo und Weinbergen",
    title: "Antinori-Kellerei",
    category: "Umgebung",
  },
  {
    src: "/images/cantina-antinori/antinori-spiral-full.webp",
    alt: "Ikonische Wendeltreppe der Antinori-Kellerei durch Glaswände gesehen",
    title: "Antinori-Architektur",
    category: "Umgebung",
  },
  {
    src: "/images/cantina-antinori/antinori-spiral-portrait.webp",
    alt: "Detail der Spiraltreppe der Antinori-Kellerei mit Weinbergblick",
    title: "Modernes Design",
    category: "Umgebung",
  },
]

export default function GaleriePage() {
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
          <h1 className="font-serif text-5xl md:text-6xl mb-4 text-balance">Galerie</h1>
          <p className="text-xl md:text-2xl text-pretty max-w-2xl mx-auto">
            Entdecken Sie die Schönheit der Villa I Barronci durch Bilder
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
          <h2 className="font-serif text-3xl md:text-4xl mb-6">Kommen Sie und erleben Sie es</h2>
          <p className="text-lg mb-8 max-w-2xl mx-auto text-pretty">
            Buchen Sie Ihren Aufenthalt in der Villa I Barronci und tauchen Sie ein in die Schönheit des toskanischen
            Chianti
          </p>
          <a
            href="https://ibarronci.reserve-online.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#8b7355] text-white px-8 py-3 rounded hover:bg-[#6d5940] transition-colors"
          >
            JETZT BUCHEN
          </a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
