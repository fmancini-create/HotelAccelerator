import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { ImageGallery } from "@/components/image-gallery"
import { getPhotosByCategory } from "@/lib/get-photos"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Suite - Villa I Barronci Resort & Spa dans le Chianti",
  description: "Suites de luxe avec espace de vie séparé et vue imprenable sur les collines du Chianti.",
  alternates: {
    canonical: "/fr/chambres/suite",
    languages: { it: "/camere/suite", en: "/en/rooms/suite", de: "/de/zimmer/suite" },
  },
}

export default async function SuitePage() {
  const galleryImages = await getPhotosByCategory("suite")

  return (
    <main className="min-h-screen bg-background">
      <Navigation />
      <section id="toppage" className="relative h-screen">
        <ImageGallery images={galleryImages} heroIndex={0} className="absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none z-10">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-white mb-4 leading-tight">Luxe Exclusif</h1>
          <h2 className="text-2xl md:text-3xl text-white/95 font-serif font-light">Suite avec Vue Panoramique</h2>
        </div>
      </section>

      <section id="contenu" className="py-20 bg-[#f5f3f0]">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h1 className="font-serif text-[#8b7355] text-4xl md:text-5xl mb-6">Suite</h1>
          <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>
          <h2 className="text-[#7a7a7a] text-xl md:text-2xl mb-10 font-serif">L'Expérience de Luxe Ultime</h2>
          <a
            href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=3"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#8b7355] hover:bg-[#6d5a42] text-white px-12 py-4 text-base font-semibold transition-colors mb-12"
          >
            RÉSERVER
          </a>
          <div className="text-[#7a7a7a] text-base leading-relaxed space-y-4">
            <p>Nos Suites offrent le summum du luxe avec des espaces généreux et un mobilier exclusif.</p>
            <p>
              La vue panoramique sur les collines du Chianti et les services premium font de chaque moment une
              expérience inoubliable.
            </p>
          </div>
        </div>
      </section>
      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </main>
  )
}
