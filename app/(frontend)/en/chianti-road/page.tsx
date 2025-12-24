import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Chianti Wine Road - Villa I Barronci Resort & Spa",
  description:
    "Discover the Chianti Wine Road starting from Villa I Barronci. Wine cellars, medieval villages and breathtaking landscapes.",
  alternates: {
    canonical: "/en/chianti-road",
    languages: { it: "/strada-del-chianti", de: "/de/chianti-strasse", fr: "/fr/route-du-chianti" },
  },
}

export default function ChiantiRoadPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1523528283115-9bf9b1699245?w=1920)" }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">CHIANTI WINE ROAD</h1>
          <p className="text-xl md:text-2xl max-w-3xl">A Journey Through Vineyards and Medieval Villages</p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Explore Chianti</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              The Chianti Wine Road is one of the most beautiful wine routes in Italy. Starting from Villa I Barronci,
              you can explore this enchanting territory made of rolling hills, centuries-old vineyards and medieval
              villages.
            </p>
            <p>
              Visit historic wine cellars, taste award-winning wines and discover the secrets of Tuscan winemaking. Each
              stop along the road offers unique experiences and breathtaking views.
            </p>
            <p>
              Our concierge is available to organize personalized tours, wine tastings and visits to the best local
              wineries.
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
