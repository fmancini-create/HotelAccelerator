import Link from "next/link"
import { Building2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Privacy Policy | HotelAccelerator",
  description:
    "Informativa sulla Privacy di HotelAccelerator - Come raccogliamo, utilizziamo e proteggiamo i tuoi dati personali.",
}

export default function PrivacyPage() {
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
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Informativa sulla Privacy</h1>
          <p className="text-gray-400 mb-12">Ultimo aggiornamento: 27 dicembre 2025</p>

          <div className="prose prose-invert prose-gray max-w-none space-y-8">
            <p className="text-gray-300 leading-relaxed">
              La presente Informativa sulla Privacy descrive le modalità con cui HotelAccelerator, piattaforma gestita
              da 4 Bid S.r.l. (di seguito &quot;Piattaforma&quot;, &quot;noi&quot; o &quot;nostro&quot;), raccoglie,
              utilizza e protegge i dati personali degli utenti che accedono e utilizzano il sito web e i servizi
              offerti.
            </p>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">1. Titolare del trattamento</h2>
              <p className="text-gray-300 leading-relaxed mb-4">Il Titolare del trattamento dei dati è:</p>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-gray-300">
                <p className="font-semibold text-white">4 Bid S.r.l.</p>
                <p>Sede legale: Via Sorripa, 10 – 50026 San Casciano in Val di Pesa (FI) – Italia</p>
                <p>Partita IVA: 06241710489</p>
                <p>Email di contatto: privacy@hotelaccelerator.com</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">2. Tipologie di dati raccolti</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                La Piattaforma può raccogliere le seguenti categorie di dati personali:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Dati identificativi (nome, cognome)</li>
                <li>Dati di contatto (indirizzo email)</li>
                <li>Dati di accesso e utilizzo della piattaforma</li>
                <li>Dati tecnici (indirizzo IP, browser, sistema operativo)</li>
                <li>Contenuti e dati inseriti volontariamente dall&apos;utente all&apos;interno della piattaforma</li>
              </ul>
              <p className="text-gray-400 mt-4 text-sm">
                La Piattaforma non raccoglie dati sensibili (es. salute, religione, orientamento politico).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">3. Finalità del trattamento</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                I dati personali sono trattati per le seguenti finalità:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Fornire e gestire i servizi di HotelAccelerator</li>
                <li>Consentire la registrazione, autenticazione e gestione degli account</li>
                <li>Migliorare l&apos;esperienza utente e le funzionalità della piattaforma</li>
                <li>Adempiere a obblighi legali, fiscali e regolamentari</li>
                <li>Inviare comunicazioni di servizio e operative</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">4. Base giuridica del trattamento</h2>
              <p className="text-gray-300 leading-relaxed mb-4">Il trattamento dei dati si basa su:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Esecuzione di un contratto di cui l&apos;utente è parte</li>
                <li>Consenso espresso dall&apos;utente, ove richiesto</li>
                <li>Adempimento di obblighi legali</li>
                <li>Legittimo interesse del Titolare</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">5. Modalità di trattamento e sicurezza</h2>
              <p className="text-gray-300 leading-relaxed">
                Il trattamento avviene mediante strumenti informatici e telematici, con l&apos;adozione di misure di
                sicurezza tecniche e organizzative adeguate a prevenire accessi non autorizzati, perdita o uso illecito
                dei dati.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">6. Conservazione dei dati</h2>
              <p className="text-gray-300 leading-relaxed">
                I dati personali sono conservati per il tempo strettamente necessario al raggiungimento delle finalità
                per cui sono stati raccolti, salvo diversi obblighi di legge.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">7. Comunicazione e condivisione dei dati</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                I dati personali non vengono venduti. Possono essere comunicati esclusivamente a:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Fornitori di servizi tecnici (hosting, infrastrutture cloud, servizi email, pagamenti)</li>
                <li>Consulenti professionali, se necessario</li>
                <li>Autorità competenti, nei casi previsti dalla legge</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">8. Diritti dell&apos;utente</h2>
              <p className="text-gray-300 leading-relaxed mb-4">Ai sensi del GDPR, l&apos;utente ha diritto di:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Accedere ai propri dati personali</li>
                <li>Chiederne la rettifica o la cancellazione</li>
                <li>Limitare o opporsi al trattamento</li>
                <li>Richiedere la portabilità dei dati</li>
              </ul>
              <p className="text-gray-400 mt-4 text-sm">
                Le richieste possono essere inviate a: privacy@hotelaccelerator.com
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">9. Cookie</h2>
              <p className="text-gray-300 leading-relaxed">
                La Piattaforma utilizza cookie tecnici e, previo consenso, cookie di analisi. Per maggiori informazioni
                è possibile consultare la Cookie Policy dedicata.
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
