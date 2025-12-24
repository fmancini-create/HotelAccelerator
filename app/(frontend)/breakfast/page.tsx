import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Breakfast - Colazione Bio e Km 0 | Villa I Barronci Resort & Spa",
  description:
    "Ricco buffet dolce e salato con prodotti artigianali, biologici e a Km 0. Colazione dalle 7:30 alle 10:30 ogni giorno.",
}

export default function BreakfastPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(https://ibarronci.com/wp-content/uploads/2023/08/Colazione-villa-i-barronci-resort-spa-nel-chianti.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">Villa i Barronci Breakfast</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Il buongiorno comincia qui</p>
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
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8">Villa I Barronci Resort & Spa</h2>

            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Tra le colline del Chianti tutta la qualità di un B&B di gran pregio
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-6 text-muted-foreground leading-relaxed">
            <p>
              Il nostro è un territorio tutto da scoprire, con sorprese spettacolari dietro ogni curva. Per questo è
              necessario iniziare la giornata nel modo migliore, con una colazione energica e gustosa per addolcire il
              tuo risveglio.
            </p>

            <p>
              A Villa I Barronci Resort & Spa troverai un <strong>ricco buffet dolce e salato</strong> con brioches,
              crostate e pasticcini tutto assolutamente artigianale, e ancora frutta fresca, yogurt, cereali,
              marmellate, uova, affettati, formaggi e torte salate con ingredienti di altissima qualità, biologici e a
              Km 0, inoltre il latte di capra proveniente dai pascoli Toscani in aggiunta a quello di mucca o di Soia.
            </p>

            <p>
              Ovviamente sui tavoli non mancheranno <strong>Pane Toscano</strong> e la{" "}
              <strong>schiacciata tipica della zona</strong>; sarà inoltre disponibile un servizio caffetteria con
              bevande calde su ordinazione o self service grazie alla nuovissima macchina Franke, che unisce modernità e
              qualità in una sola azione!
            </p>

            <p>
              Per venire incontro alle esigenze di tutti i nostri ospiti, il buffet è inoltre sempre fornito anche di{" "}
              <strong>prodotti bio, dietetici, per celiaci e diabetici</strong>.
            </p>

            <p className="text-xl text-foreground font-semibold">
              Il servizio di colazione è aperto dalle 7:30 alle 10:30, ma in occasioni speciali la nostra struttura
              serve anche brunch e light lunch in tarda mattinata.
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
