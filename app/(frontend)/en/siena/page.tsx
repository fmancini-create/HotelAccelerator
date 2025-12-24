import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Siena - 30 minutes from Villa I Barronci | Resort & Spa in Chianti",
  description:
    "Discover Siena, the medieval jewel of Tuscany, just 30 minutes from Villa I Barronci. Piazza del Campo, the Duomo and the Palio await you.",
  alternates: { canonical: "/en/siena", languages: { it: "/siena", de: "/de/siena", fr: "/fr/sienne" } },
}

export default function SienaPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=1920)" }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">SIENA</h1>
          <p className="text-xl md:text-2xl max-w-3xl">The Medieval Jewel of Tuscany, just 30 minutes away</p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Discover Siena</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              Siena, a UNESCO World Heritage Site, is a medieval city that has preserved its authentic charm intact.
              Famous for the Palio, the horse race held twice a year in Piazza del Campo, Siena offers a unique
              experience.
            </p>
            <p>
              Visit the magnificent Duomo, explore the narrow streets of the historic center and taste the typical local
              cuisine. Siena is a city that will captivate you with its beauty and authenticity.
            </p>
            <p>
              From Villa I Barronci, Siena is just 30 minutes away by car. A perfect destination for a day trip to
              discover medieval Tuscany.
            </p>
          </div>
        </div>
      </section>
      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
