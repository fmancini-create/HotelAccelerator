import type { Metadata } from "next"
import Image from "next/image"

export const metadata: Metadata = {
  title: "Gallery - Villa I Barronci Resort & Spa nel Chianti",
  description:
    "Scopri le immagini di Villa I Barronci Resort & Spa: camere eleganti, piscina panoramica, ristorante Da Tiberio e la bellezza del Chianti toscano.",
  openGraph: {
    title: "Gallery - Villa I Barronci Resort & Spa",
    description:
      "Scopri le immagini di Villa I Barronci Resort & Spa: camere eleganti, piscina panoramica, ristorante Da Tiberio e la bellezza del Chianti toscano.",
    type: "website",
  },
}

const galleryImages = [
  {
    src: "/images/pool/piscina-tramonto.jpg",
    alt: "Piscina panoramica al tramonto con vista sulle colline del Chianti",
    title: "Piscina al Tramonto",
    category: "Piscina & Relax",
  },
  {
    src: "/images/archi-colazione.jpg",
    alt: "Archi in mattoni con colazione e vista sul giardino toscano",
    title: "Colazione sotto gli Archi",
    category: "Ristorante & Colazione",
  },
  {
    src: "/images/villa-esterno.jpg",
    alt: "Esterno Villa I Barronci con giardino e architettura toscana",
    title: "Villa I Barronci",
    category: "Struttura",
  },
  {
    src: "/images/cantina-antinori/antinori-panorama.webp",
    alt: "Vista panoramica interna Cantina Antinori con logo e vigneti",
    title: "Cantina Antinori",
    category: "Dintorni",
  },
  {
    src: "/images/cantina-antinori/antinori-spiral-full.webp",
    alt: "Scala a spirale iconica della Cantina Antinori vista dalle vetrate",
    title: "Architettura Antinori",
    category: "Dintorni",
  },
  {
    src: "/images/cantina-antinori/antinori-spiral-portrait.webp",
    alt: "Dettaglio scala elicoidale Cantina Antinori con vista vigneti",
    title: "Design Moderno",
    category: "Dintorni",
  },
]

export default function GalleryPage() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
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
            Scopri la bellezza di Villa I Barronci attraverso le immagini
          </p>
        </div>
      </section>

      {/* Gallery Grid */}
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

      {/* CTA Section */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-3xl md:text-4xl mb-6">Vieni a vivere l'esperienza</h2>
          <p className="text-lg mb-8 max-w-2xl mx-auto text-pretty">
            Prenota il tuo soggiorno a Villa I Barronci e immergiti nella bellezza del Chianti toscano
          </p>
          <a
            href="https://ibarronci.reserve-online.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#8b7355] text-white px-8 py-3 rounded hover:bg-[#6d5940] transition-colors"
          >
            PRENOTA ORA
          </a>
        </div>
      </section>
    </main>
  )
}
