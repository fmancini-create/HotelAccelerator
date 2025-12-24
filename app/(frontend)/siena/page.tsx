import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Visitare Siena - 30 km da Villa I Barronci | Resort & Spa nel Chianti",
  description:
    "Siena medievale a 30 km da Villa I Barronci. Piazza del Campo, Duomo, Palio e il fascino intatto del Medioevo toscano.",
}

export default function SienaPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2023/08/Piazza-del-Campo-Siena.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <p className="text-sm md:text-base uppercase tracking-wider mb-4">VISITA LA CITTÀ DEL PALIO</p>
          <h1 className="font-serif text-5xl md:text-7xl mb-6">SIENA</h1>
          <p className="text-xl md:text-2xl max-w-3xl">a 30 km da Villa I Barronci</p>
        </div>
      </section>

      {/* Content Section */}
      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-muted-foreground" />
          </div>

          <div className="border-t border-muted mb-12" />

          <div className="max-w-4xl mx-auto">
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8">Villa I Barronci Resort & Spa</h2>

            <p className="text-lg text-muted-foreground mb-12">
              Siena è una delle città medievali meglio conservate d'Italia. Il suo centro storico è Patrimonio
              dell'Umanità UNESCO e custodisce tesori artistici e architettonici di inestimabile valore.
            </p>

            <div className="space-y-10">
              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">PIAZZA DEL CAMPO</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Il cuore pulsante di Siena, con la sua caratteristica forma a conchiglia. Due volte all'anno, la
                  piazza si trasforma nell'arena del celeberrimo Palio, una corsa di cavalli che affonda le sue radici
                  nel Medioevo e divide la città nelle sue 17 contrade.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">IL DUOMO</h3>
                <p className="text-muted-foreground leading-relaxed">
                  La Cattedrale di Santa Maria Assunta è uno dei massimi capolavori dell'architettura gotica italiana.
                  La facciata in marmo bianco e nero, il pavimento intarsiato e gli affreschi della Libreria Piccolomini
                  sono solo alcune delle meraviglie che custodisce.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">TORRE DEL MANGIA</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Alta 88 metri, la Torre del Mangia domina Piazza del Campo e offre una vista spettacolare sulla città
                  e sulle colline senesi. I 400 gradini della salita sono ripagati da un panorama indimenticabile.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">IL PALIO</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Il 2 luglio e il 16 agosto Siena si ferma per il Palio, una tradizione centenaria che coinvolge
                  l'intera città. Ogni contrada difende i propri colori in una corsa emozionante che rappresenta l'anima
                  più autentica della città.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
