import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Visitare Firenze - 15 km da Villa I Barronci | Resort & Spa nel Chianti",
  description:
    "Firenze a 15 km da Villa I Barronci. Visita Galleria degli Uffizi, Galleria dell'Accademia, Palazzo Pitti e tutti i tesori del Rinascimento.",
}

export default function FirenzePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2023/08/Duomo-Firenze.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <p className="text-sm md:text-base uppercase tracking-wider mb-4">VISITA LA CULLA DEL RINASCIMENTO</p>
          <h1 className="font-serif text-5xl md:text-7xl mb-6">FIRENZE</h1>
          <p className="text-xl md:text-2xl max-w-3xl">a 15 km da Villa I Barronci</p>
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
              Se stai progettando una visita a Firenze, il soggiorno a Villa I Barronci Resort & Spa aggiungerà quel
              tocco di classe al tuo programma rendendolo senza alcun dubbio unico e speciale. La nostra dimora d'epoca
              dista infatti solamente 15 km da Firenze, facilmente raggiungibile in auto tramite il raccordo
              autostradale Firenze-Siena.
            </p>

            <div className="space-y-10">
              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">GALLERIA DEGLI UFFIZI</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Il museo, famoso in tutto il mondo, vanta una vastissima quanto eccezionale collezione di dipinti e
                  statue antiche di artisti del calibro di Giotto, Piero della Francesca, Beato Angelico, Botticelli,
                  Mantegna, Leonardo, Raffaello, Caravaggio e Michelangelo, oltre che collezioni minori di importanti
                  artisti tedeschi e fiamminghi. La Galleria degli Uffizi si trova nell'edificio progettato da Giorgio
                  Vasari per ospitare gli uffici amministrativi dell'antico stato toscano.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">GALLERIA DELL'ACCADEMIA</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Nota per le numerose sculture di Michelangelo ospitate, tra cui il David, in questa galleria troverai
                  anche dipinti a tema religioso tra cui spicca la collezione, unica al mondo, di tavole dipinte con
                  fondo oro. Recentemente la galleria è stata ampliata, ed oggi ospita anche il Dipartimento degli
                  Strumenti Musicali, con importanti e antichi strumenti del Conservatorio Cherubini di Firenze.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">PALAZZO PITTI</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Nato come residenza dei granduchi di Toscana, ed in seguito dei re d'Italia, oggi ospita anch'esso
                  diverse collezioni di vario genere tra cui dipinti, sculture, porcellane e la galleria del costume. A
                  fianco ad esso si trova il bellissimo Giardino di Boboli, uno tra i primi giardini italiani.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">UNA CITTÀ ANCHE PER I BAMBINI</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Firenze è anche una città a misura di bambino con i suoi tanti musei interattivi, il Giardino di
                  Boboli dove correre liberamente e il meraviglioso Museo Leonardo da Vinci dove scoprire le invenzioni
                  del genio rinascimentale.
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
