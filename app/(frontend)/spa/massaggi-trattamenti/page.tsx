import type { Metadata } from "next"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { ChevronDown } from "lucide-react"

export const metadata: Metadata = {
  title: "Massaggi e Trattamenti - Villa I Barronci Resort & Spa",
  description:
    "Percorsi benessere personalizzati nel cuore del Chianti. Massaggi rilassanti, trattamenti viso e corpo per rigenerare mente e corpo immersi nella natura toscana.",
}

export default function MassaggiTrattamentiPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <section className="relative h-screen flex items-center justify-center text-center text-white">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://www.ibarronci.com/wp-content/uploads/2023/08/massaggi-trattamenti-villa-barronci.jpg')",
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
        </div>

        <div className="relative z-10 max-w-4xl px-4">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif mb-6">Massaggi e Trattamenti</h1>
          <p className="text-xl md:text-2xl font-light">Percorsi benessere personalizzati</p>
        </div>
      </section>

      <section className="bg-[#f5f1ed] py-20">
        <div className="container mx-auto px-6">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-[#8b7355]" />
          </div>

          <div className="max-w-4xl mx-auto text-center mb-12">
            <div className="w-20 h-px bg-[#8b7355] mx-auto mb-8" />
            <h2 className="text-4xl md:text-5xl font-serif mb-8 text-balance">Massaggi e Trattamenti</h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Rigenerati con percorsi benessere su misura
            </p>

            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#8b7355] text-white px-12 py-4 hover:bg-[#6d5a42] transition-colors uppercase font-semibold"
            >
              PRENOTA
            </a>
          </div>

          <div className="max-w-3xl mx-auto space-y-6 text-muted-foreground leading-relaxed text-pretty">
            <p>
              Villa I Barronci offre un'ampia gamma di massaggi e trattamenti personalizzati per rigenerare corpo e
              mente. I nostri operatori esperti sapranno consigliarti il percorso benessere più adatto alle tue
              esigenze, utilizzando prodotti naturali e tecniche professionali.
            </p>
            <p>
              Massaggio rilassante, decontratturante, aromaterapia, trattamenti viso anti-età e molto altro: ogni
              trattamento è pensato per offrirti un'esperienza unica di relax totale immersi nella tranquillità della
              campagna toscana.
            </p>
            <p>
              I trattamenti sono disponibili su prenotazione e possono essere personalizzati in base alle tue preferenze
              e necessità specifiche.
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
