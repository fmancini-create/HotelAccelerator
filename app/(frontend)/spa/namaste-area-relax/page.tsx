import type { Metadata } from "next"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { ChevronDown } from "lucide-react"

export const metadata: Metadata = {
  title: "Namaste Area Relax - Villa I Barronci Resort & Spa",
  description:
    "Un'oasi di pace e benessere nel cuore del Chianti. La Namaste Area Relax offre sauna, bagno turco e zona relax per rigenerare corpo e mente.",
}

export default function NamasteAreaRelaxPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <section className="relative h-screen flex items-center justify-center text-center text-white">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://www.ibarronci.com/wp-content/uploads/2023/08/namaste-area-relax.jpg')",
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
        </div>

        <div className="relative z-10 max-w-4xl px-4">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif mb-6">Namaste Area Relax</h1>
          <p className="text-xl md:text-2xl font-light">Un'oasi di pace e benessere nel cuore del Chianti</p>
        </div>
      </section>

      <section className="bg-[#f5f1ed] py-20">
        <div className="container mx-auto px-6">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-[#8b7355]" />
          </div>

          <div className="max-w-4xl mx-auto text-center mb-12">
            <div className="w-20 h-px bg-[#8b7355] mx-auto mb-8" />
            <h2 className="text-4xl md:text-5xl font-serif mb-8 text-balance">Namaste Area Relax</h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Rigenerati nel silenzio della natura toscana
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
              La Namaste Area Relax di Villa I Barronci è un'oasi dedicata al benessere e alla rigenerazione. Immersa
              nel silenzio della campagna toscana, offre un ambiente perfetto per ritrovare l'equilibrio tra corpo e
              mente.
            </p>
            <p>
              L'area comprende sauna finlandese, bagno turco e una zona relax con tisaneria, dove potrai concederti
              momenti di puro relax dopo una giornata alla scoperta del Chianti. Un percorso benessere completo per
              rilassare muscoli e mente.
            </p>
            <p>
              Aperta su prenotazione, la Namaste Area Relax può essere riservata in esclusiva per un'esperienza ancora
              più intima e personalizzata.
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
