/**
 * Pagina dettaglio articolo blog. Renderizzata staticamente per ogni slug
 * via generateStaticParams (build-time, zero overhead runtime).
 *
 * Architettura:
 * - Server Component, niente JS client
 * - Renderer di Block[] (struttura type-safe definita in lib/blog/types.ts).
 *   Niente parser markdown a runtime, niente librerie esterne, niente XSS.
 * - JSON-LD Article + BreadcrumbList per ogni articolo
 * - Articoli correlati (3) per internal linking
 * - Soft CTA verso landing prodotto + FAQ
 *
 * Conformita' al task:
 * - Riusa Header/Footer esistenti
 * - generateMetadata dinamico per title/description/canonical/OG per slug
 * - notFound() su slug inesistente (404 corretto, no redirect)
 */
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import {
  CLUSTER_LABELS,
  getAllSlugs,
  getArticleBySlug,
  getRelatedArticles,
} from "@/lib/blog"
import type { Block, BlogArticle } from "@/lib/blog/types"

const SITE_URL = "https://www.santaddeo.com"

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) return { title: "Articolo non trovato | Santaddeo" }

  const url = `${SITE_URL}/blog/${article.slug}`
  return {
    // seoTitle ottimizzato per il tag <title>; fallback su title (H1) per retrocompat.
    title: `${article.seoTitle ?? article.title} | Santaddeo`,
    description: article.description,
    keywords: article.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: article.title,
      description: article.description,
      url,
      type: "article",
      locale: "it_IT",
      siteName: "Santaddeo",
      publishedTime: article.publishedAt,
      modifiedTime: article.publishedAt,
      images: ["https://www.santaddeo.com/og-image.jpg"],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      images: ["https://www.santaddeo.com/og-image.jpg"],
    },
    robots: { index: true, follow: true },
  }
}

function buildJsonLd(article: BlogArticle) {
  const url = `${SITE_URL}/blog/${article.slug}`
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: article.title,
      description: article.description,
      inLanguage: "it-IT",
      datePublished: article.publishedAt,
      dateModified: article.publishedAt,
      keywords: article.keywords.join(", "),
      publisher: {
        "@type": "Organization",
        name: "Santaddeo",
        url: SITE_URL,
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        {
          "@type": "ListItem",
          position: 3,
          name: CLUSTER_LABELS[article.cluster],
          item: `${SITE_URL}/blog?cluster=${article.cluster}`,
        },
        { "@type": "ListItem", position: 4, name: article.title, item: url },
      ],
    },
  ]

  // FAQPage: emesso SOLO se l'articolo definisce faqs. Le stesse Q&A sono
  // renderizzate anche visibilmente sotto (requisito Google: il testo dello
  // schema deve essere presente nella pagina).
  if (article.faqs && article.faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: article.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    })
  }

  return { "@context": "https://schema.org", "@graph": graph }
}

/**
 * Renderer dei Block. Ogni tipo ha un mapping HTML semantico dedicato.
 * Niente innerHTML, niente parser, type-safety end-to-end.
 */
function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return (
        <p className="my-4 text-base leading-relaxed text-foreground/90 text-pretty">
          {block.text}
        </p>
      )
    case "h2":
      return (
        <h2 className="mt-12 mb-4 text-2xl md:text-3xl font-bold tracking-tight text-foreground text-balance">
          {block.text}
        </h2>
      )
    case "h3":
      return (
        <h3 className="mt-8 mb-3 text-xl font-semibold tracking-tight text-foreground">
          {block.text}
        </h3>
      )
    case "ul":
      return (
        <ul className="my-4 list-disc space-y-2 pl-6 marker:text-muted-foreground">
          {block.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed text-foreground/90">
              {item}
            </li>
          ))}
        </ul>
      )
    case "ol":
      return (
        <ol className="my-4 list-decimal space-y-2 pl-6 marker:text-muted-foreground">
          {block.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed text-foreground/90">
              {item}
            </li>
          ))}
        </ol>
      )
    case "quote":
      return (
        <blockquote className="my-6 border-l-4 border-muted-foreground/30 pl-4 italic text-foreground/80">
          <p className="leading-relaxed">{block.text}</p>
          {block.cite ? (
            <footer className="mt-2 text-sm not-italic text-muted-foreground">
              — {block.cite}
            </footer>
          ) : null}
        </blockquote>
      )
    case "cta":
      return (
        <aside
          className="my-8 rounded-lg border-l-4 border-primary bg-primary/5 px-5 py-4"
          role="note"
        >
          <p className="leading-relaxed text-foreground/90">{block.text}</p>
          <Link
            href={block.href}
            className="mt-3 inline-flex items-center text-sm font-semibold text-primary hover:underline"
          >
            {block.label} &rarr;
          </Link>
        </aside>
      )
    default:
      return null
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) notFound()

  const related = getRelatedArticles(article, 3)
  const jsonLd = buildJsonLd(article)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main className="bg-background">
        {/* Breadcrumb */}
        <div className="border-b border-border">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <ol className="flex flex-wrap items-center gap-x-2">
                <li>
                  <Link href="/" className="hover:text-foreground transition-colors">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link href="/blog" className="hover:text-foreground transition-colors">
                    Blog
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li className="text-foreground" aria-current="page">
                  {CLUSTER_LABELS[article.cluster]}
                </li>
              </ol>
            </nav>
          </div>
        </div>

        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          {/* Header */}
          <header className="mb-10 border-b border-border pb-8">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
                {CLUSTER_LABELS[article.cluster]}
              </span>
              <span className="text-muted-foreground">
                {article.readingMinutes} min di lettura
              </span>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground text-balance leading-tight">
              {article.title}
            </h1>

            <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">
              {article.lead}
            </p>

            <div className="mt-6 text-sm text-muted-foreground">
              <time dateTime={article.publishedAt}>
                Pubblicato il {formatDate(article.publishedAt)}
              </time>
            </div>
          </header>

          {/* Body */}
          <div>
            {article.body.map((block, idx) => (
              <BlockRenderer key={idx} block={block} />
            ))}
          </div>

          {/* FAQ visibili: renderizzate solo se l'articolo definisce faqs.
              Stesso contenuto dello schema FAQPage (coerenza richiesta da Google). */}
          {article.faqs && article.faqs.length > 0 ? (
            <section className="mt-16 border-t border-border pt-10" aria-labelledby="faq-heading">
              <h2
                id="faq-heading"
                className="mb-6 text-2xl md:text-3xl font-bold tracking-tight text-foreground text-balance"
              >
                Domande frequenti
              </h2>
              <dl className="space-y-6">
                {article.faqs.map((f, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-card p-5 md:p-6">
                    <dt className="text-lg font-semibold text-foreground">{f.q}</dt>
                    <dd className="mt-2 text-base leading-relaxed text-foreground/90 text-pretty">
                      {f.a}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {/* CTA in-articolo: riusa landing esistenti, niente nuove pagine */}
          <aside className="mt-16 rounded-2xl border border-border bg-primary/5 p-6 md:p-8 text-center">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground text-balance">
              Vuoi vedere come si applica al tuo hotel?
            </h2>
            <p className="mt-2 text-sm md:text-base leading-relaxed text-muted-foreground text-pretty">
              Santaddeo trasforma le tecniche raccontate in questo articolo in dashboard
              concrete e azioni automatiche, senza fogli Excel.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/landing/dashboard-gratuita"
                className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Prova la dashboard gratuita
              </Link>
              <Link
                href="/seo/faq-santaddeo"
                className="inline-flex items-center rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                FAQ piattaforma
              </Link>
            </div>
          </aside>

          {/* Articoli correlati */}
          {related.length > 0 ? (
            <section className="mt-16 border-t border-border pt-10">
              <h2 className="mb-6 text-xl font-bold tracking-tight text-foreground">
                Articoli correlati
              </h2>
              <ul className="space-y-5 border-l border-border pl-6">
                {related.map((rel) => (
                  <li key={rel.slug}>
                    <Link href={`/blog/${rel.slug}`} className="group block">
                      <p className="text-xs font-medium text-muted-foreground">
                        {CLUSTER_LABELS[rel.cluster]}
                      </p>
                      <h3 className="mt-1 text-base md:text-lg font-semibold leading-snug text-foreground group-hover:text-primary transition-colors text-balance">
                        {rel.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {rel.description}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href="/blog"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  &larr; Tutti gli articoli del blog
                </Link>
              </div>
            </section>
          ) : null}
        </article>
      </main>
      <Footer />
    </>
  )
}
