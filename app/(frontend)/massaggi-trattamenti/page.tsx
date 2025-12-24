import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Massaggi e Trattamenti | Villa I Barronci nel Chianti",
  description:
    "Trattamenti benessere personalizzati, massaggi rilassanti e rigeneranti. Operatori specializzati per il tuo relax nel Chianti.",
}

export default function MassaggiTrattamentiPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">Massaggi e Trattamenti</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Rigenerazione corpo e mente</p>
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
              Trattamenti Benessere Personalizzati
            </h2>

            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Scopri i nostri trattamenti pensati per il tuo benessere. I nostri operatori specializzati sapranno
              guidarti in un percorso di relax profondo e rigenerazione.
            </p>

            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg">
              PRENOTA IL TUO TRATTAMENTO
            </Button>
          </div>

          <div className="max-w-4xl mx-auto space-y-8 text-muted-foreground leading-relaxed">
            <div>
              <h3 className="font-serif text-2xl text-foreground mb-4">Massaggi Rilassanti</h3>
              <p>
                Lasciati coccolare dai nostri massaggi rilassanti, pensati per sciogliere tensioni e stress. Tecniche
                tradizionali e moderne si fondono per offrirti un'esperienza unica di benessere.
              </p>
            </div>

            <div>
              <h3 className="font-serif text-2xl text-foreground mb-4">Trattamenti Viso e Corpo</h3>
              <p>
                Trattamenti mirati con prodotti naturali e biologici per rigenerare la pelle e ritrovare luminosità ed
                elasticità. Ogni trattamento è personalizzato sulle tue esigenze specifiche.
              </p>
            </div>

            <div>
              <h3 className="font-serif text-2xl text-foreground mb-4">Percorsi Benessere</h3>
              <p>
                Percorsi completi che combinano diverse tecniche per un'esperienza di benessere totale. Dalla
                cromoterapia all'aromaterapia, ogni elemento è studiato per il tuo relax.
              </p>
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
