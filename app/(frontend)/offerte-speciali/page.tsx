import type { Metadata } from "next"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { ChevronDown } from "lucide-react"

export const metadata: Metadata = {
  title: "Offerte Speciali - Villa I Barronci Resort & Spa",
  description:
    "Scopri le offerte speciali e i pacchetti vantaggiosi per il tuo soggiorno a Villa I Barronci. Promozioni esclusive per vivere il Chianti al miglior prezzo.",
}

export default function OfferteSpecialiPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <section className="relative h-screen flex items-center justify-center text-center text-white">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://www.ibarronci.com/wp-content/uploads/2023/07/villa-barronci-esterno.jpg')",
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
        </div>

        <div className="relative z-10 max-w-4xl px-4">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif mb-6">Offerte Speciali</h1>
          <p className="text-xl md:text-2xl font-light">Promozioni esclusive per il tuo soggiorno nel Chianti</p>
        </div>
      </section>

      <section className="bg-[#f5f1ed] py-20">
        <div className="container mx-auto px-6">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-[#8b7355]" />
          </div>

          <div className="max-w-4xl mx-auto text-center mb-12">
            <div className="w-20 h-px bg-[#8b7355] mx-auto mb-8" />
            <h2 className="text-4xl md:text-5xl font-serif mb-8 text-balance">Le Nostre Offerte</h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Approfitta delle nostre promozioni per vivere un'esperienza indimenticabile nel cuore del Chianti
            </p>

            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#8b7355] text-white px-12 py-4 hover:bg-[#6d5a42] transition-colors uppercase font-semibold"
            >
              SCOPRI LE OFFERTE
            </a>
          </div>

          <div className="max-w-3xl mx-auto space-y-6 text-muted-foreground leading-relaxed text-pretty">
            <p>
              Villa I Barronci offre periodicamente pacchetti speciali e promozioni esclusive per rendere il tuo
              soggiorno nel Chianti ancora più vantaggioso. Dalle offerte last minute ai pacchetti benessere, dalle
              proposte romantiche alle esperienze enogastronomiche.
            </p>
            <p>
              Contattaci direttamente o prenota online per scoprire le offerte attualmente disponibili e trovare la
              soluzione perfetta per le tue esigenze. Il nostro team sarà lieto di consigliarti il pacchetto più adatto
              per vivere al meglio la magia della Toscana.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
