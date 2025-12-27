import Link from "next/link"
import { Building2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Termini e Condizioni | HotelAccelerator",
  description: "Termini e Condizioni di Servizio di HotelAccelerator - Regole per l'utilizzo della piattaforma.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-7 w-7 text-white" />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white gap-2">
              <ArrowLeft className="h-4 w-4" />
              Torna alla Home
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Termini e Condizioni di Servizio</h1>
          <p className="text-gray-400 mb-12">Ultimo aggiornamento: 27 dicembre 2025</p>

          <div className="prose prose-invert prose-gray max-w-none space-y-8">
            <p className="text-gray-300 leading-relaxed">
              L&apos;accesso e l&apos;utilizzo della piattaforma HotelAccelerator, gestita da 4 Bid S.r.l., comportano
              l&apos;accettazione integrale dei presenti Termini e Condizioni.
            </p>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">1. Oggetto del servizio</h2>
              <p className="text-gray-300 leading-relaxed">
                HotelAccelerator è una piattaforma digitale che fornisce strumenti software per la gestione, analisi,
                automazione e ottimizzazione delle attività degli operatori del settore turistico-ricettivo.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">2. Registrazione e account</h2>
              <p className="text-gray-300 leading-relaxed">
                Per utilizzare i servizi è necessaria la registrazione. L&apos;utente si impegna a fornire informazioni
                veritiere, complete e aggiornate ed è responsabile della custodia delle proprie credenziali di accesso.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">3. Uso corretto della piattaforma</h2>
              <p className="text-gray-300 leading-relaxed mb-4">È vietato utilizzare la piattaforma per:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Scopi illeciti o non autorizzati</li>
                <li>Tentativi di accesso non autorizzati a sistemi o dati</li>
                <li>Inserimento di contenuti dannosi, illegali o lesivi di diritti di terzi</li>
                <li>Compromettere la sicurezza o il corretto funzionamento del servizio</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">4. Proprietà dei contenuti</h2>
              <p className="text-gray-300 leading-relaxed">
                L&apos;utente rimane titolare dei contenuti e dei dati caricati sulla piattaforma. Con l&apos;utilizzo
                del servizio, l&apos;utente concede a 4 Bid S.r.l. una licenza limitata, non esclusiva e strettamente
                funzionale all&apos;erogazione del servizio.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">5. Limitazione di responsabilità</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                La piattaforma è fornita &quot;così com&apos;è&quot;. 4 Bid S.r.l. non garantisce che il servizio sia
                privo di errori o sempre disponibile e non è responsabile per:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Perdite di dati imputabili a uso improprio da parte dell&apos;utente</li>
                <li>Interruzioni temporanee del servizio</li>
                <li>
                  Decisioni aziendali o operative prese dall&apos;utente sulla base delle informazioni fornite dalla
                  piattaforma
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">6. Sospensione o cessazione del servizio</h2>
              <p className="text-gray-300 leading-relaxed">
                4 Bid S.r.l. si riserva il diritto di sospendere o cessare l&apos;account dell&apos;utente in caso di
                violazione dei presenti Termini o di utilizzo improprio della piattaforma.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">7. Modifiche ai termini</h2>
              <p className="text-gray-300 leading-relaxed">
                I presenti Termini possono essere modificati in qualsiasi momento. Le modifiche saranno comunicate
                tramite la piattaforma e avranno efficacia dalla data di pubblicazione.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">8. Legge applicabile e foro competente</h2>
              <p className="text-gray-300 leading-relaxed">
                I presenti Termini sono regolati dalla legge italiana. Per qualsiasi controversia è competente in via
                esclusiva il Foro di Firenze.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/10">
        <div className="container mx-auto text-center text-sm text-gray-500">
          © 2025 HotelAccelerator. Tutti i diritti riservati.
        </div>
      </footer>
    </div>
  )
}
