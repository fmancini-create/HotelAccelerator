import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Palazzo Tempi - Appartamenti | Villa I Barronci Resort & Spa",
  description: "Palazzo Tempi, appartamenti storici nel cuore del Chianti a San Casciano in Val di Pesa.",
}

export default function PalazzoTempiPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(https://ibarronci.com/wp-content/uploads/2023/08/Palazzo-tempi-villa-i-barronci-resort-spa-nel-chianti.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">Palazzo Tempi</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Nel cuore di San Casciano in Val di Pesa</p>
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
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8">Palazzo Tempi</h2>

            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Appartamenti storici nel centro di San Casciano
            </p>

            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg">
              PRENOTA
            </Button>
          </div>

          <div className="max-w-4xl mx-auto space-y-6 text-center text-muted-foreground leading-relaxed">
            <p>
              Palazzo Tempi rappresenta un'opportunità unica di soggiornare in un palazzo storico nel cuore di San
              Casciano in Val di Pesa, a pochi passi da Villa I Barronci.
            </p>

            <p>
              Gli appartamenti combinano il fascino dell'architettura storica toscana con comfort moderni, offrendo una
              base perfetta per esplorare il Chianti e godere dei servizi del resort.
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
