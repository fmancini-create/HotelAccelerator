import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Termini di Servizio - Condizioni d'Uso | SANTADDEO",
  description: "Termini e condizioni di utilizzo della piattaforma SANTADDEO di 4 BID S.r.l. Regolamento del servizio di Revenue Management System per strutture ricettive.",
  alternates: { canonical: "https://www.santaddeo.com/termini" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Termini di Servizio | SANTADDEO - 4 BID S.r.l.",
    description: "Termini e condizioni di utilizzo della piattaforma SANTADDEO per strutture ricettive.",
    url: "https://www.santaddeo.com/termini",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Termini di Servizio | SANTADDEO - 4 BID S.r.l.",
    description: "Termini e condizioni di utilizzo della piattaforma SANTADDEO per strutture ricettive.",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  }
}

export default function TerminiPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 bg-background">
        <div className="container max-w-4xl mx-auto px-4 py-16">
          <h1 className="text-3xl font-bold mb-8">Termini e Condizioni di Servizio</h1>
          
          <div className="prose prose-gray max-w-none space-y-8">
            <p className="text-muted-foreground">
              Ultimo aggiornamento: 5 Febbraio 2026
            </p>

            <section>
              <h2 className="text-xl font-semibold mb-4">1. Informazioni Generali</h2>
              <p className="text-muted-foreground leading-relaxed">
                I presenti Termini e Condizioni di Servizio regolano l&apos;utilizzo della piattaforma Santaddeo, 
                un servizio fornito da <strong>4 BID S.r.l.</strong>, con sede legale in Italia.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                Utilizzando la piattaforma Santaddeo, l&apos;utente accetta integralmente i presenti Termini. 
                Si prega di leggere attentamente questo documento prima di utilizzare i nostri servizi.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">2. Definizioni</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>&quot;Piattaforma&quot;</strong>: il software Santaddeo accessibile via web</li>
                <li><strong>&quot;Utente&quot;</strong>: qualsiasi persona fisica o giuridica che utilizza la Piattaforma</li>
                <li><strong>&quot;Struttura&quot;</strong>: hotel, agriturismo, B&amp;B, campeggio, glamping, villaggio turistico, resort o altra struttura ricettiva gestita tramite la Piattaforma</li>
                <li><strong>&quot;Account&quot;</strong>: l&apos;insieme delle credenziali di accesso dell&apos;Utente</li>
                <li><strong>&quot;Servizi&quot;</strong>: tutte le funzionalità offerte dalla Piattaforma</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">3. Descrizione del Servizio</h2>
              <p className="text-muted-foreground leading-relaxed">
                Santaddeo è una piattaforma di Revenue Management e Business Intelligence per strutture ricettive che offre:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
                <li>Dashboard analitiche per monitoraggio performance</li>
                <li>Integrazione con PMS e Channel Manager</li>
                <li>Reportistica avanzata e KPI</li>
                <li>Strumenti di analisi previsionale</li>
                <li>Gestione multi-struttura</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">4. Registrazione e Account</h2>
              <p className="text-muted-foreground leading-relaxed">
                Per utilizzare la Piattaforma è necessario creare un Account fornendo informazioni accurate e complete. 
                L&apos;Utente è responsabile della riservatezza delle proprie credenziali di accesso e di tutte le 
                attività svolte tramite il proprio Account.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                L&apos;Utente si impegna a:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
                <li>Fornire informazioni veritiere e aggiornate</li>
                <li>Mantenere riservate le credenziali di accesso</li>
                <li>Notificare immediatamente eventuali accessi non autorizzati</li>
                <li>Non condividere l&apos;Account con terze parti non autorizzate</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">5. Obblighi dell&apos;Utente</h2>
              <p className="text-muted-foreground leading-relaxed">
                L&apos;Utente si impegna a utilizzare la Piattaforma in conformità alle leggi vigenti e ai presenti Termini. 
                È vietato:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
                <li>Utilizzare la Piattaforma per scopi illeciti o non autorizzati</li>
                <li>Tentare di accedere a dati o aree non autorizzate</li>
                <li>Interferire con il funzionamento della Piattaforma</li>
                <li>Copiare, modificare o distribuire contenuti della Piattaforma senza autorizzazione</li>
                <li>Utilizzare sistemi automatizzati per accedere alla Piattaforma</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">6. Proprietà Intellettuale</h2>
              <p className="text-muted-foreground leading-relaxed">
                Tutti i diritti di proprietà intellettuale relativi alla Piattaforma, inclusi software, 
                design, loghi, testi e grafica, sono di proprietà esclusiva di 4 BID S.r.l. o dei suoi licenzianti.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                L&apos;Utente ottiene una licenza limitata, non esclusiva e non trasferibile per utilizzare 
                la Piattaforma secondo i presenti Termini.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">7. Protezione dei Dati</h2>
              <p className="text-muted-foreground leading-relaxed">
                Il trattamento dei dati personali è regolato dalla nostra{" "}
                <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>. 
                4 BID S.r.l. si impegna a proteggere i dati degli Utenti in conformità al GDPR e alle 
                normative vigenti in materia di protezione dei dati.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">8. Disponibilità del Servizio</h2>
              <p className="text-muted-foreground leading-relaxed">
                4 BID S.r.l. si impegna a garantire la massima disponibilità della Piattaforma, tuttavia 
                non garantisce un funzionamento ininterrotto. Potrebbero verificarsi interruzioni per:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
                <li>Manutenzione programmata (comunicata in anticipo)</li>
                <li>Aggiornamenti del sistema</li>
                <li>Cause di forza maggiore</li>
                <li>Problemi tecnici imprevisti</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">9. Limitazione di Responsabilità</h2>
              <p className="text-muted-foreground leading-relaxed">
                4 BID S.r.l. non sarà responsabile per danni indiretti, incidentali, speciali o consequenziali 
                derivanti dall&apos;utilizzo o dall&apos;impossibilità di utilizzare la Piattaforma.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                La responsabilità massima di 4 BID S.r.l. è limitata all&apos;importo pagato dall&apos;Utente 
                per i Servizi nei 12 mesi precedenti l&apos;evento che ha dato origine alla responsabilità.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">10. Modifiche ai Termini</h2>
              <p className="text-muted-foreground leading-relaxed">
                4 BID S.r.l. si riserva il diritto di modificare i presenti Termini in qualsiasi momento. 
                Le modifiche saranno comunicate agli Utenti tramite email o avviso sulla Piattaforma 
                con almeno 30 giorni di preavviso.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                L&apos;utilizzo continuato della Piattaforma dopo la modifica dei Termini costituisce 
                accettazione delle nuove condizioni.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">11. Recesso e Risoluzione</h2>
              <p className="text-muted-foreground leading-relaxed">
                L&apos;Utente può recedere dal servizio in qualsiasi momento eliminando il proprio Account. 
                4 BID S.r.l. può sospendere o terminare l&apos;Account in caso di violazione dei presenti Termini.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">12. Legge Applicabile e Foro Competente</h2>
              <p className="text-muted-foreground leading-relaxed">
                I presenti Termini sono regolati dalla legge italiana. Per qualsiasi controversia 
                derivante dall&apos;interpretazione o esecuzione dei presenti Termini sarà competente 
                in via esclusiva il Foro di Firenze.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">13. Contatti</h2>
              <p className="text-muted-foreground leading-relaxed">
                Per qualsiasi domanda relativa ai presenti Termini, contattare:
              </p>
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="font-semibold">4 BID S.r.l.</p>
                <p className="text-muted-foreground">Email: info@4bid.it</p>
                <p className="text-muted-foreground">PEC: info@pec.4bid.it</p>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
