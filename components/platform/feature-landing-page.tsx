import type { Metadata } from "next"
import type { LucideIcon } from "lucide-react"
import { ArrowRight, CheckCircle2, CircleAlert, ExternalLink } from "lucide-react"
import Link from "next/link"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
import { PlatformFooter } from "@/components/platform-footer"
import { Button } from "@/components/ui/button"

const PLATFORM_URL = "https://www.hotelaccelerator.com"
const DEMO_URL = "https://calendar.app.google/hGkuEu5M8P8CzZkd6"

export type FeatureCapability = {
  icon: LucideIcon
  title: string
  description: string
}

export type FeatureFaq = {
  question: string
  answer: string
}

export type RelatedFeature = {
  href: string
  title: string
  description: string
}

export type FeatureTextCard = {
  title: string
  description: string
}

export type FeatureContentSection = {
  title: string
  intro?: string
  paragraphs: string[]
  bullets?: string[]
}

export type FeatureLandingProps = {
  slug: string
  eyebrow: string
  icon: LucideIcon
  title: string
  intro: string
  statusLabel: string
  statusDescription: string
  benefitsTitle?: string
  benefitsIntro?: string
  benefits?: FeatureTextCard[]
  capabilitiesTitle: string
  capabilitiesIntro: string
  capabilities: FeatureCapability[]
  workflowTitle?: string
  workflowIntro?: string
  workflow?: FeatureTextCard[]
  seoSections?: FeatureContentSection[]
  availableNow: string[]
  requiresVerification: string[]
  faqs: FeatureFaq[]
  related: RelatedFeature[]
  ctaTitle: string
  ctaDescription: string
  schemaName: string
  schemaDescription: string
}

export function buildFeatureMetadata({
  slug,
  title,
  description,
  keywords,
}: {
  slug: string
  title: string
  description: string
  keywords: string[]
}): Metadata {
  const canonical = `${PLATFORM_URL}/features/${slug}`

  return {
    title: { absolute: `${title} | HotelAccelerator` },
    description,
    keywords,
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: "it_IT",
      url: canonical,
      siteName: "HotelAccelerator",
      title: `${title} | HotelAccelerator`,
      description,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: `${title} - HotelAccelerator`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | HotelAccelerator`,
      description,
      images: ["/og-image.png"],
    },
  }
}

export function FeatureLandingPage({
  slug,
  eyebrow,
  icon: PageIcon,
  title,
  intro,
  statusLabel,
  statusDescription,
  benefitsTitle,
  benefitsIntro,
  benefits = [],
  capabilitiesTitle,
  capabilitiesIntro,
  capabilities,
  workflowTitle,
  workflowIntro,
  workflow = [],
  seoSections = [],
  availableNow,
  requiresVerification,
  faqs,
  related,
  ctaTitle,
  ctaDescription,
  schemaName,
  schemaDescription,
}: FeatureLandingProps) {
  const canonical = `${PLATFORM_URL}/features/${slug}`
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: schemaName,
        description: schemaDescription,
        inLanguage: "it-IT",
        isPartOf: {
          "@type": "WebSite",
          "@id": `${PLATFORM_URL}/#website`,
          name: "HotelAccelerator",
          url: PLATFORM_URL,
        },
        about: {
          "@type": "SoftwareApplication",
          "@id": `${PLATFORM_URL}/#software`,
          name: "HotelAccelerator",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "HotelAccelerator",
            item: PLATFORM_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Funzionalità",
            item: `${PLATFORM_URL}/features`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: eyebrow,
            item: canonical,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4" aria-label="Navigazione principale">
          <Link href="/" className="flex items-center gap-2" aria-label="HotelAccelerator - Home">
            <HotelAcceleratorMark className="h-8 w-8" priority />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            <Link href="/features" className="text-sm text-muted-foreground transition hover:text-foreground">
              Funzionalità
            </Link>
            <Link href="/features/crm" className="text-sm text-muted-foreground transition hover:text-foreground">
              CRM
            </Link>
            <Link href="/features/inbox-omnicanale" className="text-sm text-muted-foreground transition hover:text-foreground">
              Inbox
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">Accedi</Link>
            </Button>
            <Button asChild size="sm">
              <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Prenota una demo</a>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <section className="px-4 pb-20 pt-32" aria-labelledby="feature-title">
          <div className="container mx-auto max-w-5xl text-center">
            <nav className="mb-6 text-sm text-muted-foreground" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-foreground">Home</Link>
              <span className="mx-2" aria-hidden="true">/</span>
              <Link href="/features" className="hover:text-foreground">Funzionalità</Link>
              <span className="mx-2" aria-hidden="true">/</span>
              <span aria-current="page">{eyebrow}</span>
            </nav>
            <div className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border border-ha-brand/20 bg-ha-brand-soft px-4 py-2 text-sm text-ha-brand-soft-foreground">
              <PageIcon className="h-4 w-4 text-ha-brand" aria-hidden="true" />
              {eyebrow}
            </div>
            <h1 id="feature-title" className="text-balance text-4xl font-black tracking-tight md:text-6xl">
              {title}
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
              {intro}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="h-14 gap-2 rounded-full px-8 text-lg font-semibold">
                <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">
                  Prenota una demo
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-full px-8 text-lg">
                <Link href="#funzioni">Scopri tutte le funzioni</Link>
              </Button>
            </div>

            <aside className="mx-auto mt-12 max-w-3xl rounded-2xl border border-ha-brand/20 bg-ha-brand-soft/50 p-5 text-left">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-ha-brand" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{statusLabel}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{statusDescription}</p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {benefits.length > 0 ? (
          <section className="border-y border-border bg-secondary/40 px-4 py-24" aria-labelledby="benefits-title">
            <div className="container mx-auto max-w-6xl">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 id="benefits-title" className="text-3xl font-bold md:text-4xl">
                  {benefitsTitle ?? `Perché ${eyebrow} è utile in hotel`}
                </h2>
                {benefitsIntro ? <p className="mt-4 text-muted-foreground">{benefitsIntro}</p> : null}
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {benefits.map((item) => (
                  <article key={item.title} className="rounded-2xl border border-border bg-card p-6">
                    <h3 className="text-xl font-semibold">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section id="funzioni" className="px-4 py-24" aria-labelledby="capabilities-title">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <h2 id="capabilities-title" className="text-3xl font-bold md:text-4xl">{capabilitiesTitle}</h2>
              <p className="mt-4 text-muted-foreground">{capabilitiesIntro}</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <article key={capability.title} className="rounded-2xl border border-border bg-card p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ha-brand-soft">
                    <capability.icon className="h-6 w-6 text-ha-brand" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-semibold">{capability.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{capability.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {workflow.length > 0 ? (
          <section className="border-y border-border bg-secondary/40 px-4 py-24" aria-labelledby="workflow-title">
            <div className="container mx-auto max-w-5xl">
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <h2 id="workflow-title" className="text-3xl font-bold md:text-4xl">
                  {workflowTitle ?? `Come funziona ${eyebrow}`}
                </h2>
                {workflowIntro ? <p className="mt-4 text-muted-foreground">{workflowIntro}</p> : null}
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {workflow.map((step, index) => (
                  <article key={step.title} className="rounded-2xl border border-border bg-card p-6">
                    <span className="text-sm font-bold text-ha-brand">{String(index + 1).padStart(2, "0")}</span>
                    <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {seoSections.length > 0 ? (
          <section className="px-4 py-24" aria-labelledby="deep-dive-title">
            <div className="container mx-auto max-w-5xl">
              <h2 id="deep-dive-title" className="text-center text-3xl font-bold md:text-4xl">
                Come si inserisce nel lavoro quotidiano dell'hotel
              </h2>
              <div className="mt-12 space-y-8">
                {seoSections.map((section) => (
                  <article key={section.title} className="rounded-3xl border border-border bg-card p-7 md:p-9">
                    <h3 className="text-2xl font-semibold">{section.title}</h3>
                    {section.intro ? <p className="mt-3 text-base leading-relaxed text-muted-foreground">{section.intro}</p> : null}
                    <div className="mt-5 space-y-4 text-base leading-7 text-muted-foreground">
                      {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    </div>
                    {section.bullets?.length ? (
                      <ul className="mt-6 grid gap-3 md:grid-cols-2">
                        {section.bullets.map((item) => (
                          <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-ha-brand" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="border-y border-border bg-secondary/40 px-4 py-24" aria-labelledby="availability-title">
          <div className="container mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <h2 id="availability-title" className="text-3xl font-bold md:text-4xl">Disponibilità dichiarata con chiarezza</h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Le funzioni vengono attivate in base al tenant, ai permessi e alle integrazioni realmente configurate.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <article className="rounded-2xl border border-border bg-card p-6">
                <h3 className="flex items-center gap-2 text-xl font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-ha-brand" aria-hidden="true" />
                  Presente nel prodotto
                </h3>
                <ul className="mt-5 space-y-3">
                  {availableNow.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-ha-brand" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
              <article className="rounded-2xl border border-border bg-secondary/40 p-6">
                <h3 className="flex items-center gap-2 text-xl font-semibold">
                  <CircleAlert className="h-5 w-5 text-amber-500" aria-hidden="true" />
                  Da verificare in onboarding
                </h3>
                <ul className="mt-5 space-y-3">
                  {requiresVerification.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <CircleAlert className="mt-0.5 h-4 w-4 flex-none text-amber-500" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="px-4 py-24" aria-labelledby="faq-title">
          <div className="container mx-auto max-w-3xl">
            <h2 id="faq-title" className="text-center text-3xl font-bold md:text-4xl">Domande frequenti</h2>
            <div className="mt-10 space-y-4">
              {faqs.map((faq) => (
                <details key={faq.question} className="group rounded-2xl border border-border bg-card p-5">
                  <summary className="cursor-pointer list-none pr-6 font-semibold">{faq.question}</summary>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/40 px-4 py-24" aria-labelledby="related-title">
          <div className="container mx-auto max-w-5xl">
            <h2 id="related-title" className="text-center text-3xl font-bold">Funzionalità collegate</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {related.map((item) => (
                <Link key={item.href} href={item.href} className="group rounded-2xl border border-border bg-card p-6 transition hover:border-ha-brand/40">
                  <article>
                    <h3 className="flex items-center justify-between text-xl font-semibold">
                      {item.title}
                      <ExternalLink className="h-4 w-4 text-muted-foreground transition group-hover:text-ha-brand" aria-hidden="true" />
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                  </article>
                </Link>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/features" className="text-sm font-medium text-ha-brand hover:underline">Vedi tutte le funzionalità di HotelAccelerator</Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-24" aria-labelledby="feature-cta-title">
          <div className="container mx-auto max-w-3xl rounded-3xl border border-ha-brand/20 bg-ha-brand-soft/50 p-8 text-center md:p-12">
            <h2 id="feature-cta-title" className="text-2xl font-bold md:text-3xl">{ctaTitle}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{ctaDescription}</p>
            <Button asChild size="lg" className="mt-8 h-14 gap-2 rounded-full px-8 text-lg font-semibold">
              <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">
                Prenota una demo
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </section>
      </main>

      <PlatformFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </div>
  )
}
