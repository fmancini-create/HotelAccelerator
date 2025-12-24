import type { Metadata } from "next"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { ChevronDown } from "lucide-react"

export const metadata: Metadata = {
  title: "Richiesta Informazioni - Villa I Barronci Resort & Spa",
  description:
    "Hai bisogno di informazioni? Contattaci per qualsiasi domanda sul tuo soggiorno a Villa I Barronci. Il nostro team è a tua disposizione.",
}

export default function RichiestaInformazioniPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <section className="relative h-screen flex items-center justify-center text-center text-white">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://www.ibarronci.com/wp-content/uploads/2023/07/reception-villa-barronci.jpg')",
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
        </div>

        <div className="relative z-10 max-w-4xl px-4">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif mb-6">Contattaci</h1>
          <p className="text-xl md:text-2xl font-light">Siamo a tua disposizione per ogni informazione</p>
        </div>
      </section>

      <section className="bg-[#f5f1ed] py-20">
        <div className="container mx-auto px-6">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-[#8b7355]" />
          </div>

          <div className="max-w-4xl mx-auto text-center mb-12">
            <div className="w-20 h-px bg-[#8b7355] mx-auto mb-8" />
            <h2 className="text-4xl md:text-5xl font-serif mb-8 text-balance">Richiesta Informazioni</h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Il nostro team è pronto ad assisterti per qualsiasi esigenza
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-8">
            <div className="space-y-6 text-muted-foreground leading-relaxed text-pretty">
              <p>
                Hai domande sul tuo soggiorno a Villa I Barronci? Vuoi maggiori informazioni sulle nostre camere, i
                servizi o le esperienze che offriamo? Il nostro team è sempre disponibile per assisterti.
              </p>
              <p>Puoi contattarci telefonicamente, via email o compilando il form di contatto.</p>
            </div>

            <div className="bg-white p-8 rounded-lg shadow-sm space-y-4">
              <h3 className="text-2xl font-serif mb-6 text-center">I Nostri Contatti</h3>

              <div className="space-y-4 text-center">
                <div>
                  <p className="font-semibold text-[#8b7355]">Telefono</p>
                  <a href="tel:+390558290090" className="text-lg hover:text-[#8b7355] transition-colors">
                    +39 055 829 0090
                  </a>
                </div>

                <div>
                  <p className="font-semibold text-[#8b7355]">Email</p>
                  <a href="mailto:info@ibarronci.com" className="text-lg hover:text-[#8b7355] transition-colors">
                    info@ibarronci.com
                  </a>
                </div>

                <div>
                  <p className="font-semibold text-[#8b7355]">Indirizzo</p>
                  <p className="text-lg">Via I Barronci, 20</p>
                  <p className="text-lg">50026 San Casciano in Val di Pesa (FI)</p>
                </div>
              </div>

              <div className="pt-6 text-center">
                <a
                  href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-[#8b7355] text-white px-12 py-4 hover:bg-[#6d5a42] transition-colors uppercase font-semibold"
                >
                  PRENOTA ORA
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
