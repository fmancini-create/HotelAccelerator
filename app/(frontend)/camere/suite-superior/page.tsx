import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Suite Superior con accesso privato | Villa I Barronci Resort & Spa",
  description:
    "Luxury Experience nel cuore del Chianti. Suite Superior con accesso privato, lusso e raffinatezza nella parte antica della villa.",
}

export default function SuiteSuperiorPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2024/11/villa-ibarronci-009-1.webp)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">Luxury Experience in the heart of Chianti</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Villa I Barronci Suites</p>
        </div>
      </section>

      {/* Content Section */}
      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-muted-foreground" />
          </div>

          <div className="border-t border-muted mb-12" />

          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8">
              Villa I Barronci Suite con accesso privato
            </h2>

            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Situata nella parte antica e raffinata della villa, la Suite Superior di Villa I Barronci Resort & Spa è
              un'esperienza di lusso senza pari.
            </p>

            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg">
              PRENOTA
            </Button>
          </div>

          <div className="max-w-4xl mx-auto space-y-6 text-center text-muted-foreground leading-relaxed">
            <p>
              Questo spazioso rifugio offre un'atmosfera di comfort e raffinatezza, arricchita da un tocco di eleganza
              toscana. Gli ampi spazi sono impreziositi da arredi di pregio e dettagli curati, creando un'atmosfera di
              lusso e relax.
            </p>

            <p>
              Ogni dettaglio è stato pensato per garantire il massimo comfort e piacere ai nostri ospiti. I letti con
              materassi memory e cuscini anallergici assicurano un riposo rigenerante, mentre il sistema Comfort Zone
              regola la temperatura secondo le preferenze personali, garantendo un soggiorno indimenticabile in ogni
              periodo dell'anno.
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
