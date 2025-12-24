import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Strada del Chianti - Territorio del Gallo Nero | Villa I Barronci",
  description:
    "Scopri la Strada del Chianti: Greve, Castellina, Gaiole, Panzano, Radda. Vigneti, borghi medievali e degustazioni a km 0 da Villa I Barronci.",
}

export default function StradaDelChiantiPage() {
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
          <h1 className="font-serif text-5xl md:text-7xl mb-6">STRADA DEL CHIANTI</h1>
          <p className="text-xl md:text-2xl max-w-3xl">
            Il territorio del Gallo Nero: presente da sempre, con tesori che crescono ogni giorno
          </p>
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

            <p className="text-lg text-foreground mb-4">STRADA DEL CHIANTI – a 0 km da Villa I Barronci</p>

            <p className="text-muted-foreground leading-relaxed mb-12">
              I percorsi enogastronomici della campagna toscana del Chianti si inseriscono in quello che è uno dei
              paesaggi più belli e conosciuti del mondo, con chilometri che offrono ai visitatori la testimonianza della
              storia etrusca e romana e dell'avvicendarsi della continua guerra tra gli eserciti contrapposti di Siena e
              Firenze che nel Medioevo si sono affrontati per la sua conquista.
            </p>

            <div className="space-y-10">
              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">GREVE IN CHIANTI</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Suggeriamo di iniziare il tour alla scoperta del Chianti da Greve, comune che dista solamente 20 km da
                  Villa I Barronci Resort & Spa. Famosa per la sua particolare piazza, che nel Medioevo era mercato dei
                  borghi, castelli e fattorie delle zone circostanti, offre varie possibilità di degustare molti
                  prodotti tipici del Chianti. Qui si trova inoltre il Museo del Vino.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">CASTELLINA IN CHIANTI</h3>
                <p className="text-muted-foreground leading-relaxed">
                  La tappa successiva sulla Strada del Chianti è Castellina, le cui origini antichissime sono
                  testimoniate dalle tombe etrusche di Montecalvario. Il Museo Archeologico del Chianti Senese
                  ripercorre la storia della zona e conserva reperti etruschi rinvenuti durante gli scavi iniziati nel
                  1989.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">GAIOLE IN CHIANTI</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Se sei un amante di rocche e castelli, Gaiole è il borgo che fa per te! A metà tra la zona del Chianti
                  e Valdarno, sul suo territorio puoi visitare il Castello di Vetrine, il Castello di Meleto e la Pieve
                  di Spaltenna, oggi anch'essi luoghi votati alla degustazione di vino, olii e prodotti tipici.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">PANZANO IN CHIANTI</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Proseguendo in direzione Siena si arriva a Panzano, dove è possibile visitare il Castello che sin dal
                  XII secolo è stato fondamentale per la difesa dei territori di Firenze. Passeggiando per il borgo
                  antico è possibile fermarsi a sorseggiare un bicchiere di vino nelle numerose enoteche e gustarsi una
                  tipica bistecca alla fiorentina alla famosissima Antica Macelleria Cecchini.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-3xl text-foreground mb-4">RADDA IN CHIANTI</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Questo borgo è forse quello che più di tutti ha conservato il suo aspetto originale medievale. Ancora
                  protetto dalle mura, il centro città si sviluppa in viuzze concentriche dove domina il Palazzo del
                  Podestà con i suoi 51 stemmi sulla facciata, che ricordano i podestà che si sono succeduti negli anni.
                  A 10 minuti di macchina è possibile visitare anche il Castello di Volpaia, borgo turistico regno della
                  degustazione del vino.
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
