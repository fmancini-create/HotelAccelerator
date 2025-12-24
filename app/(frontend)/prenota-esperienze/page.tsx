import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { ChevronDown, DollarSign, Heart, MessageSquare, CheckCircle, UserCheck } from "lucide-react"
import type { Metadata } from "next"
import { ViatorWidget } from "@/components/viator-widget"

export const metadata: Metadata = {
  title: "Prenota le tue Esperienze | Villa I Barronci Resort & Spa nel Chianti",
  description:
    "Prenota biglietti e tour esclusivi in Toscana. Miglior prezzo garantito, assistenza dedicata e accesso prioritario. Servizio Viator.",
}

export default function PrenotaEsperienzeePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(https://ibarronci.com/wp-content/uploads/2023/08/Chianti-hills-vineyards-Tuscany.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">Villa I Barronci, nel cuore del Chianti</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Prenota le tue esperienze</p>
        </div>
      </section>

      {/* Content Section */}
      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-muted-foreground" />
          </div>

          <div className="border-t border-muted mb-12" />

          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8">Villa I Barronci Resort & Spa</h2>

            <p className="text-2xl text-foreground mb-12">Scopri i vantaggi di prenotare dal nostro sito!</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
            <div className="flex flex-col items-center text-center p-6">
              <DollarSign className="w-12 h-12 text-[#8b7355] mb-4" />
              <h3 className="font-serif text-xl text-foreground mb-2">Miglior prezzo garantito</h3>
              <p className="text-muted-foreground">Le migliori tariffe per le tue esperienze</p>
            </div>

            <div className="flex flex-col items-center text-center p-6">
              <Heart className="w-12 h-12 text-[#8b7355] mb-4" />
              <h3 className="font-serif text-xl text-foreground mb-2">Ottime recensioni</h3>
              <p className="text-muted-foreground">Dai viaggiatori più esigenti</p>
            </div>

            <div className="flex flex-col items-center text-center p-6">
              <MessageSquare className="w-12 h-12 text-[#8b7355] mb-4" />
              <h3 className="font-serif text-xl text-foreground mb-2">Accesso prioritario</h3>
              <p className="text-muted-foreground">Salti la fila e risparmi tempo</p>
            </div>

            <div className="flex flex-col items-center text-center p-6">
              <CheckCircle className="w-12 h-12 text-[#8b7355] mb-4" />
              <h3 className="font-serif text-xl text-foreground mb-2">Prenotazione semplice</h3>
              <p className="text-muted-foreground">Veloce e sicura</p>
            </div>

            <div className="flex flex-col items-center text-center p-6">
              <UserCheck className="w-12 h-12 text-[#8b7355] mb-4" />
              <h3 className="font-serif text-xl text-foreground mb-2">Assistenza dedicata</h3>
              <p className="text-muted-foreground">Per ogni tua esigenza</p>
            </div>
          </div>

          <div className="max-w-6xl mx-auto mb-16">
            <h3 className="font-serif text-3xl text-foreground text-center mb-8">Scegli la tua esperienza</h3>
            <ViatorWidget />
          </div>

          <div className="text-center max-w-3xl mx-auto">
            <p className="text-lg text-muted-foreground mb-8">
              Prenota ora i tuoi biglietti e tour esclusivi, vivi un'esperienza unica senza pensieri!
            </p>

            <p className="text-sm text-muted-foreground italic">Servizio offerto direttamente da Viator.</p>
          </div>
        </div>
      </section>

      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
