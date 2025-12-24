import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cantina Antinori - 7 km da Villa I Barronci | Resort & Spa nel Chianti",
  description:
    "Visita la Cantina Antinori, gioiello architettonico a 7 km da Villa I Barronci. Design moderno e tradizione vinicola nel cuore del Chianti.",
}

export default function CantinaAntinoriPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(/images/cantina-antinori/antinori-panorama.webp)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">CANTINA ANTINORI</h1>
          <p className="text-xl md:text-2xl max-w-3xl">
            Visita la Cantina Antinori, un autentico gioiello di architettura ad un passo da Villa i Barronci
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-muted-foreground" />
          </div>

          <div className="border-t border-muted mb-12" />

          <div className="max-w-5xl mx-auto mb-12">
            <div className="relative aspect-video rounded-lg overflow-hidden shadow-2xl">
              <img
                src="/images/cantina-antinori/antinori-spiral-full.webp"
                alt="Scala a spirale iconica della Cantina Antinori"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8">Villa I Barronci Resort & Spa</h2>

            <p className="text-lg text-foreground mb-8">CANTINA ANTINORI – a 7 km da Villa I Barronci</p>
          </div>

          <div className="max-w-4xl mx-auto space-y-6 text-muted-foreground leading-relaxed mb-12">
            <p>
              A pochi chilometri da Villa I Barronci, immersa nel cuore del Chianti, si trova la Cantina Antinori, un
              autentico gioiello architettonico e funzionale. Questo capolavoro contemporaneo è il perfetto incontro tra
              tradizione vinicola e design moderno, dove ogni dettaglio è stato pensato per celebrare la cultura del
              vino.
            </p>

            <p>
              Durante il tuo soggiorno a Villa I Barronci, potrai vivere un'esperienza unica visitando la Cantina
              Antinori: un luogo dove arte, natura e innovazione si fondono, regalandoti un'immersione indimenticabile
              nella storia e nella qualità dei vini toscani.
            </p>
          </div>

          <div className="flex justify-center">
            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg" asChild>
              <a
                href="https://www.antinori.it/it/experience/antinori-nel-chianti-classico-visita-tinaia/prenota-una-visita/"
                target="_blank"
                rel="noopener noreferrer"
              >
                PRENOTA UNA VISITA
              </a>
            </Button>
          </div>
        </div>
      </section>

      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
