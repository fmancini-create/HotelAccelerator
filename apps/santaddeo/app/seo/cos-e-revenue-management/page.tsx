/**
 * Pagina educational SEO "Cos'e' il Revenue Management".
 *
 * Obiettivi:
 * - Posizionarsi su query informazionali ad alto volume:
 *   "cos'e' il revenue management", "definizione revenue management",
 *   "RevPAR cosa significa", "ADR cosa significa", "occupancy hotel"
 * - Fornire ancore semantiche (definizioni, formule, esempi) per
 *   estrazione AI / featured snippet
 * - Linkare in soft alle landing prodotto (vendita, dashboard gratuita,
 *   FAQ) — solo qui dentro, niente modifiche a pagine esistenti
 *
 * Conformita' alle regole del task SEO:
 * - Riusa Header/Footer esistenti, nessun design nuovo
 * - JSON-LD Article + BreadcrumbList: niente FAQPage qui (la FAQ ha la sua)
 * - Canonical proprio, OG/Twitter dedicati
 */
import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"

const PAGE_URL = "https://www.santaddeo.com/seo/cos-e-revenue-management"

export const metadata: Metadata = {
  title: "Cos'e' il Revenue Management: definizione, esempi e KPI | SANTADDEO",
  // SEO 06/05/2026: description 230→139ch
  description:
    "Guida al Revenue Management per strutture ricettive: definizione, KPI (ADR, RevPAR, occupancy) e ruolo del Revenue Management System (RMS).",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Cos'e' il Revenue Management: definizione, esempi e KPI | SANTADDEO",
    description:
      "Guida completa: definizione, KPI (ADR, RevPAR, occupancy), pricing dinamico vs statico e ruolo del Revenue Management System per hotel, agriturismi, campeggi e B&B.",
    url: PAGE_URL,
    type: "article",
    locale: "it_IT",
    siteName: "SANTADDEO",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cos'e' il Revenue Management | SANTADDEO",
    description:
      "Definizione, esempi e KPI fondamentali del Revenue Management per strutture ricettive.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

// JSON-LD: Article + BreadcrumbList. Aiuta Google a capire che e' contenuto
// educational (non commerciale puro) e a renderizzare il breadcrumb in SERP.
function buildJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${PAGE_URL}#article`,
        headline: "Cos'e' il Revenue Management: definizione, esempi e KPI",
        description:
          "Guida completa al Revenue Management per strutture ricettive: definizione, esempi pratici, KPI fondamentali e ruolo del Revenue Management System.",
        inLanguage: "it-IT",
        isPartOf: { "@id": "https://www.santaddeo.com/#website" },
        author: { "@id": "https://www.santaddeo.com/#organization" },
        publisher: { "@id": "https://www.santaddeo.com/#organization" },
        mainEntityOfPage: { "@type": "WebPage", "@id": PAGE_URL },
        about: [
          { "@type": "Thing", name: "Revenue Management" },
          { "@type": "Thing", name: "Pricing dinamico" },
          { "@type": "Thing", name: "RevPAR" },
          { "@type": "Thing", name: "ADR" },
          { "@type": "Thing", name: "Occupancy rate" },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${PAGE_URL}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://www.santaddeo.com" },
          { "@type": "ListItem", position: 2, name: "Risorse", item: "https://www.santaddeo.com/seo/cos-e-revenue-management" },
          { "@type": "ListItem", position: 3, name: "Cos'e' il Revenue Management" },
        ],
      },
    ],
  }
}

export default function CosERevenueManagementPage() {
  const jsonLd = buildJsonLd()

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main className="flex-1">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- JSON-LD safe by construction
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <article className="container mx-auto max-w-3xl px-6 py-16 md:py-24">
          <header className="mb-12">
            <p className="mb-3 text-sm font-medium uppercase tracking-wide text-emerald-700">
              Guida educational
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-gray-900 md:text-5xl">
              Cos&apos;e&apos; il Revenue Management: definizione, esempi e KPI
            </h1>
            <p className="mt-4 text-pretty text-base leading-relaxed text-gray-600 md:text-lg">
              Una spiegazione semplice e operativa del Revenue Management
              per chi gestisce hotel, agriturismi, campeggi, glamping,
              villaggi e B&amp;B. Cosa significa, perche&apos; funziona,
              quali KPI guardare, come iniziare.
            </p>
          </header>

          <section className="prose prose-gray max-w-none [&_h2]:mt-10 [&_h2]:scroll-mt-20 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900 [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-gray-700 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-gray-700 [&_li]:mt-1">
            {/* H2 #1 — Definizione */}
            <h2 id="definizione">Definizione di Revenue Management</h2>
            <p>
              Il Revenue Management e&apos; la disciplina che applica analisi dei
              dati e principi economici per <strong>vendere il prodotto giusto, al
              cliente giusto, al prezzo giusto, nel momento giusto, attraverso il
              canale giusto</strong>. Nato nel settore aereo negli anni &apos;80, oggi
              e&apos; lo standard nel mondo dell&apos;ospitalita&apos;: hotel, agriturismi,
              campeggi, glamping, villaggi e B&amp;B lo usano per massimizzare
              il fatturato totale invece di limitarsi a riempire le camere o ad
              alzare il prezzo medio.
            </p>
            <p>
              In pratica significa partire dai dati storici della struttura,
              prevedere la domanda futura per ogni singolo giorno, e adattare le
              tariffe in modo che ogni periodo (basso, medio, alto) raggiunga
              il miglior compromesso tra prezzo e occupazione.
            </p>

            {/* H2 #2 — Perche' funziona */}
            <h2 id="perche-funziona">Perche&apos; il Revenue Management funziona</h2>
            <p>
              Funziona perche&apos; sfrutta tre fenomeni reali del mercato turistico:
            </p>
            <ul>
              <li>
                <strong>Variabilita&apos; della domanda</strong>: weekend, festivita&apos;,
                eventi locali e stagioni alte/basse generano picchi e cali di
                richiesta su orizzonti diversi.
              </li>
              <li>
                <strong>Elasticita&apos; al prezzo asimmetrica</strong>: nei periodi di
                alta domanda i clienti accettano tariffe piu&apos; alte; nei periodi
                deboli un piccolo sconto puo&apos; portare riempimenti significativi.
              </li>
              <li>
                <strong>Inventario deperibile</strong>: una camera non venduta oggi
                e&apos; persa per sempre, non si puo&apos; mettere a magazzino. Quindi
                ogni notte vuota e&apos; un costo opportunita&apos; reale.
              </li>
            </ul>

            {/* H2 #3 — KPI */}
            <h2 id="kpi">I KPI fondamentali</h2>
            <p>
              Il Revenue Management si misura con quattro indicatori principali.
              Comprenderli e seguirli giorno per giorno e&apos; il primo passo
              concreto per migliorare le performance.
            </p>

            <h3 id="adr">ADR (Average Daily Rate)</h3>
            <p>
              La tariffa media per camera occupata. Si calcola come fatturato
              camere diviso il numero di camere vendute. Risponde alla domanda:
              &laquo;quanto ho fatto pagare in media chi ha prenotato?&raquo;
              Per il dettaglio operativo leggi{" "}
              <Link href="/blog/cose-adr" className="text-emerald-700 hover:underline">
                cos&apos;e&apos; l&apos;ADR e come calcolarlo
              </Link>{" "}
              e{" "}
              <Link
                href="/blog/come-aumentare-adr-hotel"
                className="text-emerald-700 hover:underline"
              >
                come aumentare l&apos;ADR
              </Link>
              .
            </p>

            <h3 id="occupancy">Occupancy Rate (tasso di occupazione)</h3>
            <p>
              La percentuale di camere vendute sul totale disponibile. Risponde
              alla domanda: &laquo;quanto sono pieno?&raquo;. Da solo non basta:
              un albergo pieno ma a tariffe basse puo&apos; fatturare meno di un
              albergo con occupancy minore ma tariffe migliori.
            </p>

            <h3 id="revpar">RevPAR (Revenue Per Available Room)</h3>
            <p>
              <strong>RevPAR = ADR x Occupancy</strong>. E&apos; il KPI piu&apos; usato
              perche&apos; bilancia prezzo e occupazione in un singolo numero. Un
              aumento di RevPAR significa che la struttura sta ottimizzando il
              compromesso tra le due leve, non massimizzandone solo una.
            </p>

            <h3 id="revpor">RevPOR (Revenue Per Occupied Room)</h3>
            <p>
              Il fatturato medio per camera effettivamente venduta, comprensivo
              di servizi extra (ristorazione, SPA, late check-out, ecc.).
              Risponde alla domanda: &laquo;quanto vale ogni cliente che entra in
              struttura?&raquo;. Per definizione e&apos; sempre maggiore o uguale
              al RevPAR.
            </p>

            {/* H2 #4 — Esempio pratico */}
            <h2 id="esempio">Un esempio pratico</h2>
            <p>
              Immaginiamo un agriturismo da 8 camere durante un weekend di
              ottobre. Strategia A: tariffa fissa a 100&euro;, vende 5 camere.
              Strategia B: pricing dinamico che parte da 90&euro; e sale a
              130&euro; man mano che le camere si esauriscono, vende 7 camere
              a tariffe miste.
            </p>
            <ul>
              <li>
                <strong>Strategia A</strong>: 5 x 100 = 500&euro;. ADR 100&euro;,
                Occupancy 62.5%, RevPAR 62.5&euro;.
              </li>
              <li>
                <strong>Strategia B</strong>: 90 + 95 + 105 + 115 + 120 + 125 + 130
                = 780&euro;. ADR ~111&euro;, Occupancy 87.5%, RevPAR 97.5&euro;.
              </li>
            </ul>
            <p>
              Stessa struttura, stesso weekend: il pricing dinamico produce un
              RevPAR del 56% piu&apos; alto. Su un anno intero la differenza
              cumulata e&apos; quello che fa la differenza tra una stagione
              chiusa in pari e una stagione che permette di reinvestire. Se
              vuoi capire come si imposta concretamente un{" "}
              <Link
                href="/blog/pricing-dinamico-hotel"
                className="text-emerald-700 hover:underline"
              >
                pricing dinamico per il tuo hotel
              </Link>{" "}
              e quali sono{" "}
              <Link
                href="/blog/errori-pricing-hotel"
                className="text-emerald-700 hover:underline"
              >
                gli errori di pricing piu&apos; comuni
              </Link>
              , trovi i dettagli nel blog.
            </p>

            {/* H2 #5 — RMS */}
            <h2 id="rms">Il ruolo del Revenue Management System</h2>
            <p>
              Un Revenue Management System (RMS) e&apos; il software che rende
              operativo questo lavoro. Senza un RMS il revenue manager passa la
              maggior parte del tempo a estrarre dati dal PMS, costruire
              spreadsheet e modificare tariffe a mano. Con un RMS la sequenza
              dati &rarr; previsione &rarr; tariffa proposta avviene in tempo reale,
              e il revenue manager puo&apos; concentrarsi sulle decisioni
              strategiche: posizionamento, pacchetti, canali, segmentazione.
              Per approfondire leggi{" "}
              <Link
                href="/blog/cose-un-rms-hotel"
                className="text-emerald-700 hover:underline"
              >
                cos&apos;e&apos; un RMS hotel
              </Link>{" "}
              e{" "}
              <Link
                href="/blog/come-scegliere-un-rms"
                className="text-emerald-700 hover:underline"
              >
                come scegliere il giusto RMS
              </Link>
              .
            </p>
            <p>
              <Link href="/" className="text-emerald-700 hover:underline">
                SANTADDEO
              </Link>{" "}
              e&apos; un Revenue Management System italiano pensato per ogni tipo
              di struttura ricettiva: hotel, agriturismi, campeggi, glamping,
              villaggi e B&amp;B. La{" "}
              <Link href="/landing/dashboard-gratuita" className="text-emerald-700 hover:underline">
                dashboard KPI
              </Link>{" "}
              e&apos; gratuita per sempre, le funzioni di pricing dinamico,
              monitoraggio Guard e push automatico al PMS sono nei piani
              premium.
            </p>

            {/* H2 #6 — Quando partire */}
            <h2 id="iniziare">Quando e come iniziare</h2>
            <p>
              Il momento giusto per introdurre il Revenue Management e&apos;
              quando senti almeno una di queste tre frasi:
            </p>
            <ul>
              <li>
                &laquo;Le tariffe le aggiorno a mano e a sentimento&raquo;
                &rarr; perdi opportunita&apos; nei periodi di alta domanda.
              </li>
              <li>
                &laquo;A consuntivo non capisco se l&apos;anno e&apos; andato bene
                o male&raquo; &rarr; mancano i KPI corretti per giudicare.
              </li>
              <li>
                &laquo;Le OTA mi mostrano prezzi diversi rispetto al PMS e me
                ne accorgo solo quando un cliente lo segnala&raquo; &rarr;
                serve un monitoraggio rate parity automatico.
              </li>
            </ul>
            <p>
              Il primo passo concreto e&apos; collegare il PMS a una dashboard
              KPI affidabile per vedere, finalmente, ADR, Occupancy, RevPAR e
              RevPOR aggiornati in tempo reale. Poi si decide se passare al
              pricing dinamico vero e proprio, prima in modalita&apos; di sola
              notifica e poi in autopilot.
            </p>
          </section>

          {/*
            Internal linking SOFT verso landing prodotto, FAQ e ARTICOLI BLOG.
            SEO 13/05/2026 (punto 10 audit GSC): aggiunti link verso 4
            articoli blog ancora "rilevati ma non indicizzati" per dare a
            Google segnali di topical authority e farli scoprire da una
            pagina gia' indicizzata.
          */}
          <aside className="mt-16 rounded-lg border border-gray-200 bg-gray-50 p-6">
            <h2 className="text-base font-semibold text-gray-900">
              Continua a leggere
            </h2>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <li>
                <Link
                  href="/blog/software-revenue-management-hotel-italia"
                  className="text-emerald-700 hover:underline"
                >
                  Software Revenue Management Hotel Italia (guida completa)
                </Link>
              </li>
              <li>
                <Link
                  href="/blog/migliori-rms-hotel-2026"
                  className="text-emerald-700 hover:underline"
                >
                  Migliori RMS hotel 2026: confronto
                </Link>
              </li>
              <li>
                <Link
                  href="/blog/rms-per-piccoli-hotel"
                  className="text-emerald-700 hover:underline"
                >
                  RMS per piccoli hotel e B&amp;B
                </Link>
              </li>
              <li>
                <Link
                  href="/blog/strategie-prezzo-bassa-stagione"
                  className="text-emerald-700 hover:underline"
                >
                  Strategie di prezzo in bassa stagione
                </Link>
              </li>
              <li>
                <Link href="/seo/faq-santaddeo" className="text-emerald-700 hover:underline">
                  FAQ Revenue Management e pricing hotel: 20 risposte chiare
                </Link>
              </li>
              <li>
                <Link href="/landing/vendita" className="text-emerald-700 hover:underline">
                  Aumenta il fatturato del 20% in 30 giorni
                </Link>
              </li>
              <li>
                <Link href="/landing/autopilot" className="text-emerald-700 hover:underline">
                  Pricing dinamico in autopilot: come funziona
                </Link>
              </li>
              <li>
                <Link href="/features" className="text-emerald-700 hover:underline">
                  Tutte le funzionalita&apos; SANTADDEO
                </Link>
              </li>
            </ul>
          </aside>
        </article>
      </main>

      <Footer />
    </div>
  )
}
