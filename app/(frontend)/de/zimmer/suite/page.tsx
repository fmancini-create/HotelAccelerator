import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { ImageGallery } from "@/components/image-gallery"
import { getPhotosByCategory } from "@/lib/get-photos"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Suite - Villa I Barronci Resort & Spa im Chianti",
  description: "Luxuriöse Suiten mit separatem Wohnbereich und atemberaubendem Blick auf die Chianti-Hügel.",
  alternates: {
    canonical: "/de/zimmer/suite",
    languages: { it: "/camere/suite", en: "/en/rooms/suite", fr: "/fr/chambres/suite" },
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
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-white mb-4 leading-tight">
            Exklusiver Luxus
          </h1>
          <h2 className="text-2xl md:text-3xl text-white/95 font-serif font-light">Suite mit Panoramablick</h2>
        </div>
      </section>

      <section id="inhalt" className="py-20 bg-[#f5f3f0]">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h1 className="font-serif text-[#8b7355] text-4xl md:text-5xl mb-6">Suite</h1>
          <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>
          <h2 className="text-[#7a7a7a] text-xl md:text-2xl mb-10 font-serif">Das ultimative Luxuserlebnis</h2>
          <a
            href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#8b7355] hover:bg-[#6d5a42] text-white px-12 py-4 text-base font-semibold transition-colors mb-12"
          >
            JETZT BUCHEN
          </a>
          <div className="text-[#7a7a7a] text-base leading-relaxed space-y-4">
            <p>Unsere Suiten bieten ultimativen Luxus mit großzügigen Räumen und exklusiver Einrichtung.</p>
            <p>
              Der Panoramablick auf die Chianti-Hügel und Premium-Services machen jeden Moment zu einem unvergesslichen
              Erlebnis.
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
