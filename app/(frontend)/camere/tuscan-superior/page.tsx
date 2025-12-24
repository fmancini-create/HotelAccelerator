import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import Image from "next/image"

export const metadata = {
  title: "Camera Tuscan Superior - Villa I Barronci Resort & Spa",
  description: "Camera superior con spazi ampi, arredi di pregio e vista panoramica sul Chianti",
}

export default function CameraTuscanSuperiorPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section id="toppage" className="relative h-screen">
        <Image
          src="https://ibarronci.com/wp-content/uploads/2023/07/ibarronci-camera-tuscan-superior-01.webp"
          alt="Camera Tuscan Superior"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-white mb-4 leading-tight">
            Spazio e Comfort
          </h1>
          <h2 className="text-2xl md:text-3xl text-white/95 font-serif font-light">
            Per un soggiorno di lusso in Toscana
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

          <h1 className="font-serif text-[#8b7355] text-4xl md:text-5xl mb-6">Camera Tuscan Superior</h1>

          <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>

          <h2 className="text-[#7a7a7a] text-xl md:text-2xl mb-10 font-serif">Spazi ampi e vista panoramica</h2>

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
              Le camere Tuscan Superior offrono spazi più ampi e arredi di pregio per un soggiorno ancora più
              confortevole.
            </p>
            <p>
              Con vista panoramica sulle colline del Chianti, queste camere rappresentano la scelta ideale per chi cerca
              il massimo del comfort.
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
