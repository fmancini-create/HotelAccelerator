import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy - Informativa GDPR | SANTADDEO",
  description: "Informativa sulla privacy di SANTADDEO - 4 BID S.r.l. Come trattiamo i tuoi dati personali in conformita al GDPR e normative europee sulla protezione dei dati.",
  alternates: { canonical: "https://www.santaddeo.com/privacy" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Privacy Policy | SANTADDEO - 4 BID S.r.l.",
    description: "Informativa sulla privacy e trattamento dati personali in conformita al GDPR.",
    url: "https://www.santaddeo.com/privacy",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | SANTADDEO - 4 BID S.r.l.",
    description: "Informativa sulla privacy e trattamento dati personali in conformita al GDPR.",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  }
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 py-16">
        <div className="container mx-auto px-6 max-w-4xl">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">Informativa sulla Privacy</h1>

          <div className="prose prose-gray max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Titolare del Trattamento</h2>
              <p className="text-muted-foreground">
                <strong>4 BID S.r.l.</strong><br />
                Via Sorripa, 10 – 50026 – San Casciano in Val di Pesa (FI)<br />
                P.IVA: 06241710489<br />
                Email: info@4bid.it
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Tipologie di Dati Raccolti</h2>
              <p className="text-muted-foreground mb-4">
                Fra i Dati Personali raccolti da questa Applicazione, in modo autonomo o tramite terze parti, 
                ci sono: Cookie, Dati di utilizzo, email, nome, cognome, numero di telefono, ragione sociale, 
                indirizzo, provincia, CAP, Paese e varie tipologie di Dati.
              </p>
              <p className="text-muted-foreground">
                I Dati Personali possono essere liberamente forniti dall'Utente o, nel caso di Dati di Utilizzo, 
                raccolti automaticamente durante l'uso di questa Applicazione.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Finalità del Trattamento</h2>
              <p className="text-muted-foreground mb-4">
                I Dati dell'Utente sono raccolti per consentire al Titolare di fornire i propri Servizi, 
                così come per le seguenti finalità:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2">
                <li>Registrazione ed autenticazione</li>
                <li>Gestione dei pagamenti</li>
                <li>Contattare l'Utente</li>
                <li>Statistica</li>
                <li>Gestione delle richieste di supporto e contatto</li>
                <li>Hosting ed infrastruttura backend</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Modalità del Trattamento</h2>
              <p className="text-muted-foreground mb-4">
                Il Titolare adotta le opportune misure di sicurezza volte ad impedire l'accesso, la divulgazione, 
                la modifica o la distruzione non autorizzate dei Dati Personali.
              </p>
              <p className="text-muted-foreground">
                Il trattamento viene effettuato mediante strumenti informatici e/o telematici, con modalità 
                organizzative e con logiche strettamente correlate alle finalità indicate.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Base Giuridica del Trattamento</h2>
              <p className="text-muted-foreground">
                Il Titolare tratta Dati Personali relativi all'Utente in caso sussista una delle seguenti condizioni:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 mt-4">
                <li>L'Utente ha prestato il consenso per una o più finalità specifiche</li>
                <li>Il trattamento è necessario all'esecuzione di un contratto con l'Utente e/o all'esecuzione di misure precontrattuali</li>
                <li>Il trattamento è necessario per adempiere un obbligo legale al quale è soggetto il Titolare</li>
                <li>Il trattamento è necessario per il perseguimento del legittimo interesse del Titolare o di terzi</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Luogo</h2>
              <p className="text-muted-foreground">
                I Dati sono trattati presso le sedi operative del Titolare ed in ogni altro luogo in cui le parti 
                coinvolte nel trattamento siano localizzate. I Dati potrebbero essere trasferiti in Paesi terzi 
                (extra-UE). L'Utente può richiedere maggiori informazioni in merito al luogo di trattamento dei 
                Dati contattando il Titolare.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Periodo di Conservazione</h2>
              <p className="text-muted-foreground">
                I Dati sono trattati e conservati per il tempo richiesto dalle finalità per le quali sono stati raccolti.
                Pertanto: i Dati Personali raccolti per scopi collegati all'esecuzione di un contratto tra il Titolare 
                e l'Utente saranno trattenuti sino a quando sia completata l'esecuzione di tale contratto.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Diritti dell'Utente</h2>
              <p className="text-muted-foreground mb-4">
                Gli Utenti possono esercitare determinati diritti con riferimento ai Dati trattati dal Titolare.
                In particolare, l'Utente ha il diritto di:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2">
                <li>Revocare il consenso in ogni momento</li>
                <li>Opporsi al trattamento dei propri Dati</li>
                <li>Accedere ai propri Dati</li>
                <li>Verificare e chiedere la rettificazione</li>
                <li>Ottenere la limitazione del trattamento</li>
                <li>Ottenere la cancellazione o rimozione dei propri Dati Personali</li>
                <li>Ricevere i propri Dati o farli trasferire ad altro titolare</li>
                <li>Proporre reclamo all'autorità di controllo della protezione dei dati personali</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Cookie Policy</h2>
              <p className="text-muted-foreground">
                Questa Applicazione fa utilizzo di Cookie e altri Identificatori. Per saperne di più, 
                l'Utente può consultare la Cookie Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Modifiche alla presente informativa</h2>
              <p className="text-muted-foreground">
                Il Titolare del Trattamento si riserva il diritto di apportare modifiche alla presente privacy policy 
                in qualunque momento notificandolo agli Utenti su questa pagina e, se possibile, su questa Applicazione 
                nonché, qualora tecnicamente e legalmente fattibile, inviando una notifica agli Utenti attraverso uno 
                degli estremi di contatto di cui è in possesso.
              </p>
            </section>

            <section className="pt-8 border-t">
              <p className="text-sm text-muted-foreground">
                Ultimo aggiornamento: Febbraio 2026
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
