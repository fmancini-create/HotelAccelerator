/**
 * Blog index — elenco di tutti i 25 articoli SEO raggruppati per cluster.
 *
 * Architettura:
 * - Server Component statico (niente dati dinamici, niente DB)
 * - Riusa Header/Footer esistenti, nessun design nuovo
 * - JSON-LD CollectionPage per indicare a Google che e' un indice
 * - Canonical, OG, Twitter dedicati
 *
 * Conformita' al task:
 * - Niente modifiche a componenti esistenti
 * - Solo lettura del registry statico in lib/blog
 * - Sezioni cluster nell'ordine canonico, una per pillar topic
 */
import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import {
  ALL_ARTICLES,
  CLUSTER_LABELS,
  CLUSTERS_ORDER,
  getArticlesByCluster,
} from "@/lib/blog"

const PAGE_URL = "https://www.santaddeo.com/blog"

export const metadata: Metadata = {
  title: "Blog Revenue Management Hotel | Guide pratiche e KPI | SANTADDEO",
  // SEO 06/05/2026: description 196→138ch
  description:
    "Guide e analisi su Revenue Management, pricing dinamico, KPI (ADR, RevPAR), OTA. Articoli pratici per hotel, B&B, agriturismi, campeggi.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Blog Revenue Management Hotel | SANTADDEO",
    description:
      "Guide pratiche su Revenue Management, pricing dinamico, KPI, OTA e channel manager per strutture ricettive indipendenti.",
    url: PAGE_URL,
    type: "website",
    locale: "it_IT",
    siteName: "SANTADDEO",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog Revenue Management Hotel | SANTADDEO",
    description: "Guide pratiche per hotel indipendenti, B&B, agriturismi, campeggi.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

function buildJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${PAGE_URL}#collection`,
        name: "Blog Revenue Management Hotel",
        description:
          "Raccolta di guide pratiche su Revenue Management, pricing dinamico, KPI hoteliers, OTA, channel manager per strutture ricettive indipendenti.",
        inLanguage: "it-IT",
        isPartOf: { "@id": "https://www.santaddeo.com/#website" },
        publisher: { "@id": "https://www.santaddeo.com/#organization" },
        mainEntityOfPage: { "@type": "WebPage", "@id": PAGE_URL },
        hasPart: ALL_ARTICLES.map((a) => ({
          "@type": "Article",
          headline: a.title,
          description: a.description,
          url: `https://www.santaddeo.com/blog/${a.slug}`,
          datePublished: a.publishedAt,
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${PAGE_URL}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://www.santaddeo.com" },
          { "@type": "ListItem", position: 2, name: "Blog" },
        ],
      },
    ],
  }
}

export default function BlogIndexPage() {
  const jsonLd = buildJsonLd()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main className="bg-background">
        {/* Hero / intro */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-4xl px-6 py-16 md:py-20">
            <p className="text-sm font-medium text-muted-foreground mb-4">
              Risorse SANTADDEO
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground text-balance leading-tight">
              Guide pratiche di Revenue Management per hotel indipendenti
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed text-pretty">
              Articoli pratici su pricing dinamico, KPI, strategia OTA e channel
              manager. Scritti per chi gestisce davvero una struttura ricettiva:
              hotel indipendenti, B&amp;B di alto livello, agriturismi, campeggi
              e piccoli gruppi.
            </p>
          </div>
        </section>

        {/* Cluster sections */}
        <section className="mx-auto max-w-4xl px-6 py-12 md:py-16">
          <div className="space-y-16">
            {CLUSTERS_ORDER.map((cluster) => {
              const articles = getArticlesByCluster(cluster)
              if (articles.length === 0) return null

              return (
                <div key={cluster}>
                  <header className="mb-8">
                    <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                      {CLUSTER_LABELS[cluster]}
                    </h2>
                  </header>

                  <ul className="space-y-6 border-l border-border pl-6">
                    {articles.map((a) => (
                      <li key={a.slug}>
                        <article>
                          <Link href={`/blog/${a.slug}`} className="group block">
                            <h3 className="text-lg md:text-xl font-semibold text-foreground group-hover:text-primary transition-colors text-balance">
                              {a.title}
                            </h3>
                            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                              {a.description}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {a.readingMinutes} min di lettura
                            </p>
                          </Link>
                        </article>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>

        {/* Soft CTA / bridge */}
        <section className="border-t border-border bg-muted/30">
          <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Vuoi vedere SANTADDEO al lavoro sulla tua struttura?
            </h2>
            <p className="mt-3 text-muted-foreground leading-relaxed text-pretty">
              Le guide spiegano la teoria. La piattaforma applica la pratica:
              dashboard gratuita, prove sul tuo storico reale, pricing
              automatizzato in modalita' notify o autopilot.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/landing/dashboard-gratuita"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Prova la dashboard gratuita
              </Link>
              <Link
                href="/seo/cos-e-revenue-management"
                className="inline-flex items-center rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cos'e' il Revenue Management
              </Link>
              <Link
                href="/seo/faq-santaddeo"
                className="inline-flex items-center rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                FAQ piattaforma
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
