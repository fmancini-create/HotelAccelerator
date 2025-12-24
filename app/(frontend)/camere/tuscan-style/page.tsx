import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import Image from "next/image"

export const metadata = {
  title: "Camera Tuscan Style - Villa I Barronci Resort & Spa",
  description: "Camera arredata con gusto toscano, comfort moderni e vista sulla campagna del Chianti",
}

export default function CameraTuscanStylePage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section id="toppage" className="relative h-screen">
        <Image
          src="https://ibarronci.com/wp-content/uploads/2023/07/ibarronci-camera-tuscan-style-02.webp"
          alt="Camera Tuscan Style"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-white mb-4 leading-tight">
            Stile Toscano Autentico
          </h1>
          <h2 className="text-2xl md:text-3xl text-white/95 font-serif font-light">
            Nel cuore della campagna del Chianti
          </h2>
        </div>

        <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
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

          <h1 className="font-serif text-[#8b7355] text-4xl md:text-5xl mb-6">Camera Tuscan Style</h1>

          <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>

          <h2 className="text-[#7a7a7a] text-xl md:text-2xl mb-10 font-serif">Eleganza e tradizione toscana</h2>

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
              Le camere Tuscan Style sono arredate con gusto e attenzione ai dettagli tipici della tradizione toscana.
            </p>
            <p>
              Ogni camera offre comfort moderni mantenendo il fascino autentico della campagna del Chianti, con vista
              sui vigneti e sulle colline circostanti.
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
