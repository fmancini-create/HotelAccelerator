import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { ImageGallery } from "@/components/image-gallery"
import { getPhotosByCategory } from "@/lib/get-photos"

export default async function CameraEconomyPage() {
  const galleryImages = await getPhotosByCategory("economy")

  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section with Gallery */}
      <section id="toppage" className="relative h-screen">
        <ImageGallery images={galleryImages} heroIndex={0} className="absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none z-10">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-white mb-4 leading-tight">
            Tutta la bellezza del Chianti
          </h1>
          <h2 className="text-2xl md:text-3xl text-white/95 font-serif font-light">Osservata da un luogo speciale</h2>
        </div>

        {/* Scroll Down Icon */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10">
          <a href="#contenuto" className="block animate-bounce">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </a>
        </div>
      </section>

      {/* Content Section */}
      <section id="contenuto" className="py-20 bg-[#f5f3f0]">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <div className="mb-8">
            <a href="#contenuto" className="inline-block">
              <svg className="w-10 h-10 text-[#999]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </a>
          </div>

          <h1 className="font-serif text-[#8b7355] text-4xl md:text-5xl mb-6">Camera Economy</h1>

          <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>

          <h2 className="text-[#7a7a7a] text-xl md:text-2xl mb-10 font-serif">
            Un soggiorno economico in una location da sogno
          </h2>

          <a
            href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#8b7355] hover:bg-[#6d5a42] text-white px-12 py-4 text-base font-semibold transition-colors mb-12"
          >
            PRENOTA
          </a>

          <div className="text-[#7a7a7a] text-base leading-relaxed space-y-4">
            <p>Esplora la magica bellezza del Chianti con il comfort accogliente delle nostre camere Economy.</p>
            <p>
              Progettate con attenzione al dettaglio, offrono un rifugio accogliente in cui godersi l'atmosfera serena
              della campagna toscana. Con servizi curati e un'atmosfera accogliente, ogni soggiorno diventa
              un'esperienza piacevole, indipendentemente dalla stagione.
            </p>
            <p>
              Nelle nostre camere Economy, potrai godere di una pausa rigenerante immersa nella natura incontaminata,
              assaporando i sapori autentici e i vini pregiati della regione.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Icons Section */}
      <CTAIconsSection />

      {/* Three Features Section */}
      <ThreeFeaturesSection />

      <Footer />
    </main>
  )
}
