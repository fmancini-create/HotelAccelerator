import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronDown, MessageCircleQuestion } from "lucide-react"

/**
 * FAQ - audit punto 9 (priorita' BASSA, ma obiezioni reali dell'utente).
 *
 * Usa il tag nativo <details>/<summary> per evitare di introdurre un client
 * component solo per l'accordion (no JS, SEO-friendly, accessibile).
 *
 * Le 6 domande coprono le obiezioni piu' comuni di un direttore hotel:
 *  - Sicurezza dati
 *  - PMS / no PMS
 *  - Tempi di risultato
 *  - Cancellazione piano a pagamento
 *  - Differenza tra dashboard gratuita e Hotel Accelerator
 *  - Adatto a piccole strutture
 *
 * SEO 13/05/2026 (punto 10 audit GSC): risposte arricchite con link
 * contestuali verso articoli blog correlati. Obiettivi:
 *  - Aumentare gli internal link contestuali (non solo footer/menu) verso
 *    le 15 pagine blog ancora "rilevate ma non indicizzate"
 *  - Rendere le risposte FAQ piu' utili (approfondimenti immediati)
 *  - Dare a Google segnali di topical authority piu' forti su RMS/pricing
 *
 * Per gestire il rich text nelle risposte ho cambiato il tipo `a` da
 * `string` a `ReactNode`, cosi' possiamo mescolare testo e <Link> senza
 * dipendere da dangerouslySetInnerHTML o da un parser markdown a runtime.
 */
export function LandingFAQ() {
  const faqs: Array<{ q: string; a: ReactNode }> = [
    {
      q: "I miei dati sono al sicuro?",
      a: (
        <>
          Si&apos;. I dati di prenotazione sono ospitati su Supabase
          (infrastruttura europea) con cifratura at-rest e in-transit. Non
          condividiamo ne&apos; rivendiamo i tuoi dati a terze parti e siamo
          conformi al GDPR. Puoi esportare o cancellare tutto in qualsiasi
          momento. Trovi il dettaglio operativo nella nostra{" "}
          <Link href="/privacy" className="text-emerald-700 underline-offset-2 hover:underline">
            informativa privacy
          </Link>
          .
        </>
      ),
    },
    {
      q: "Se non ho un PMS, posso comunque usare SANTADDEO?",
      a: (
        <>
          Si&apos;. Anche senza PMS puoi caricare i dati manualmente (CSV o
          foglio Google) e accedere alla dashboard KPI gratuita con semafori
          benchmark. Quando deciderai di integrare un PMS (Scidoo, Bedzzle,
          5stelle, Cloudbeds e altri), il setup richiede pochi minuti. Se
          stai ancora valutando se ti serve un PMS, un Channel Manager o un
          RMS, leggi{" "}
          <Link
            href="/blog/channel-manager-vs-pms-vs-rms"
            className="text-emerald-700 underline-offset-2 hover:underline"
          >
            Channel Manager, PMS e RMS: differenze
          </Link>
          .
        </>
      ),
    },
    {
      q: "In quanto tempo si vedono i primi risultati?",
      a: (
        <>
          La dashboard KPI e&apos; attiva da subito, gia&apos; nella prima
          settimana avrai una fotografia chiara dei tuoi numeri. Per i
          miglioramenti su RevPAR e ADR le strutture clienti vedono in media
          risultati significativi tra le 4 e le 8 settimane, soprattutto se
          attivano il pricing dinamico. Per andare piu&apos; a fondo:{" "}
          <Link
            href="/blog/come-aumentare-adr-hotel"
            className="text-emerald-700 underline-offset-2 hover:underline"
          >
            come aumentare l&apos;ADR
          </Link>{" "}
          e{" "}
          <Link
            href="/blog/pricing-dinamico-hotel"
            className="text-emerald-700 underline-offset-2 hover:underline"
          >
            come funziona il pricing dinamico per hotel
          </Link>
          .
        </>
      ),
    },
    {
      q: "Posso disdire l'Hotel Accelerator quando voglio?",
      a: (
        <>
          Si&apos;. Non ci sono vincoli di durata: l&apos;Hotel Accelerator e&apos;
          mensile e disdettabile in qualsiasi momento senza penali. La
          dashboard KPI gratuita resta sempre attiva.
        </>
      ),
    },
    {
      q: "Qual è la differenza tra la dashboard gratuita e l'Hotel Accelerator?",
      a: (
        <>
          La dashboard gratuita ti mostra cosa succede (KPI, benchmark,
          confronti storici). L&apos;Hotel Accelerator agisce: pricing
          dinamico automatico, push delle tariffe al PMS, alert intelligenti
          su mismatch OTA. La prima e&apos; monitoraggio, il secondo e&apos;
          esecuzione. Per il quadro completo di cosa fa un RMS leggi{" "}
          <Link
            href="/blog/cose-un-rms-hotel"
            className="text-emerald-700 underline-offset-2 hover:underline"
          >
            cos&apos;e&apos; un RMS hotel
          </Link>
          .
        </>
      ),
    },
    {
      q: "Funziona anche per strutture piccole, come B&B o agriturismi con 5-10 camere?",
      a: (
        <>
          Si&apos;, e&apos; proprio una delle nostre specializzazioni. Su
          70+ strutture attive, molte sono B&amp;B, agriturismi e
          affittacamere tra 5 e 20 unita&apos;. Il tariffario parte da
          &euro;49/mese proprio per essere accessibile alle strutture
          piccole, dove un RMS estero sarebbe sproporzionato. Approfondisci
          in{" "}
          <Link
            href="/blog/rms-per-piccoli-hotel"
            className="text-emerald-700 underline-offset-2 hover:underline"
          >
            RMS per piccoli hotel
          </Link>
          .
        </>
      ),
    },
  ]

  return (
    <section className="border-t bg-gray-50 py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <MessageCircleQuestion className="h-3.5 w-3.5" />
              Risposte rapide
            </div>
            <h2 className="mb-4 text-4xl font-bold text-gray-900">Domande frequenti</h2>
            <p className="text-lg text-gray-600">
              Le domande che ci fanno più spesso direttori, proprietari e revenue manager prima di iniziare.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-xl border border-gray-200 bg-white p-5 transition-all open:shadow-md hover:border-emerald-200"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-semibold text-gray-900 marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>{faq.q}</span>
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{faq.a}</p>
              </details>
            ))}
          </div>

          {/* Contact fallback */}
          <div className="mt-10 rounded-xl border border-gray-200 bg-white p-6 text-center">
            <p className="mb-3 text-sm text-gray-600">Non hai trovato la risposta che cerchi?</p>
            <a
              href="mailto:support@santaddeo.com"
              className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
            >
              Scrivici a support@santaddeo.com
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
