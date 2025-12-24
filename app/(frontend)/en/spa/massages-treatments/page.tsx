import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Massages & Treatments - Namaste Spa | Villa I Barronci",
  description:
    "Discover our range of massages and beauty treatments at Namaste Spa. Personalized wellness experiences in the heart of Chianti.",
  alternates: {
    canonical: "/en/spa/massages-treatments",
    languages: { it: "/spa/massaggi-trattamenti", de: "/de/spa/massagen-behandlungen", fr: "/fr/spa/massages-soins" },
  },
}

export default function MassagesTreatmentsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1920)" }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">MASSAGES & TREATMENTS</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Regenerate Body and Mind</p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Our Treatments</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              At Namaste Spa, we offer a wide range of massages and treatments designed to regenerate body and mind. Our
              qualified staff will guide you through a personalized wellness journey.
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>Relaxing massages</li>
              <li>Deep tissue massages</li>
              <li>Face and body treatments</li>
              <li>Aromatherapy</li>
              <li>Couple wellness experiences</li>
            </ul>
            <p>Book your treatment at reception or contact us for information about our wellness packages.</p>
          </div>
        </div>
      </section>
      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
