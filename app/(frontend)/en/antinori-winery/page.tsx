import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Antinori Winery - 7 km from Villa I Barronci | Resort & Spa in Chianti",
  description:
    "Visit Antinori Winery, an architectural jewel 7 km from Villa I Barronci. Modern design and winemaking tradition in the heart of Chianti.",
  alternates: {
    canonical: "/en/antinori-winery",
    languages: { it: "/cantina-antinori", de: "/de/weingut-antinori", fr: "/fr/cave-antinori" },
  },
}

export default function AntinoriWineryPage() {
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
          <h1 className="font-serif text-5xl md:text-7xl mb-6">ANTINORI WINERY</h1>
          <p className="text-xl md:text-2xl max-w-3xl">
            Visit Antinori Winery, an authentic architectural jewel just steps from Villa I Barronci
          </p>
        </div>
      </section>

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
                alt="Iconic spiral staircase of Antinori Winery"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8">Villa I Barronci Resort & Spa</h2>
            <p className="text-lg text-foreground mb-8">ANTINORI WINERY – 7 km from Villa I Barronci</p>
          </div>
          <div className="max-w-4xl mx-auto space-y-6 text-muted-foreground leading-relaxed mb-12">
            <p>
              Just a few kilometers from Villa I Barronci, nestled in the heart of Chianti, you will find Antinori
              Winery, an authentic architectural and functional jewel. This contemporary masterpiece is the perfect
              meeting point between winemaking tradition and modern design, where every detail has been conceived to
              celebrate wine culture.
            </p>
            <p>
              During your stay at Villa I Barronci, you can experience a unique visit to Antinori Winery: a place where
              art, nature and innovation blend together, giving you an unforgettable immersion in the history and
              quality of Tuscan wines.
            </p>
          </div>
          <div className="flex justify-center">
            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg" asChild>
              <a
                href="https://www.antinori.it/it/experience/antinori-nel-chianti-classico-visita-tinaia/prenota-una-visita/"
                target="_blank"
                rel="noopener noreferrer"
              >
                BOOK A VISIT
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
