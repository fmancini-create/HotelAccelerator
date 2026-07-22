import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Check, TrendingUp, Heart, Leaf, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList, buildFAQPage } from "@/components/seo/json-ld"

// FAQ landing agriturismi: query target "revenue management agriturismi" (pos ~11).
// Le stesse Q&A sono renderizzate visibilmente sotto (requisito Google per FAQPage).
const AGRITURISMI_FAQS = [
  {
    q: "Cos'e' il revenue management per agriturismi?",
    a: "Il revenue management per agriturismi e' la gestione dinamica delle tariffe: significa adeguare il prezzo delle camere giorno per giorno in base a domanda, stagionalita', eventi locali e occupazione, invece di usare un listino fisso. Per un agriturismo vuol dire alzare i prezzi nei periodi di alta richiesta e stimolare le prenotazioni nei periodi deboli, aumentando il fatturato senza aumentare i costi.",
  },
  {
    q: "Come aumentare i ricavi di un agriturismo?",
    a: "Il modo piu' efficace, a parita' di camere e di marketing, e' prezzare meglio: alzare le tariffe nei periodi di alta domanda ed evitare camere invendute in quelli deboli, ottimizzando insieme occupazione e ADR. A questo si aggiunge la disintermediazione dalle OTA (piu' prenotazioni dirette = meno commissioni). Sugli agriturismi tra 5 e 25 camere in Toscana e Centro Italia l'incremento medio documentato con il revenue management e' del 15-20% di fatturato nel primo anno.",
  },
  {
    q: "Quanto contano la stagionalita' e gli eventi locali per un agriturismo?",
    a: "Moltissimo, ed e' proprio dove il revenue management rende di piu'. Gli algoritmi riconoscono i pattern tipici delle strutture rurali (weekend, ponti, vendemmia, sagre ed eventi enogastronomici, alta e bassa stagione) e propongono prezzi coerenti con la domanda reale della tua zona, non con medie generiche pensate per gli hotel di citta'.",
  },
  {
    q: "Perche' non basta abbassare i prezzi per riempire l'agriturismo?",
    a: "Perche' abbassare i prezzi erode l'ADR e spesso non aumenta davvero l'occupazione: nei periodi gia' deboli attira solo clienti sensibili al prezzo, mentre nei periodi di domanda alta regali margine che avresti incassato comunque. Il revenue management fa l'opposto: sale quando puo' e scende in modo mirato solo dove serve, massimizzando il RevPAR invece del semplice tasso di riempimento.",
  },
  {
    q: "Come aiuta SANTADDEO un agriturismo?",
    a: "SANTADDEO e' un software di revenue management pensato per le piccole strutture: colleghi il PMS con una procedura guidata e ottieni subito dashboard KPI (occupazione, ADR, RevPAR), tariffe consigliate giorno per giorno con la motivazione in italiano, confronto con strutture simili e alert quando rischi di vendere troppo basso o lasciare camere vuote. Con l'AutoPilot i prezzi si aggiornano anche in automatico. Il setup richiede circa 15 minuti e non serve carta di credito.",
  },
]

export const metadata: Metadata = {
  // SEO 06/05/2026: title 73→52ch (rimosso "- Software Italiano", ridondante con SANTADDEO)
  title: "Revenue Management per Agriturismi e B&B | SANTADDEO",
  description: "Software italiano di Revenue Management per agriturismi, B&B e piccole strutture ricettive. Pricing dinamico semplice. Dashboard gratuita.",
  alternates: { canonical: "https://www.santaddeo.com/landing/agriturismi" },
  robots: { index: true, follow: true },
  keywords: ["revenue management agriturismi", "software prezzi B&B", "gestionale tariffe agriturismo", "pricing dinamico agriturismo", "RMS piccole strutture"],
  openGraph: {
    title: "Revenue Management per Agriturismi e B&B | SANTADDEO",
    description: "Software italiano di pricing dinamico per piccole strutture ricettive. Dashboard gratuita.",
    url: "https://www.santaddeo.com/landing/agriturismi",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Revenue Management per Agriturismi | SANTADDEO",
    description: "Software italiano di pricing dinamico per agriturismi e B&B.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function AgriturismiLandingPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <JsonLd data={buildBreadcrumbList([{"name":"Agriturismi","path":"/landing/agriturismi"}])} id="ld-breadcrumb" />
      <JsonLd data={buildFAQPage(AGRITURISMI_FAQS)} id="ld-faq" />
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            <img src="/logo-santaddeo.png" alt="SANTADDEO" width={140} height={42} />
          </Link>
          <Link href="/auth/sign-up">
            <Button>Inizia Gratis</Button>
          </Link>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-stone-50 to-emerald-50 py-20 md:py-28">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900">
                <Leaf className="h-4 w-4" />
                Pensato per agriturismi e B&B italiani
              </div>

              <h1 className="mb-6 text-5xl font-bold tracking-tight text-stone-900 md:text-7xl text-balance font-serif">
                Il tuo agriturismo merita
                <br />
                <span className="text-emerald-700">prezzi giusti.</span>
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-xl text-stone-600 md:text-2xl leading-relaxed">
                Smetti di scegliere tariffe a sentimento. Il primo software di
                <strong className="text-stone-900"> revenue management per agriturismi</strong>, B&B e piccole
                strutture ricettive italiane: prezzi dinamici per aumentare i ricavi senza aumentare i costi.
              </p>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/auth/sign-up">
                  <Button size="lg" className="h-14 gap-2 rounded-full bg-emerald-700 px-8 text-lg font-semibold hover:bg-emerald-800">
                    Prova Gratis
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/request-info">
                  <Button size="lg" variant="outline" className="h-14 gap-2 rounded-full border-stone-300 bg-white px-8 text-lg text-stone-700 hover:bg-stone-50">
                    Parla con noi
                  </Button>
                </Link>
              </div>

              <p className="mt-8 text-sm text-stone-500">
                Nessuna carta di credito. Setup in 15 minuti. Supporto in italiano.
              </p>
            </div>
          </div>
        </section>

        {/* INTRO SEO: H2 con keyword esatta "revenue management per agriturismi" */}
        <section className="py-20 bg-stone-50">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 text-4xl font-bold text-stone-900 text-balance font-serif">
                Revenue management per agriturismi
              </h2>
              <div className="space-y-5 text-lg text-stone-600 leading-relaxed">
                <p>
                  Il <strong className="text-stone-900">revenue management per agriturismi</strong> e' la gestione
                  con <strong className="text-stone-900">prezzi dinamici per agriturismi</strong>: adeguare il prezzo
                  delle camere giorno per giorno in base a domanda, stagionalita' ed eventi locali, invece di affidarsi
                  a un listino fisso deciso a inizio anno. Per una struttura rurale significa alzare i prezzi quando la
                  richiesta e' alta e stimolare le prenotazioni nei periodi deboli: e' cosi che si arriva ad
                  <strong className="text-stone-900"> aumentare i ricavi dell'agriturismo</strong> senza aumentare i costi.
                </p>
                <p>
                  Prezzare bene incide su due leve che contano davvero: l'<strong className="text-stone-900">occupazione</strong> (quante
                  camere vendi) e l'<strong className="text-stone-900">ADR</strong>, il ricavo medio per camera venduta. Ottimizzarle
                  insieme aumenta il RevPAR. In piu', tariffe corrette e coerenti sul sito diretto favoriscono la{" "}
                  <strong className="text-stone-900">disintermediazione dalle OTA</strong>: piu' prenotazioni dirette
                  significano meno commissioni a Booking ed Expedia, quindi margine che resta in struttura.
                </p>
                <p>
                  A differenza degli hotel di citta', un agriturismo vive di stagionalita' marcata, weekend, ponti
                  ed eventi enogastronomici. SANTADDEO nasce proprio per questo: un{" "}
                  <Link href="/blog/cose-un-rms-hotel" className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800">
                    software di revenue management
                  </Link>{" "}
                  che riconosce i pattern delle piccole strutture ricettive italiane e propone tariffe consigliate
                  con la motivazione in italiano, senza bisogno di un revenue manager dedicato.
                </p>
                <p>
                  Vuoi capire le leve pratiche? Leggi come{" "}
                  <Link href="/blog/come-aumentare-adr-hotel" className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800">
                    aumentare l'ADR
                  </Link>, come funziona il{" "}
                  <Link href="/blog/pricing-dinamico-hotel" className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800">
                    pricing dinamico
                  </Link>{" "}
                  e quali strumenti servono per distribuire i prezzi (
                  <Link href="/blog/channel-manager-vs-pms-vs-rms" className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800">
                    channel manager, PMS e RMS a confronto
                  </Link>
                  ), applicati a strutture come la tua.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* WHY US */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-4xl font-bold text-stone-900 text-balance font-serif">
                  Pensato per chi vive il proprio agriturismo
                </h2>
                <p className="mx-auto max-w-2xl text-lg text-stone-600">
                  Niente complessita inutili. Solo strumenti chiari per chi gestisce 5, 10 o 20 camere
                  e non puo permettersi un revenue manager dedicato.
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-3">
                {[
                  {
                    icon: Heart,
                    title: "Semplice come deve essere",
                    desc: "Niente jargon tecnico. Dashboard chiara, tariffe consigliate, motivazioni in italiano.",
                  },
                  {
                    icon: TrendingUp,
                    title: "+15-20% di fatturato",
                    desc: "Risultati medi documentati su agriturismi tra 5 e 25 camere in Toscana e Centro Italia.",
                  },
                  {
                    icon: Leaf,
                    title: "Rispetta la stagionalita",
                    desc: "Algoritmi che riconoscono pattern unici di agriturismi e strutture rurali.",
                  },
                ].map((item, i) => (
                  <div key={i} className="rounded-3xl border border-stone-200 bg-stone-50 p-8 hover:border-emerald-300 hover:bg-white transition-all">
                    <item.icon className="mb-4 h-10 w-10 text-emerald-700" />
                    <h3 className="mb-3 text-xl font-bold text-stone-900">{item.title}</h3>
                    <p className="text-stone-600 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* PERCHE' RM: sezione SEO dedicata */}
        <section className="py-20 bg-stone-50">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 text-4xl font-bold text-stone-900 text-balance font-serif">
                Perche' un agriturismo ha bisogno di revenue management
              </h2>
              <div className="space-y-5 text-lg text-stone-600 leading-relaxed">
                <p>
                  Un agriturismo ha domanda molto piu' irregolare di un hotel di citta': weekend pieni e
                  infrasettimanali vuoti, alta stagione contro mesi morti, picchi legati a vendemmia, sagre ed
                  eventi enogastronomici della zona. Con un listino fisso stai quasi sempre sbagliando: troppo caro
                  quando la domanda e' bassa (camere vuote) e troppo economico quando e' alta (ricavi lasciati sul tavolo).
                </p>
                <p>
                  Il revenue management risolve proprio questo: allinea il prezzo alla domanda reale, giorno per
                  giorno. Il risultato e' un doppio guadagno, su <strong className="text-stone-900">occupazione</strong> e{" "}
                  <strong className="text-stone-900">ADR</strong>, che si traduce in piu' RevPAR senza dover investire
                  in nuove camere o piu' marketing.
                </p>
                <p>
                  Non serve assumere un revenue manager ne' diventare esperti di tariffe: un software dedicato alle
                  piccole strutture fa il lavoro di analisi e propone il prezzo giusto, lasciando a te la decisione
                  finale (o aggiornandolo in automatico con l'AutoPilot).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* TESTIMONIAL HIGHLIGHT */}
        <section className="bg-emerald-700 py-20 text-white">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 flex justify-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-6 w-6 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <blockquote className="mb-8 text-3xl font-medium leading-relaxed text-balance md:text-4xl font-serif italic">
                &laquo;Sono una proprietaria, non un&apos;esperta di tariffe. SANTADDEO mi dice quanto chiedere per ogni notte
                e perche. In un anno ho fatto +22% senza stressarmi.&raquo;
              </blockquote>
              <div className="text-emerald-100">
                <p className="font-semibold text-lg">Lucia T.</p>
                <p className="text-sm">Agriturismo 12 camere, Chianti</p>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES LIST */}
        <section className="py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-stone-900 text-balance font-serif">
                Tutto quello che ti serve, niente di piu
              </h2>

              <div className="space-y-4">
                {[
                  "Dashboard KPI con Occupazione, ADR e RevPAR sempre aggiornati",
                  "Tariffe consigliate giorno per giorno con motivazione in italiano",
                  "Confronto con agriturismi simili nella tua zona",
                  "Alert quando rischi di vendere troppo basso o lasciare camere vuote",
                  "Connessione PMS guidata",
                  "Report settimanale via email con risultati e suggerimenti",
                  "Modalita AutoPilot: ti aggiorniamo i prezzi in automatico",
                  "Supporto telefonico in italiano, persone vere",
                ].map((feature, i) => (
                  <div key={i} className="flex items-start gap-4 rounded-2xl bg-white border border-stone-200 p-5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Check className="h-5 w-5" />
                    </div>
                    <p className="pt-0.5 text-stone-700">{feature}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ: stesse Q&A dello schema FAQPage (coerenza richiesta da Google) */}
        <section className="py-20 bg-white" aria-labelledby="faq-heading">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl">
              <h2 id="faq-heading" className="mb-12 text-center text-4xl font-bold text-stone-900 text-balance font-serif">
                Domande frequenti sul revenue management per agriturismi
              </h2>
              <dl className="space-y-4">
                {AGRITURISMI_FAQS.map((f, i) => (
                  <div key={i} className="rounded-2xl border border-stone-200 bg-stone-50 p-6">
                    <dt className="text-lg font-bold text-stone-900">{f.q}</dt>
                    <dd className="mt-2 text-stone-600 leading-relaxed text-pretty">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-stone-900 py-20 text-white">
          <div className="container mx-auto px-6 text-center">
            <h2 className="mb-4 text-4xl font-bold md:text-5xl text-balance font-serif">
              Inizia oggi. Gratis.
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-xl text-stone-400">
              Crea il tuo account in 30 secondi. Collega il PMS. Ottieni dashboard e suggerimenti tariffari.
              Tutto gratuito, per sempre.
            </p>
            <Link href="/auth/sign-up">
              <Button size="lg" className="h-14 gap-2 rounded-full bg-emerald-500 px-10 text-lg font-bold hover:bg-emerald-600">
                Crea Account Gratis
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <p className="mt-6 text-sm text-stone-500">
              Senza carta di credito. Senza vincoli. Senza fronzoli.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
