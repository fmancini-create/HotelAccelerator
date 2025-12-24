import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Servizi - Villa I Barronci Resort & Spa",
  description:
    "Ogni comfort per rendere il tuo soggiorno indimenticabile: reception 24h, wi-fi gratuito, parcheggio privato, transfer NCC, noleggio bici e molto altro.",
}

export default function ServiziPage() {
  return (
    <>
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2023/08/Villa-I-Barronci-Panoramica.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>

        <div className="relative h-full flex flex-col items-center justify-center text-white px-4">
          <h1 className="font-serif text-4xl md:text-6xl text-center mb-4 text-balance">
            Ogni comfort per rendere il tuo soggiorno indimenticabile
          </h1>
          <p className="text-lg md:text-xl text-center max-w-2xl text-balance">Villa I Barronci Servizi</p>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="w-6 h-10 border-2 border-white rounded-full flex items-start justify-center p-2">
            <div className="w-1 h-3 bg-white rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="bg-secondary py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Villa I Barronci Resort & Spa</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Se chiedi il massimo dal tuo resort in Toscana, sei nel posto giusto!
            </p>
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713"
              className="inline-block px-8 py-3 bg-[#8b7355] text-white hover:bg-[#7a6347] transition-colors"
            >
              PRENOTA
            </a>
          </div>

          <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
            <p>
              A <strong>Villa I Barronci Resort & Spa</strong> ci prendiamo cura dei nostri ospiti durante tutto il loro
              soggiorno, offrendo una vasta gamma di servizi pensati ad hoc per far vivere al meglio la vacanza nei
              nostri meravigliosi territori.
            </p>

            <p>
              Potrai esplorarli nel modo che preferisci, posteggiando la tua auto nel nostro parcheggio privato
              videosorvegliato completamente gratuito ed usufruendo del servizio di <strong>Noleggio bici</strong> (su
              richiesta, a pagamento, servizio esterno all'hotel).
            </p>

            <p>
              Se ami il benessere nel nostro resort troverai anche un'<strong>Area Relax</strong>, dove potrai
              rilassarti nella nostra sauna, e concederti momenti di coccole con massaggi e trattamenti.
            </p>

            <p>
              Vuoi effettuare una <strong>degustazione in una cantina</strong>? Chiedi al ricevimento per conoscere le
              cantine più belle e particolari della zona, alcune raggiungibili anche a piedi.
            </p>

            <p>
              Gli amanti dello shopping saranno felici di sapere che <strong>Villa I Barronci Resort & Spa</strong> è
              situata in una posizione strategica anche sotto questo punto di vista: nella nostra zona troverai l'
              <strong>Outlet di Barberino, il Luxury Outlet The Mall e l'Outlet di Prada a Valdarno</strong>, tutti
              raggiungibili facilmente.
            </p>

            <div className="bg-background p-8 rounded-lg mt-12">
              <h3 className="font-serif text-2xl text-foreground mb-6">I nostri servizi</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li>✓ Reception 24 ore su 24</li>
                <li>✓ Check-in dalle 15 alle 21</li>
                <li>✓ Check-out entro le 10:30</li>
                <li>✓ Check-in e check out express e privati</li>
                <li>✓ Dalle 22 portiere di notte</li>
                <li>✓ Wi-Fi gratuito in tutta la struttura</li>
                <li>✓ Servizio Baby sitter (su richiesta)</li>
                <li>✓ Servizio in camera</li>
                <li>✓ Deposito bagagli e servizio concierge</li>
                <li>
                  ✓ Servizio lavanderia con lavaggio a secco e stireria (su richiesta, a pagamento, servizio esterno)
                </li>
                <li>
                  ✓ <strong>Transfer con servizio NCC</strong> (su richiesta, a pagamento, servizio esterno all'hotel,
                  da prenotare con almeno 2 gg di anticipo)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </>
  )
}
