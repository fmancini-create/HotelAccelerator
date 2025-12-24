import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { ImageGallery } from "@/components/image-gallery"
import { getPhotosByCategory } from "@/lib/get-photos"

export const metadata = {
  title: "Dependance - Villa I Barronci Resort & Spa",
  description: "Camera nella dependance storica di Villa I Barronci, privacy e charme toscano nel Chianti",
}

export default async function DependancePage() {
  const deluxeImages = await getPhotosByCategory("dependance-deluxe")
  const economyImages = await getPhotosByCategory("economy-private-access")

  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section id="toppage" className="relative h-screen">
        <ImageGallery images={deluxeImages} heroIndex={0} className="absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none z-10">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-white mb-4 leading-tight">
            Charme e Riservatezza
          </h1>
          <h2 className="text-2xl md:text-3xl text-white/95 font-serif font-light">
            Le camere nella Dependance storica
          </h2>
        </div>

        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10">
          <a href="#contenuto" className="block animate-bounce">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </a>
        </div>
      </section>

      <section id="contenuto" className="py-20 bg-[#f5f3f0]">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <div className="mb-8">
            <a href="#contenuto" className="inline-block">
              <svg className="w-10 h-10 text-[#999]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </a>
          </div>

          <h1 className="font-serif text-[#8b7355] text-4xl md:text-5xl mb-6">Dependance</h1>

          <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>

          <h2 className="text-[#7a7a7a] text-xl md:text-2xl mb-10 font-serif">Camere nella dependance storica</h2>

          <a
            href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#8b7355] hover:bg-[#6d5a42] text-white px-12 py-4 text-base font-semibold transition-colors mb-12"
          >
            PRENOTA
          </a>

          <div className="text-[#7a7a7a] text-base leading-relaxed space-y-4">
            <p>
              Le camere Dependance si trovano nell'edificio storico adiacente alla villa principale, offrendo maggiore
              privacy e riservatezza.
            </p>
            <p>
              Con il loro charme toscano autentico, travi a vista e arredi curati, queste camere sono ideali per chi
              desidera un soggiorno tranquillo immerso nell'atmosfera del Chianti, pur avendo accesso a tutti i servizi
              del resort.
            </p>
          </div>
        </div>
      </section>

      <section id="deluxe" className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="font-serif text-[#8b7355] text-3xl md:text-4xl mb-4 text-center">Dependance Deluxe</h2>
          <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>
          <p className="text-[#7a7a7a] text-center mb-12 max-w-2xl mx-auto">
            Camere spaziose con arredi antichi, travi a vista e accesso privato al giardino. Il massimo del comfort
            nella cornice storica della dependance.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {deluxeImages.map((image, index) => (
              <div key={index} className="aspect-[4/3] relative overflow-hidden rounded-lg group cursor-pointer">
                <img
                  src={image.src || "/placeholder.svg"}
                  alt={image.alt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="economy" className="py-20 bg-[#f5f3f0]">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="font-serif text-[#8b7355] text-3xl md:text-4xl mb-4 text-center">Economy Accesso Privato</h2>
          <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>
          <p className="text-[#7a7a7a] text-center mb-12 max-w-2xl mx-auto">
            Camere accoglienti e funzionali con accesso privato indipendente, ideali per chi cerca comfort e privacy
            nella suggestiva cornice della dependance storica.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {economyImages.map((image, index) => (
              <div key={index} className="aspect-[4/3] relative overflow-hidden rounded-lg group cursor-pointer">
                <img
                  src={image.src || "/placeholder.svg"}
                  alt={image.alt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </main>
  )
}
