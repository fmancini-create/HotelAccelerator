/**
 * Pagina FAQ SEO Santaddeo (additiva, non linkata nel menu).
 *
 * Obiettivi:
 * - Indicizzazione per query informazionali long-tail ("cos'è il pricing
 *   dinamico hotel", "differenza ADR RevPAR", "RMS conviene agriturismi",
 *   ecc.)
 * - Eligibilita' rich result FAQ in SERP via JSON-LD FAQPage
 * - Internal linking SOFT verso le landing prodotto (/landing/*) — fatto
 *   solo qui dentro, niente modifiche alle pagine esistenti
 *
 * Note di conformita' alle regole del task:
 * - Riusa i componenti Header/Footer gia' presenti, niente design nuovo
 * - Niente modifiche ad altre pagine, componenti, API o routing esistenti
 * - Canonical proprio + OG/Twitter dedicati via metadata API
 */
import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

const PAGE_URL = "https://www.santaddeo.com/seo/faq-santaddeo"

// 20 FAQ ottimizzate per keyword RMS / pricing / revenue management.
// Risposte stringate (max ~80 parole) per favorire estrazione rich result.
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Cos'e' un Revenue Management System (RMS) per hotel?",
    a: "Un Revenue Management System e' un software che aiuta le strutture ricettive a fissare la tariffa giusta per ogni camera, ogni giorno, in base a domanda, occupazione, stagionalita' e concorrenza. L'obiettivo e' massimizzare il fatturato totale (RevPAR), non solo il prezzo medio. Santaddeo e' un RMS italiano pensato per hotel, agriturismi, campeggi, glamping, villaggi e B&B.",
  },
  {
    q: "Che differenza c'e' tra ADR, RevPAR e RevPOR?",
    a: "ADR (Average Daily Rate) e' la tariffa media per camera occupata. RevPAR (Revenue Per Available Room) e' il fatturato per camera disponibile, calcolato come ADR x occupancy. RevPOR (Revenue Per Occupied Room) e' il fatturato medio per camera effettivamente venduta, comprensivo di servizi extra. RevPAR e' il KPI piu' importante perche' bilancia tariffa e occupazione.",
  },
  {
    q: "Il pricing dinamico funziona davvero per gli hotel piccoli?",
    a: "Si. Il pricing dinamico funziona ovunque ci sia variazione di domanda nel tempo: weekend, festivita', eventi locali, alta vs bassa stagione. Anche un B&B da 4 camere puo' guadagnare il 10-25% in piu' rispetto a tariffe fisse, perche' cattura la disponibilita' a pagare di piu' nei periodi di alta domanda senza perdere clienti nei periodi deboli.",
  },
  {
    q: "Quando conviene introdurre un RMS in una struttura ricettiva?",
    a: "Conviene quando la struttura ha almeno 5-6 unita' (camere, piazzole, glamping) e una stagionalita' marcata. Con meno unita' puo' bastare una buona tariffazione manuale, ma anche in questi casi un RMS gratuito come Santaddeo elimina lavoro ripetitivo e permette di prendere decisioni basate su dati reali invece di sensazioni.",
  },
  {
    q: "Santaddeo e' davvero gratuito?",
    a: "Si. La dashboard KPI Santaddeo e' gratuita per sempre: ti dai accesso alle metriche RevPAR, occupazione, ADR e produzione fiscale collegando il tuo PMS. Le funzioni avanzate di pricing dinamico, monitoraggio Guard sui canali OTA e push automatico delle tariffe al PMS sono incluse nei piani a pagamento.",
  },
  {
    q: "Quali PMS si integrano con Santaddeo?",
    a: "Santaddeo si integra in tempo reale con i principali PMS italiani: Scidoo, Bedzzle e altri tramite API ufficiali, oltre a Google Sheets per chi non ha un PMS connesso. L'integrazione legge automaticamente prenotazioni, tariffe e disponibilita', senza che tu debba inserire dati a mano.",
  },
  {
    q: "Quanto tempo serve per attivare il pricing dinamico?",
    a: "Per la dashboard gratuita bastano 15 minuti: collegamento PMS e visualizzazione dei KPI. Il pricing dinamico richiede una fase di setup di 1-3 ore con il revenue manager: definizione delle fasce di occupazione, dei limiti minimi e massimi, e dei vincoli operativi (es. soggiorno minimo). Dopo questa fase il sistema lavora in autonomia.",
  },
  {
    q: "Cosa significa algoritmo K-driven nel pricing?",
    a: "K-driven significa pricing guidato da una costante K che rappresenta la sensibilita' al prezzo della struttura. Santaddeo calcola K dai dati storici della struttura e lo usa per modulare la curva tariffaria. E' un approccio alternativo al pricing basato solo su occupazione futura: tiene conto anche dell'elasticita' di domanda specifica del singolo hotel.",
  },
  {
    q: "Posso continuare a vedere e correggere i prezzi proposti?",
    a: "Si. Santaddeo ha tre modalita': solo notifica via email (il sistema suggerisce, tu decidi e applichi a mano sul PMS), conferma manuale (proponiamo prezzi, li approvi con un click), e autopilot (i prezzi vanno al PMS automaticamente con limiti che imposti tu). Puoi cambiare modalita' in qualsiasi momento.",
  },
  {
    q: "Cos'e' il modulo Guard di Santaddeo?",
    a: "Guard e' il modulo di monitoraggio canali OTA: controlla in tempo reale se Booking, Expedia, Airbnb e altri canali stanno mostrando i prezzi corretti rispetto al tuo PMS. Ti avvisa via email quando trova un disallineamento (rate parity violata, tariffa scomparsa, override accidentale di chi gestisce le OTA), evitando perdite di fatturato silenziose.",
  },
  {
    q: "Il pricing dinamico va bene anche per agriturismi e campeggi?",
    a: "Si. Santaddeo supporta nativamente agriturismi, campeggi, glamping, villaggi turistici, resort e B&B. La logica di pricing si adatta al tipo di struttura: le piazzole di un campeggio hanno una stagionalita' diversa da una camera d'hotel, e l'algoritmo lo considera. Abbiamo strutture clienti in tutte queste categorie.",
  },
  {
    q: "Cosa serve per iniziare a usare Santaddeo?",
    a: "Serve un PMS attivo (oppure un foglio Google con prenotazioni e tariffe) e un account email aziendale. Il setup base si fa online in 15 minuti. Per il pricing dinamico aggiungiamo una call di onboarding gratuita con il revenue manager per configurare regole, vincoli e fasce di occupazione adatte alla tua struttura.",
  },
  {
    q: "Santaddeo gestisce le tariffe non rimborsabili (NRF) e i pacchetti?",
    a: "Si. Il sistema applica regole differenziate per ogni rate plan: tariffa base, NRF, last-minute, long-stay, pacchetti con servizi inclusi. Puoi definire markup o sconti relativi alla tariffa di riferimento e Santaddeo li applica automaticamente quando il prezzo principale cambia, mantenendo coerenza tra tutti i canali.",
  },
  {
    q: "Posso confrontare le mie performance con anni precedenti?",
    a: "Si. La dashboard Santaddeo include il confronto YoY (anno su anno) e periodo precedente per tutti i KPI: produzione, occupancy, ADR, RevPAR, RevPOR. I confronti tengono conto di variazioni di inventario nel tempo (es. camere aggiunte o disattivate) per garantire che RevPAR sia sempre coerente con RevPOR.",
  },
  {
    q: "Quanto si puo' aumentare il RevPAR con un RMS?",
    a: "Le strutture clienti Santaddeo che passano da tariffe statiche a pricing dinamico vedono mediamente un +15-25% di RevPAR nel primo anno. Il guadagno arriva da tre fonti: prezzi piu' alti nei periodi di alta domanda, occupancy piu' alta nei periodi deboli grazie a tariffe competitive, e meno errori operativi nelle modifiche manuali.",
  },
  {
    q: "Santaddeo va bene se ho gia' un revenue manager esterno?",
    a: "Assolutamente si. Molti revenue manager professionisti usano Santaddeo come strumento operativo: la dashboard fornisce i KPI in tempo reale, l'algoritmo propone i prezzi, il revenue manager rivede e approva le scelte strategiche. E' un acceleratore del lavoro umano, non un sostituto.",
  },
  {
    q: "Le mie informazioni sono al sicuro? Chi vede i miei dati?",
    a: "I dati di ogni struttura sono isolati con Row Level Security su Postgres. Solo gli utenti che tu autorizzi vedono i tuoi numeri. I server sono in Europa, conformi al GDPR. Santaddeo non condivide i tuoi dati con altre strutture e non li usa per benchmark senza autorizzazione esplicita.",
  },
  {
    q: "Cosa succede se il mio PMS smette di rispondere?",
    a: "Santaddeo monitora la salute della connessione PMS e ti avvisa entro pochi minuti se il PMS non risponde. In modalita' autopilot il sistema sospende automaticamente i push e riprende quando la connessione torna stabile. Niente push silenziosi quando i dati sono vecchi: la priorita' e' non rovinare il revenue per un errore di rete.",
  },
  {
    q: "Posso provare Santaddeo prima di pagare?",
    a: "Si. La dashboard KPI e' gratis per sempre, senza limite di tempo e senza carta di credito. Il pricing dinamico ha una fase di prova di 30 giorni in modalita' notifica: vedi le proposte, le confronti con le tue scelte, e decidi se passare all'autopilot. Niente commitment fino a che non sei convinto.",
  },
  {
    q: "Come si chiede una demo personalizzata?",
    a: "Vai su /request-info, lasci email, telefono e nome della struttura. Un revenue manager Santaddeo ti contatta entro 24 ore con una demo via call: 30 minuti in cui colleghiamo i tuoi dati reali, mostriamo la dashboard sulla tua struttura e calcoliamo il potenziale di crescita del RevPAR specifico.",
  },
]

export const metadata: Metadata = {
  title: "FAQ Revenue Management e Pricing Hotel | SANTADDEO",
  // SEO 06/05/2026: description 241→158ch
  description:
  "20 risposte alle domande piu' frequenti su Revenue Management, pricing dinamico, ADR, RevPAR e integrazione PMS per hotel, agriturismi, campeggi e B&B.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "FAQ Revenue Management e Pricing Hotel | SANTADDEO",
    description:
      "20 risposte chiare su RMS, pricing dinamico, ADR, RevPAR e integrazione PMS per strutture ricettive italiane.",
    url: PAGE_URL,
    type: "article",
    locale: "it_IT",
    siteName: "SANTADDEO",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ Revenue Management e Pricing Hotel | SANTADDEO",
    description:
      "20 risposte chiare su RMS, pricing dinamico e KPI per strutture ricettive.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

// JSON-LD FAQPage: ogni Q/A diventa una Question entity strutturata.
// Inserito via <script type="application/ld+json"> server-rendered, niente
// JS lato client: nessun impatto su LCP / CLS.
function buildFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${PAGE_URL}#faqpage`,
    inLanguage: "it-IT",
    isPartOf: { "@id": "https://www.santaddeo.com/#website" },
    publisher: { "@id": "https://www.santaddeo.com/#organization" },
    mainEntity: FAQS.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    })),
  }
}

export default function FaqSantaddeoPage() {
  const jsonLd = buildFaqJsonLd()

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JsonLd data={buildBreadcrumbList([{"name":"FAQ Santaddeo","path":"/seo/faq-santaddeo"}])} id="ld-breadcrumb" />
      <Header />

      <main className="flex-1">
        {/* JSON-LD FAQPage per rich result Google. */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- JSON-LD safe by construction
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <section className="container mx-auto max-w-3xl px-6 py-16 md:py-24">
          <header className="mb-12 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-wide text-emerald-700">
              Risorse
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-gray-900 md:text-5xl">
              Domande frequenti su Revenue Management e pricing hotel
            </h1>
            <p className="mt-4 text-pretty text-base leading-relaxed text-gray-600 md:text-lg">
              Le risposte piu' richieste su Revenue Management System,
              pricing dinamico, ADR, RevPAR, occupancy e integrazione PMS,
              spiegate semplicemente. Una guida pratica per gestori di
              hotel, agriturismi, campeggi, glamping, villaggi e B&amp;B.
            </p>
          </header>

          <ol className="space-y-8">
            {FAQS.map((item, idx) => (
              <li key={idx} className="border-b border-gray-200 pb-8 last:border-b-0">
                <h2 className="text-lg font-semibold text-gray-900 md:text-xl">
                  {idx + 1}. {item.q}
                </h2>
                <p className="mt-3 text-pretty leading-relaxed text-gray-700">
                  {item.a}
                </p>
              </li>
            ))}
          </ol>

          {/*
            Internal linking SOFT verso landing prodotto e ARTICOLI BLOG.
            Non duplica il menu, sta in fondo come "Approfondimenti".

            SEO 13/05/2026 (punto 10 audit GSC): aggiunta sotto-sezione
            "Approfondimenti dal blog" con 6 articoli pillar che coprono
            i 5 cluster (RMS / Pricing / KPI / OTA / Distribuzione).
            Tutti questi articoli erano in stato "rilevata ma non
            indicizzata" su GSC e non avevano link contestuali da pagine
            gia' indicizzate: questa pagina FAQ e' uno dei boost-link
            piu' efficaci che possiamo dargli.
          */}
          <aside className="mt-16 space-y-8 rounded-lg border border-gray-200 bg-gray-50 p-6">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Approfondimenti dal blog
              </h2>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <li>
                  <Link
                    href="/blog/software-revenue-management-hotel-italia"
                    className="text-emerald-700 hover:underline"
                  >
                    Software Revenue Management Hotel Italia
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog/cose-un-rms-hotel"
                    className="text-emerald-700 hover:underline"
                  >
                    Cos&apos;e&apos; un RMS hotel
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog/pricing-dinamico-hotel"
                    className="text-emerald-700 hover:underline"
                  >
                    Pricing dinamico hotel: come funziona
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog/come-aumentare-adr-hotel"
                    className="text-emerald-700 hover:underline"
                  >
                    Come aumentare l&apos;ADR hotel
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog/come-aumentare-visibilita-booking"
                    className="text-emerald-700 hover:underline"
                  >
                    Visibilita&apos; su Booking: i 7 fattori
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog/overbooking-come-evitarlo"
                    className="text-emerald-700 hover:underline"
                  >
                    Overbooking: come evitarlo
                  </Link>
                </li>
              </ul>
              <p className="mt-3 text-sm">
                <Link href="/blog" className="font-semibold text-emerald-700 hover:underline">
                  Vedi tutte le guide del blog &rarr;
                </Link>
              </p>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-base font-semibold text-gray-900">
                Risorse e prodotto
              </h2>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <Link href="/seo/cos-e-revenue-management" className="text-emerald-700 hover:underline">
                    Cos&apos;e&apos; il Revenue Management: definizione, esempi e KPI
                  </Link>
                </li>
                <li>
                  <Link href="/landing/dashboard-gratuita" className="text-emerald-700 hover:underline">
                    Dashboard KPI gratuita per il tuo hotel
                  </Link>
                </li>
                <li>
                  <Link href="/landing/guard" className="text-emerald-700 hover:underline">
                    Guard: monitoraggio rate parity sui canali OTA
                  </Link>
                </li>
                <li>
                  <Link href="/landing/autopilot" className="text-emerald-700 hover:underline">
                    Autopilot: pricing dinamico automatico
                  </Link>
                </li>
                <li>
                  <Link href="/features" className="text-emerald-700 hover:underline">
                    Tutte le funzionalita&apos; SANTADDEO
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </section>
      </main>

      <Footer />
    </div>
  )
}
