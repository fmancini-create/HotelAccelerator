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
              <h2 className="text-xl font-semibold text-white mb-4">8. Piani, prova gratuita, SLA e pagamenti</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                L&apos;accesso a HotelAccelerator e ai suoi moduli può prevedere piani gratuiti o a pagamento. I
                contenuti, i limiti e i prezzi aggiornati di ciascun piano, così come gli eventuali componenti
                aggiuntivi (add-on), sono indicati nella relativa offerta o nella pagina prezzi. Per i piani a
                pagamento:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>la fatturazione avviene con cadenza mensile o annuale, secondo il piano scelto;</li>
                <li>i pagamenti sono elaborati tramite fornitori di pagamento sicuri e, salvo diversa indicazione, sono
                ricorrenti fino a disdetta (art. 8-bis);</li>
                <li>la cancellazione interrompe gli addebiti futuri ma non dà diritto al rimborso di quelli già
                maturati, salvo quanto diversamente previsto dalla legge;</li>
                <li>eventuali servizi o integrazioni su misura sono fatturati separatamente.</li>
              </ul>
              <h3 className="text-lg font-semibold text-white mt-6 mb-3">8.1 Prova gratuita</h3>
              <p className="text-gray-300 leading-relaxed">
                Ove offerta, la prova gratuita (ad esempio di <strong>14 giorni</strong> su determinati moduli) consente
                l&apos;utilizzo delle funzionalità indicate nella relativa offerta e, salvo diversa indicazione, non
                richiede una carta di credito. Al termine del periodo la prova non si converte automaticamente in un
                piano a pagamento: per proseguire è necessaria l&apos;attivazione volontaria di un piano. La prova è
                riservata ai nuovi clienti e non è ripetibile per la stessa struttura, salvo diverso accordo.
              </p>
              <h3 className="text-lg font-semibold text-white mt-6 mb-3">8.2 Livelli di servizio (SLA)</h3>
              <p className="text-gray-300 leading-relaxed">
                Le previsioni relative a priorità di gestione, supporto prioritario o &laquo;SLA garantito&raquo;
                indicate per alcuni piani o funzionalità si applicano come SLA vincolanti, con eventuali tempi di
                intervento, indennizzi o penali, <strong>esclusivamente ai piani e ai clienti per i quali siano
                espressamente previsti e quantificati</strong> nel piano sottoscritto o in uno specifico accordo. Per
                gli altri piani il supporto è fornito secondo le migliori possibilità, senza garanzia di tempi
                predeterminati. Restano ferme le previsioni dell&apos;art. 9.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">8-bis. Disdetta e rinnovo degli abbonamenti</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                Gli abbonamenti si rinnovano automaticamente alla scadenza del periodo scelto. Per disdire &egrave;
                sufficiente disattivare autonomamente il rinnovo automatico direttamente dalla piattaforma, dall&apos;area
                Fatturazione &gt; Gestisci abbonamento, senza penali e senza necessit&agrave; di alcuna comunicazione
                scritta, entro i seguenti termini:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li><strong>Abbonamenti mensili:</strong> almeno 7 giorni prima della scadenza.</li>
                <li><strong>Abbonamenti annuali:</strong> almeno 30 giorni prima della normale scadenza.</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-4">
                In assenza di disdetta entro tali termini, il servizio si rinnova automaticamente per un ulteriore
                periodo pari a quello scelto. In ogni caso il servizio resta attivo fino al termine del periodo già
                pagato.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">
                9. Continuità del servizio, aggiornamenti ed esclusione di responsabilità
              </h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                Il servizio è fornito da 4 Bid S.r.l. &laquo;secondo disponibilità&raquo;. 4 Bid S.r.l. si impegna a garantire
                la massima continuità e affidabilità, ma non garantisce che il funzionamento sia ininterrotto o del
                tutto esente da errori.
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                Il Cliente prende atto e accetta che il servizio possa essere temporaneamente sospeso, rallentato o
                interrotto per attività di manutenzione ordinaria o straordinaria, aggiornamenti, migrazioni, interventi
                di sicurezza o miglioramenti tecnici. Ove possibile tali attività sono comunicate con ragionevole
                preavviso; quelle urgenti o legate alla sicurezza possono essere eseguite senza preavviso.
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                4 Bid S.r.l. non è responsabile per malfunzionamenti, indisponibilità, perdita di dati, cali di
                prestazioni o danni, diretti o indiretti, derivanti da:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>aggiornamenti, manutenzione o evoluzioni dei propri sistemi;</li>
                <li>
                  guasti, sospensioni, limitazioni o modifiche di servizi, API o infrastrutture di terze parti (a titolo
                  esemplificativo: hosting, connettività, PMS, channel manager, gateway di pagamento, provider di
                  messaggistica e fornitori cloud);
                </li>
                <li>
                  cause di forza maggiore o eventi comunque non imputabili a 4 Bid S.r.l., inclusi guasti di rete,
                  attacchi informatici, interruzioni di energia elettrica ed eventi naturali;
                </li>
                <li>uso improprio, errato o non conforme del servizio da parte del Cliente o di terzi.</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-4">
                Le interruzioni o i disservizi riconducibili alle attività e alle cause sopra indicate non danno diritto
                a rimborsi, indennizzi, riduzioni del canone o risoluzione anticipata del contratto. In ogni caso, ove
                una responsabilità di 4 Bid S.r.l. dovesse essere accertata, essa sarà limitata all&apos;importo
                effettivamente corrisposto dal Cliente per il servizio interessato nei 3 (tre) mesi precedenti
                l&apos;evento, restando esclusi danni indiretti, mancati guadagni e perdite di opportunità.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">10. Legge applicabile e foro competente</h2>
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
