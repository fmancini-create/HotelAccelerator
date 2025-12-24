import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { ImageGallery } from "@/components/image-gallery"
import { getPhotosByCategory } from "@/lib/get-photos"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Economy Room - Villa I Barronci Resort & Spa in Chianti",
  description: "Explore the magical beauty of Chianti with the cozy comfort of our Economy rooms at Villa I Barronci.",
  alternates: {
    canonical: "/en/rooms/economy",
    languages: { it: "/camere/economy", de: "/de/zimmer/economy", fr: "/fr/chambres/economy" },
  },
}

export default async function EconomyRoomPage() {
  const galleryImages = await getPhotosByCategory("economy")

  return (
    <main className="min-h-screen bg-background">
      <Navigation />
      <section id="toppage" className="relative h-screen">
        <ImageGallery images={galleryImages} heroIndex={0} className="absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none z-10">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-white mb-4 leading-tight">
            All the Beauty of Chianti
          </h1>
          <h2 className="text-2xl md:text-3xl text-white/95 font-serif font-light">Seen from a Special Place</h2>
        </div>
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10">
          <a href="#content" className="block animate-bounce">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </a>
        </div>
      </section>

      <section id="content" className="py-20 bg-[#f5f3f0]">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h1 className="font-serif text-[#8b7355] text-4xl md:text-5xl mb-6">Economy Room</h1>
          <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>
          <h2 className="text-[#7a7a7a] text-xl md:text-2xl mb-10 font-serif">
            An affordable stay in a dream location
          </h2>
          <a
            href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=1"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#8b7355] hover:bg-[#6d5a42] text-white px-12 py-4 text-base font-semibold transition-colors mb-12"
          >
            BOOK NOW
          </a>
          <div className="text-[#7a7a7a] text-base leading-relaxed space-y-4">
            <p>Explore the magical beauty of Chianti with the cozy comfort of our Economy rooms.</p>
            <p>
              Designed with attention to detail, they offer a welcoming retreat to enjoy the serene atmosphere of the
              Tuscan countryside. With curated amenities and a cozy atmosphere, every stay becomes a pleasant
              experience, regardless of the season.
            </p>
            <p>
              In our Economy rooms, you can enjoy a rejuvenating break immersed in unspoiled nature, savoring authentic
              flavors and fine wines of the region.
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
