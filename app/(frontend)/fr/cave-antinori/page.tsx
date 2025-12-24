import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { Button } from "@/components/ui/button"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cave Antinori - 7 km de Villa I Barronci | Resort & Spa dans le Chianti",
  description:
    "Visitez la Cave Antinori, un joyau architectural à 7 km de Villa I Barronci. Design moderne et tradition viticole.",
  alternates: {
    canonical: "/fr/cave-antinori",
    languages: { it: "/cantina-antinori", en: "/en/antinori-winery", de: "/de/weingut-antinori" },
  },
}

export default function CaveAntinoriPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/images/cantina-antinori/antinori-panorama.webp)" }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">CAVE ANTINORI</h1>
          <p className="text-xl md:text-2xl max-w-3xl">
            Visitez la Cave Antinori, un authentique joyau architectural à quelques pas de Villa I Barronci
          </p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">
            Villa I Barronci Resort & Spa
          </h2>
          <p className="text-lg text-center text-foreground mb-8">CAVE ANTINORI – à 7 km de Villa I Barronci</p>
          <div className="space-y-6 text-muted-foreground leading-relaxed mb-12">
            <p>
              À quelques kilomètres de Villa I Barronci, au cœur du Chianti, se trouve la Cave Antinori, un authentique
              joyau architectural et fonctionnel.
            </p>
            <p>
              Pendant votre séjour à Villa I Barronci, vous pouvez vivre une expérience unique en visitant la Cave
              Antinori : un lieu où l'art, la nature et l'innovation se fondent.
            </p>
          </div>
          <div className="flex justify-center">
            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg" asChild>
              <a
                href="https://www.antinori.it/it/experience/antinori-nel-chianti-classico-visita-tinaia/prenota-una-visita/"
                target="_blank"
                rel="noopener noreferrer"
              >
                RÉSERVER UNE VISITE
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
