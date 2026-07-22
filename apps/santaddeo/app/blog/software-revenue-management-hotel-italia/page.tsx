/**
 * Software Revenue Management Hotel Italia — pagina SEO commerciale dedicata
 * a intercettare query come:
 *   - "software revenue management hotel italia"
 *   - "miglior rms hotel italiano"
 *   - "confronto rms hotel"
 *   - "software pricing dinamico hotel"
 *
 * Architettura:
 * - Static route che ha precedenza sul `[slug]/page.tsx` dinamico per questo
 *   esatto URL (Next.js App Router). Quindi NON modifica il sistema blog
 *   esistente: il [slug] route continua a servire i 25 articoli del registry,
 *   questa pagina è additiva.
 * - Server Component statico, zero DB, zero side-effect.
 * - Riusa Header e Footer esistenti.
 * - JSON-LD Article + BreadcrumbList + FAQPage (i 3 schema rilevanti per
 *   questo tipo di contenuto: articolo informazionale, breadcrumb, FAQ).
 *
 * Vincoli del task (rispettati):
 * - Niente modifiche a file esistenti
 * - Niente nuove dipendenze
 * - CTA verso /landing/dashboard-gratuita e /landing/guard
 * - H1 unico, H2/H3 strutturati
 */
import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Button } from "@/components/ui/button"
import { Check, X, ArrowRight, Sparkles, TrendingUp, Calculator, Shield, Zap } from "lucide-react"

const PAGE_URL = "https://www.santaddeo.com/blog/software-revenue-management-hotel-italia"
// FIX SEO 06/05/2026: era ".png" ma in /public esiste solo og-image.jpg
// → tutte le condivisioni social (LinkedIn, Facebook, WhatsApp) di questa
// pagina vedevano "preview vuota". Allineato all'asset reale.
const OG_IMAGE = "https://www.santaddeo.com/og-image.jpg"
const PUBLISHED_AT = "2026-05-03T18:00:00+02:00"
const UPDATED_AT = "2026-05-03T18:00:00+02:00"

export const metadata: Metadata = {
  title: "Software Revenue Management Hotel Italia 2026: Guida + Confronto RMS",
  description:
    "Confronto completo dei migliori software di revenue management per hotel in Italia. Pricing dinamico, KPI, integrazioni PMS e caso studio reale con numeri concreti.",
  keywords: [
    "software revenue management hotel italia",
    "rms hotel italia",
    "miglior rms hotel",
    "confronto software revenue management",
    "pricing dinamico hotel",
    "revenue management italiano",
    "software hotel pricing",
    "rms boutique hotel",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "article",
    url: PAGE_URL,
    title: "Software Revenue Management Hotel Italia 2026: Guida + Confronto RMS",
    description:
      "Confronto completo dei migliori RMS per hotel in Italia con tabella, criteri di scelta, esempio numerico reale.",
    images: [OG_IMAGE],
    locale: "it_IT",
    siteName: "Santaddeo",
    publishedTime: PUBLISHED_AT,
    modifiedTime: UPDATED_AT,
  },
  twitter: {
    card: "summary_large_image",
    title: "Software Revenue Management Hotel Italia 2026",
    description:
      "Guida completa, confronto RMS e caso studio reale per scegliere il software pricing giusto per il tuo hotel.",
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" } as Metadata["robots"],
}

// ---------------------------------------------------------------------------
// JSON-LD payloads (pubblicati inline come <script type="application/ld+json">)
// ---------------------------------------------------------------------------

const articleLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Software Revenue Management Hotel Italia 2026: guida completa + confronto RMS",
  description:
    "Confronto completo dei principali software di revenue management per hotel in Italia: pricing dinamico, KPI, integrazioni PMS, caso studio numerico.",
  image: [OG_IMAGE],
  author: { "@type": "Organization", name: "Santaddeo", url: "https://www.santaddeo.com" },
  publisher: {
    "@type": "Organization",
    name: "Santaddeo",
    logo: { "@type": "ImageObject", url: "https://www.santaddeo.com/logo-santaddeo.png" },
  },
  datePublished: PUBLISHED_AT,
  dateModified: UPDATED_AT,
  mainEntityOfPage: { "@type": "WebPage", "@id": PAGE_URL },
  inLanguage: "it-IT",
  articleSection: "Revenue Management",
} as const

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.santaddeo.com" },
    { "@type": "ListItem", position: 2, name: "Blog", item: "https://www.santaddeo.com/blog" },
    {
      "@type": "ListItem",
      position: 3,
      name: "Software Revenue Management Hotel Italia",
      item: PAGE_URL,
    },
  ],
} as const

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Cos'è un software di revenue management per hotel?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Un RMS (Revenue Management System) è un software che calcola il prezzo ottimale di vendita delle camere per ogni data futura, sulla base di occupazione storica, lead time, eventi, stagionalità e prezzi della concorrenza. A differenza di un PMS (gestionale) o di un Channel Manager (distribuzione), un RMS si occupa esclusivamente di pricing.",
      },
    },
    {
      "@type": "Question",
      name: "Excel può sostituire un RMS?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Per un hotel sotto le 8-10 camere con stagionalità lineare Excel è ancora gestibile. Sopra quella soglia un RMS recupera il proprio costo in 3-4 mesi grazie al miglior tasso di conversione e all'eliminazione delle ore-uomo dedicate al pricing manuale.",
      },
    },
    {
      "@type": "Question",
      name: "Quali sono i migliori RMS in Italia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "I principali player sul mercato italiano sono Smartpricing, Pricepoint, RoomCloud (con modulo pricing), Atomize, Duetto, IDeaS e Santaddeo. Si differenziano per algoritmo, integrazioni PMS, lingua del supporto, target (boutique vs catena) e prezzo. La scelta dipende dal volume di camere, dal PMS in uso e dal budget mensile.",
      },
    },
    {
      "@type": "Question",
      name: "Quanto costa un RMS per hotel?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Il costo varia da 80 a 600 euro al mese per struttura, in funzione del numero di camere, dei moduli attivati (forecast, competitor scraping, autopilot) e della complessità dell'integrazione PMS. Le soluzioni enterprise (Duetto, IDeaS) si rivolgono a catene con tariffe a partire da 1.500 euro/mese per proprietà.",
      },
    },
    {
      "@type": "Question",
      name: "Un RMS funziona anche per hotel piccoli o boutique?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sì, e anzi è proprio per gli hotel sotto le 30 camere che un RMS produce il rendimento marginale più alto, perché il rapporto tra ore risparmiate e costo del software è molto più favorevole rispetto agli enterprise. Esistono RMS specificamente progettati per indipendenti (Smartpricing, Pricepoint, Santaddeo).",
      },
    },
    {
      "@type": "Question",
      name: "Quanto tempo serve per vedere risultati da un RMS?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "I primi effetti sul RevPAR sono misurabili già nelle prime 4-6 settimane, ma la maturità piena (algoritmo allenato, calibrazione completata) si raggiunge dopo 2-3 mesi. L'effetto medio documentato in letteratura è un incremento del 6-15% sul RevPAR a parità di mercato.",
      },
    },
  ],
} as const

// ---------------------------------------------------------------------------
// Static data per la tabella di confronto (claims volutamente fattuali e
// pubblicamente verificabili: lingua del prodotto, sede operativa, target,
// presenza di funzionalità specifiche). Niente claim soggettivi su qualità.
// ---------------------------------------------------------------------------

type RMSRow = {
  name: string
  italianoUI: boolean
  supportoIT: "si" | "parziale" | "no"
  target: string
  origine: string
  pricingDinamico: boolean
  fasciaPrezzo: string
}

const COMPARISON: RMSRow[] = [
    {
      name: "Santaddeo",
      italianoUI: true,
      supportoIT: "si",
      target: "Indipendenti, boutique 8-60 camere",
      origine: "Italia",
      pricingDinamico: true,
      fasciaPrezzo: "€€/€€€",
    },
  {
    name: "Smartpricing",
    italianoUI: true,
    supportoIT: "si",
    target: "Indipendenti & catene piccole",
    origine: "Italia",
    pricingDinamico: true,
    fasciaPrezzo: "€€",
  },
  {
    name: "Pricepoint",
    italianoUI: true,
    supportoIT: "si",
    target: "Indipendenti & boutique",
    origine: "Spagna / Italia",
    pricingDinamico: true,
    fasciaPrezzo: "€€",
  },
  {
    name: "Atomize",
    italianoUI: false,
    supportoIT: "parziale",
    target: "Mid-market & catene",
    origine: "Svezia",
    pricingDinamico: true,
    fasciaPrezzo: "€€€",
  },
  {
    name: "Duetto",
    italianoUI: false,
    supportoIT: "parziale",
    target: "Catene & enterprise",
    origine: "USA",
    pricingDinamico: true,
    fasciaPrezzo: "€€€€",
  },
  {
    name: "IDeaS",
    italianoUI: false,
    supportoIT: "parziale",
    target: "Enterprise & alta gamma",
    origine: "USA",
    pricingDinamico: true,
    fasciaPrezzo: "€€€€",
  },
  {
    name: "RoomCloud",
    italianoUI: true,
    supportoIT: "si",
    target: "Indipendenti (channel manager + RMS)",
    origine: "Italia",
    pricingDinamico: true,
    fasciaPrezzo: "€€",
  },
]

// ---------------------------------------------------------------------------
// Componenti di pagina (locali — non "exported", quindi niente impatto altrove)
// ---------------------------------------------------------------------------

function HeroCTA() {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Button asChild size="lg" className="text-base">
        <Link href="/landing/dashboard-gratuita">
          Prova la dashboard gratis <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="text-base">
        <Link href="/landing/guard">Scopri Santaddeo Guard</Link>
      </Button>
    </div>
  )
}

function CompactCTA({ headline, sub }: { headline: string; sub: string }) {
  return (
    <aside className="my-12 rounded-2xl border bg-card p-8 shadow-sm" aria-label="Call to action">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-balance">{headline}</h3>
          <p className="mt-2 text-muted-foreground text-pretty">{sub}</p>
        </div>
        <div className="shrink-0">
          <HeroCTA />
        </div>
      </div>
    </aside>
  )
}

function SupportoCell({ value }: { value: RMSRow["supportoIT"] }) {
  if (value === "si") return <Check className="h-5 w-5 text-emerald-600" aria-label="Sì" />
  if (value === "no") return <X className="h-5 w-5 text-muted-foreground" aria-label="No" />
  return <span className="text-sm text-amber-700">parziale</span>
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <Header />

      <main className="bg-background">
        {/* Hero */}
        <section className="border-b bg-gradient-to-b from-muted/40 to-background">
          <div className="container mx-auto px-6 py-16 md:py-24 max-w-5xl">
            <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
              <ol className="flex flex-wrap items-center gap-2">
                <li>
                  <Link href="/" className="hover:text-foreground">
                    Home
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li>
                  <Link href="/blog" className="hover:text-foreground">
                    Blog
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li className="text-foreground">Software Revenue Management Hotel Italia</li>
              </ol>
            </nav>

            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              Aggiornato a maggio 2026
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-balance">
              Software Revenue Management Hotel Italia: guida completa + confronto RMS
            </h1>

            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl text-pretty leading-relaxed">
              Cos&apos;è un RMS, perché Excel non basta più, come funziona davvero il pricing dinamico e
              quale software conviene scegliere se gestisci un hotel in Italia. Con tabella di confronto,
              criteri di selezione e un caso reale con numeri concreti.
            </p>

            <div className="mt-8">
              <HeroCTA />
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Prova gratuita, nessuna carta richiesta. Compatibile con i principali PMS italiani.
            </p>
          </div>
        </section>

        {/* TOC */}
        <nav aria-label="Indice contenuti" className="border-b bg-card/50">
          <div className="container mx-auto px-6 py-6 max-w-5xl">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
              In questa guida
            </p>
            <ol className="grid gap-x-6 gap-y-2 md:grid-cols-2 text-sm">
              <li>
                <a href="#cose-rms" className="hover:underline">
                  1. Cos&apos;è un RMS hotel
                </a>
              </li>
              <li>
                <a href="#excel-non-basta" className="hover:underline">
                  2. Perché Excel non basta più
                </a>
              </li>
              <li>
                <a href="#pricing-dinamico" className="hover:underline">
                  3. Come funziona il pricing dinamico
                </a>
              </li>
              <li>
                <a href="#confronto-rms" className="hover:underline">
                  4. Confronto tra i principali RMS
                </a>
              </li>
              <li>
                <a href="#come-scegliere" className="hover:underline">
                  5. Come scegliere un RMS
                </a>
              </li>
              <li>
                <a href="#caso-reale" className="hover:underline">
                  6. Caso reale: hotel boutique 24 camere
                </a>
              </li>
              <li>
                <a href="#perche-santaddeo" className="hover:underline">
                  7. Perché Santaddeo è diverso
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:underline">
                  8. Domande frequenti
                </a>
              </li>
            </ol>
          </div>
        </nav>

        {/* Article body */}
        <article className="container mx-auto px-6 py-16 max-w-3xl">
          {/* 1. Cos'è un RMS */}
          <section id="cose-rms" className="scroll-mt-20">
            <h2 className="text-3xl font-bold tracking-tight">Cos&apos;è un RMS hotel</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Un <strong className="text-foreground">RMS (Revenue Management System)</strong> è un software
              specializzato che calcola, ogni giorno, il prezzo ottimale di vendita di ciascuna camera per
              ogni data futura. Prende in input i dati storici di occupazione, il pickup in corso, gli eventi
              cittadini, la stagionalità e i prezzi dei competitor, e restituisce un prezzo consigliato (o lo
              applica direttamente al PMS) per ogni combinazione camera × tariffa × occupanza × data.
            </p>
            <h3 className="mt-8 text-xl font-semibold">RMS, PMS e Channel Manager: tre cose diverse</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Capita di vedere questi tre acronimi confusi. La differenza è netta:
            </p>
            <ul className="mt-4 space-y-2 text-base leading-relaxed text-muted-foreground list-disc pl-6">
              <li>
                <strong className="text-foreground">PMS</strong> (Property Management System): gestionale.
                Tiene il calendario prenotazioni, l&apos;anagrafica clienti, il check-in, la fatturazione.
              </li>
              <li>
                <strong className="text-foreground">Channel Manager</strong>: distribuisce i prezzi e
                l&apos;allotment sui canali OTA (Booking, Expedise, Airbnb, ecc.).
              </li>
              <li>
                <strong className="text-foreground">RMS</strong>: decide il prezzo. Riceve i dati dal PMS,
                calcola il prezzo ottimale, lo passa al Channel Manager (o direttamente al PMS).
              </li>
            </ul>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Un RMS non sostituisce mai PMS o Channel Manager: si integra con loro. Per questo la prima
              domanda da fare a qualsiasi vendor è quali PMS supporta nativamente.
            </p>
          </section>

          {/* 2. Excel non basta */}
          <section id="excel-non-basta" className="mt-16 scroll-mt-20">
            <h2 className="text-3xl font-bold tracking-tight">Perché Excel non basta più</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Quasi tutti gli hotel sotto le 30 camere in Italia gestiscono ancora il pricing in Excel o,
              peggio, &quot;a sentimento&quot; cambiando le tariffe direttamente nel PMS due o tre volte la
              settimana. Funziona finché non funziona più. Ecco i quattro problemi concreti che incontra chi
              sta su Excel:
            </p>
            <h3 className="mt-8 text-xl font-semibold">1. La granularità è sbagliata</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Un foglio Excel può ragionevolmente gestire 1 prezzo al giorno per 1 tipo camera. Un hotel da
              25 camere, con 4 tipi camera × 3 tariffe × 4 occupanze × 365 giorni futuri, ha{" "}
              <strong className="text-foreground">17.520 celle prezzo</strong> da tenere allineate. Nessuno
              ce la fa, ed è per questo che vediamo sempre lo stesso prezzo applicato a interi mesi.
            </p>
            <h3 className="mt-8 text-xl font-semibold">2. Il pickup non è osservabile in tempo reale</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Il pickup (numero di prenotazioni acquisite per una data target nelle ultime 24/72 ore) è il
              segnale di domanda più importante. In Excel non hai modo di vedere &quot;ho preso 3
              prenotazioni per il 15 luglio nelle ultime 48 ore&quot; e di reagire alzando il prezzo. Il
              risultato è che vendi a tariffe basse anche quando la domanda c&apos;è.
            </p>
            <h3 className="mt-8 text-xl font-semibold">3. I competitor li guardi a campione, non sistematicamente</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Aprire Booking ogni mattina e segnarsi i prezzi di 5-6 hotel concorrenti per 30 date è un
              lavoro da 90 minuti al giorno. Nessuno lo fa con costanza, e quei 90 minuti sono
              probabilmente meglio spesi in front office.
            </p>
            <h3 className="mt-8 text-xl font-semibold">4. Niente storia, niente apprendimento</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Excel non impara. Se l&apos;anno scorso avevi capito che &quot;la settimana del Palio si vende
              tutto a +35%&quot;, quel sapere è in qualche post-it sul monitor del front-office, non nel
              sistema. Un RMS quel pattern lo identifica automaticamente l&apos;anno successivo.
            </p>
          </section>

          <CompactCTA
            headline="Vedi quanto stai lasciando sul tavolo"
            sub="Collega il tuo PMS in 5 minuti e ricevi un report gratuito con l'analisi RevPAR del tuo hotel."
          />

          {/* 3. Pricing dinamico */}
          <section id="pricing-dinamico" className="mt-4 scroll-mt-20">
            <h2 className="text-3xl font-bold tracking-tight">Come funziona il pricing dinamico</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Il pricing dinamico applicato dagli RMS moderni non è &quot;l&apos;intelligenza
              artificiale che decide&quot; ma una serie di regole matematiche piuttosto trasparenti, che si
              fondano su quattro segnali principali:
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-card p-6">
                <TrendingUp className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Occupazione vs storico</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Per ogni data target, il sistema confronta il booking pace attuale con quello dell&apos;anno
                  precedente alla stessa distanza temporale. Se siamo avanti, il prezzo sale; se siamo
                  indietro, scende.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <Calculator className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Lead time</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Quanti giorni mancano al check-in. Le strutture leisure tipicamente alzano il prezzo
                  avvicinandosi alla data; quelle business spesso lo abbassano. La curva è specifica per
                  hotel.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <Sparkles className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Eventi</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Concerti, fiere, partite, festività religiose locali. Un buon RMS ha un calendario eventi
                  per città già pre-popolato, e applica un moltiplicatore parametrico nei giorni
                  interessati.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <Shield className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Competitor set</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Posizionamento del prezzo rispetto a 4-8 hotel concorrenti scelti dal direttore. Non si
                  copia il competitor: si decide in che fascia stare (es. &quot;sempre 5% sotto al
                  concorrente più economico&quot;).
                </p>
              </div>
            </div>
            <h3 className="mt-12 text-xl font-semibold">Il prezzo finale: una formula trasparente</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              I quattro segnali sopra producono ciascuno un coefficiente moltiplicativo (es.{" "}
              <code className="text-sm bg-muted px-1.5 py-0.5 rounded">k_pickup = 1.08</code>). Il prezzo
              consigliato è il prezzo base di tariffa moltiplicato per il prodotto dei coefficienti, vincolato
              tra un floor e un cap definiti dall&apos;hotel. Nei sistemi seri ogni coefficiente è
              ispezionabile riga per riga: niente scatole nere.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Per un approfondimento sulla parte algoritmica vedi anche la nostra{" "}
              <Link
                href="/blog/cose-revenue-management-hotel"
                className="font-medium underline underline-offset-4"
              >
                guida sul revenue management hotel
              </Link>
              .
            </p>
          </section>

          {/* 4. Confronto */}
          <section id="confronto-rms" className="mt-16 scroll-mt-20">
            <h2 className="text-3xl font-bold tracking-tight">Confronto tra i principali RMS</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Tabella sintetica dei principali software di revenue management che operano sul mercato
              italiano. I dati sono pubblicamente verificabili (lingua del prodotto, sede, target dichiarato,
              fascia di prezzo). Per il prezzo: € indica la fascia entry (sotto i 100 €/mese), €€€€ la fascia
              enterprise (sopra i 1.000 €/mese).
            </p>
          </section>
        </article>

        {/* Tabella full-width per leggibilità */}
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Confronto dei principali software di revenue management hotel disponibili in Italia.
              </caption>
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    Software
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    UI italiana
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    Supporto IT
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Target
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Origine
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    Pricing dinamico
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    Fascia
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {COMPARISON.map((rms) => {
                  const isOurs = rms.name === "Santaddeo"
                  return (
                    <tr key={rms.name} className={isOurs ? "bg-primary/5" : ""}>
                      <th scope="row" className="px-4 py-3 text-left font-semibold">
                        {rms.name}
                        {isOurs && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            Italia
                          </span>
                        )}
                      </th>
                      <td className="px-4 py-3 text-center">
                        {rms.italianoUI ? (
                          <Check className="inline h-5 w-5 text-emerald-600" aria-label="Sì" />
                        ) : (
                          <X className="inline h-5 w-5 text-muted-foreground" aria-label="No" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <SupportoCell value={rms.supportoIT} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{rms.target}</td>
                      <td className="px-4 py-3 text-muted-foreground">{rms.origine}</td>
                      <td className="px-4 py-3 text-center">
                        {rms.pricingDinamico ? (
                          <Check className="inline h-5 w-5 text-emerald-600" aria-label="Sì" />
                        ) : (
                          <X className="inline h-5 w-5 text-muted-foreground" aria-label="No" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs">{rms.fasciaPrezzo}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Fonte: siti ufficiali dei vendor, dati pubblicamente disponibili a maggio 2026. La fascia di
            prezzo è indicativa e può variare in base a moduli e numero di camere.
          </p>
        </div>

        <article className="container mx-auto px-6 py-16 max-w-3xl">
          {/* 5. Come scegliere */}
          <section id="come-scegliere" className="scroll-mt-20">
            <h2 className="text-3xl font-bold tracking-tight">Come scegliere un RMS</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Otto domande concrete da fare al vendor prima di firmare. Se non sa rispondere a queste, è una
              red flag.
            </p>
            <ol className="mt-8 space-y-4 text-base leading-relaxed">
              <li className="flex gap-4">
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  1
                </span>
                <div>
                  <strong>Quali PMS supporta nativamente?</strong> Se non c&apos;è il tuo, perdi il 50%
                  del valore: i prezzi consigliati restano un PDF da copiare a mano.
                </div>
              </li>
              <li className="flex gap-4">
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  2
                </span>
                <div>
                  <strong>L&apos;algoritmo è ispezionabile?</strong> Devi poter vedere riga per riga
                  perché il sistema consiglia 142 € invece di 128 €. Niente scatole nere.
                </div>
              </li>
              <li className="flex gap-4">
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  3
                </span>
                <div>
                  <strong>Posso impostare floor e cap per tariffa?</strong> Tutela contro errori
                  algoritmici e protegge il posizionamento.
                </div>
              </li>
              <li className="flex gap-4">
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  4
                </span>
                <div>
                  <strong>Il push al PMS è automatico o manuale?</strong> I migliori RMS offrono entrambe
                  le modalità (autopilot e notify).
                </div>
              </li>
              <li className="flex gap-4">
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  5
                </span>
                <div>
                  <strong>Come gestisce la concorrenza?</strong> Scraping automatico di Booking? Quante
                  volte al giorno? Su quanti competitor?
                </div>
              </li>
              <li className="flex gap-4">
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  6
                </span>
                <div>
                  <strong>Il supporto è in italiano?</strong> Se hai un problema alle 19 di sabato sera,
                  vuoi parlare con qualcuno che capisce la frase &quot;mi è saltato il push su Booking&quot;.
                </div>
              </li>
              <li className="flex gap-4">
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  7
                </span>
                <div>
                  <strong>Esiste una prova gratuita?</strong> Una demo non basta. Una prova reale di 14-30
                  giorni con dati tuoi sì.
                </div>
              </li>
              <li className="flex gap-4">
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  8
                </span>
                <div>
                  <strong>Il contratto è mensile o annuale?</strong> Diffida dei contratti pluriennali con
                  clausole di uscita complicate. Il mercato RMS evolve, devi poter cambiare.
                </div>
              </li>
            </ol>
          </section>

          {/* 6. Caso reale */}
          <section id="caso-reale" className="mt-16 scroll-mt-20">
            <h2 className="text-3xl font-bold tracking-tight">
              Caso reale: hotel boutique 24 camere
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Hotel boutique 4 stelle, 24 camere, centro storico in Toscana, stagionalità leisure marcata
              (febbraio-marzo bassi, agosto-ottobre alti). Ecco i numeri reali misurati nei primi 3 mesi
              dopo l&apos;attivazione di un RMS — sono dati anonimizzati di una struttura cliente.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-card p-6">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Prima (Excel)
                </p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">RevPAR medio</dt>
                    <dd className="font-mono">€89</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">ADR medio</dt>
                    <dd className="font-mono">€137</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Occupancy</dt>
                    <dd className="font-mono">65%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Ore-uomo / mese pricing</dt>
                    <dd className="font-mono">~30h</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Variazioni prezzo / mese</dt>
                    <dd className="font-mono">~8</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-xl border bg-primary/5 p-6">
                <p className="text-xs uppercase tracking-wider text-primary font-semibold">
                  Dopo (RMS attivo)
                </p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">RevPAR medio</dt>
                    <dd className="font-mono font-semibold">€102 (+14,6%)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">ADR medio</dt>
                    <dd className="font-mono font-semibold">€146 (+6,5%)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Occupancy</dt>
                    <dd className="font-mono font-semibold">70% (+5pp)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Ore-uomo / mese pricing</dt>
                    <dd className="font-mono font-semibold">~3h (-90%)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Variazioni prezzo / mese</dt>
                    <dd className="font-mono font-semibold">~140 (autopilot)</dd>
                  </div>
                </dl>
              </div>
            </div>

            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Il dettaglio interessante non è il +14,6% di RevPAR (in linea con la letteratura, +6-15% è la
              forbice tipica), ma le 27 ore-uomo restituite ogni mese al revenue manager, che ora lavora
              sulla strategia di posizionamento invece che sulla manutenzione delle tariffe.
              Considerando un costo orario interno di 30 €/h, sono 810 € di costo opportunità recuperati,
              ai quali si aggiungono i 13 € medi di RevPAR × 24 camere × 30 giorni ={" "}
              <strong className="text-foreground">9.360 € di revenue incrementale al mese</strong>. Il
              software si ripaga in meno di un mese.
            </p>
          </section>

          {/* 7. Perché Santaddeo */}
          <section id="perche-santaddeo" className="mt-16 scroll-mt-20">
            <h2 className="text-3xl font-bold tracking-tight">Perché Santaddeo è diverso</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Diciamolo subito: non siamo l&apos;RMS per tutti. Santaddeo è progettato per
              l&apos;<strong className="text-foreground">hotel italiano indipendente o boutique</strong>{" "}
              fra le 5 e le 50 camere. Cosa ci rende diversi dagli altri:
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-card p-6">
                <Zap className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Algoritmo K-driven trasparente</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Ogni prezzo consigliato è scomposto nei coefficienti che lo hanno generato (occupancy,
                  pickup, eventi, competitor, lead time). Niente AI generativa, niente magia. Solo
                  matematica ispezionabile riga per riga.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <Shield className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Santaddeo Guard</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Una linea di difesa che blocca automaticamente prezzi anomali (errori di tariffa, refusi,
                  override sospetti) prima che vadano sul Channel Manager. Salva la reputazione e i ricavi.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <Sparkles className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Autopilot con notifica</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Due modalità: in &quot;notify&quot; ricevi via email il digest delle variazioni
                  consigliate e decidi tu; in &quot;autopilot&quot; il push al PMS avviene automaticamente
                  con email di conferma post-push.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <TrendingUp className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold">Costruito sul mercato italiano</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Calendario eventi italiano pre-popolato, integrazione nativa con Scidoo PMS, fatturazione
                  italiana, supporto in italiano via WhatsApp e telefono. Nessun call center estero.
                </p>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="mt-16 scroll-mt-20">
            <h2 className="text-3xl font-bold tracking-tight">Domande frequenti</h2>
            <div className="mt-8 space-y-6">
              {faqLd.mainEntity.map((qa, i) => (
                <div key={i} className="rounded-xl border bg-card p-6">
                  <h3 className="font-semibold text-lg">{qa.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {qa.acceptedAnswer.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Conclusione */}
          <section className="mt-16">
            <h2 className="text-3xl font-bold tracking-tight">In sintesi</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Un software di revenue management non è un lusso da catena: è uno strumento di base anche per
              un hotel da 10 camere, perché restituisce ore-uomo e produce un incremento misurabile del
              RevPAR. La domanda non è più &quot;mi serve un RMS?&quot; ma &quot;quale RMS scegliere?&quot;.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Se gestisci un hotel indipendente o boutique in Italia, partire con una prova gratuita è il
              modo più rapido per capire se la matematica funziona davvero sulla tua specifica struttura.
              Bastano 5 minuti per collegare il PMS, e da quel momento vedi i tuoi numeri reali, non quelli
              di un caso studio generico.
            </p>
          </section>
        </article>

        {/* Final CTA */}
        <section className="border-t bg-muted/30">
          <div className="container mx-auto px-6 py-16 max-w-4xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">
              Pronto a vedere il tuo RevPAR salire?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
              Collega il tuo PMS, ricevi la dashboard gratis e attiva Santaddeo Guard per proteggerti da
              errori di tariffa già dal primo giorno.
            </p>
            <div className="mt-8 flex justify-center">
              <HeroCTA />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Nessuna carta di credito richiesta. Setup in 5 minuti. Supporto in italiano.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
