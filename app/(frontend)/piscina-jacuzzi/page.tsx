import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Piscina & Jacuzzi - Riscaldata 36° | Villa I Barronci Resort & Spa",
  description:
    "Piscina panoramica riscaldata a 36 gradi, aperta tutto l'anno. Acqua termalizzata e relax assoluto nel cuore del Chianti.",
}

export default function PiscinaJacuzziPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(/images/pool/piscina-tramonto.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">Una piscina illuminata dai colori del tramonto…</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Villa I Barronci Piscina & Jacuzzi</p>
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
              Piscina riscaldata, aperta tutto l'anno
            </h2>

            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              La nostra meravigliosa piscina, con acqua riscaldata a 36 gradi costanti, è aperta tutto l'anno ed è in
              grado di regalare ai nostri ospiti una esperienza di relax assoluto.
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-6 text-muted-foreground leading-relaxed mb-12">
            <p>
              È la splendida atmosfera che i nostri ospiti potranno vivere soggiornando presso Villa I Barronci Resort &
              Spa.
            </p>

            <p>
              Nel parco della nostra struttura si trova infatti{" "}
              <strong>un'incantevole piscina panoramica di 7 metri per 12</strong>, a fianco alla quale si sviluppa la
              zona idro.
            </p>

            <p>
              Ancora più incantevole dai primi giorni di marzo perché{" "}
              <strong>esposta al sole in maniera continua</strong>, e vicina alla veranda arredata con comodi divanetti,
              è la location ideale per staccare la spina e concedersi qualche momento di relax.
            </p>

            <p>
              La piscina esterna è <strong>aperta tutto l'anno</strong>, contiene <strong>acqua termalizzata</strong>{" "}
              (cioè arricchita di sali di magnesio e potassio ad effetto benefico sull'organismo) ed è{" "}
              <strong>costantemente riscaldata a 36 gradi centigradi</strong>.
            </p>

            <p>
              Dispone una pergola bioclimatica adiacente con <strong>biosauna</strong>. L'impianto resta aperto salvo
              casi di maltempo per motivi di sicurezza.
            </p>
          </div>

          {/* Featured Image */}
          <div className="max-w-5xl mx-auto mb-12">
            <img
              src="/images/pool/piscina-tramonto.jpg"
              alt="Piscina riscaldata panoramica con vista colline del Chianti al tramonto"
              className="w-full h-auto rounded-lg shadow-lg"
            />
          </div>
        </div>
      </section>

      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
