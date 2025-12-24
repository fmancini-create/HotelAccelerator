import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pool & Jacuzzi - Villa I Barronci Resort & Spa",
  description: "Relax in our panoramic pool and jacuzzi with breathtaking views of the Chianti hills.",
  alternates: {
    canonical: "/en/pool-jacuzzi",
    languages: { it: "/piscina-jacuzzi", de: "/de/pool-jacuzzi", fr: "/fr/piscine-jacuzzi" },
  },
}

export default function PoolJacuzziPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/images/pool/piscina-tramonto.jpg)" }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">POOL & JACUZZI</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Relax with a Panoramic View of Chianti</p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Total Relaxation</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              Our panoramic pool is the perfect place to relax while admiring the breathtaking views of the Chianti
              hills. Immersed in the Tuscan landscape, you can enjoy moments of pure relaxation.
            </p>
            <p>
              The heated jacuzzi is available for guests who want an extra touch of wellness. Perfect after a day
              exploring the Tuscan territory.
            </p>
            <p>Pool bar service is available during the summer season with refreshing drinks and light snacks.</p>
          </div>
        </div>
      </section>
      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
