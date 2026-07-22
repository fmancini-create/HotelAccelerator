/**
 * components/seo/json-ld.tsx
 *
 * Helper centralizzato per pubblicare blocchi JSON-LD su pagine pubbliche.
 *
 * 19/05/2026: introdotto durante l'audit SEO per evitare la duplicazione del
 * pattern `<script type="application/ld+json" dangerouslySetInnerHTML=...>`
 * gia' usato a mano in /blog/[slug], /blog/software-revenue-management... e
 * /seo/*. Ora tutte le pagine usano la stessa primitiva e i builder qui
 * sotto generano BreadcrumbList e Service in modo consistente.
 *
 * NB: usiamo un componente server-only (niente "use client") per garantire
 * che lo script venga emesso lato SSR e visto subito dai crawler.
 */

const SITE_URL = "https://www.santaddeo.com"

type JsonLdProps = {
  data: Record<string, unknown> | Array<Record<string, unknown>>
  /**
   * id facoltativo del tag script: utile se in pagina ne pubblichiamo piu'
   * di uno (es. Article + BreadcrumbList + FAQPage) e vogliamo distinguerli
   * lato Search Console / Rich Results Test.
   */
  id?: string
}

export function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      id={id}
      // dangerouslySetInnerHTML e' l'unico modo per emettere il payload
      // senza che React lo escapi: i crawler devono vedere JSON puro.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

/**
 * Crumb singolo per breadcrumb: name visibile + path relativo (senza host).
 */
export type Crumb = { name: string; path: string }

/**
 * Costruisce un BreadcrumbList schema.org a partire da una lista di crumb.
 * Aggiunge automaticamente "Home" come primo elemento se non e' gia'
 * presente. I path vengono prefissati con SITE_URL.
 */
export function buildBreadcrumbList(crumbs: Crumb[]) {
  const all: Crumb[] = crumbs[0]?.path === "/" ? crumbs : [{ name: "Home", path: "/" }, ...crumbs]
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.path.startsWith("http") ? c.path : `${SITE_URL}${c.path}`,
    })),
  }
}

/**
 * Costruisce uno schema FAQPage a partire da una lista di domande/risposte.
 *
 * Usato sulle landing/pagine statiche (non-blog) dove non passiamo dal
 * renderer /blog/[slug]. Le stesse Q&A DEVONO essere renderizzate anche
 * visibilmente in pagina (requisito Google: il testo dello schema deve
 * essere presente nel contenuto).
 */
export function buildFAQPage(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }
}

type ServiceInput = {
  name: string
  description: string
  /** path relativo della landing del servizio, es. "/landing/vendita". */
  url: string
  /** sotto-funzionalita' del servizio, mostrate come hasOfferCatalog. */
  features?: string[]
  /** category schema.org del servizio: default "Hospitality Software". */
  category?: string
}

/**
 * Costruisce uno schema Service collegato al provider Santaddeo.
 *
 * Usato sulle landing prodotto (vendita, guard, autopilot) per dare a Google
 * un segnale strutturato del fatto che la pagina descrive un servizio
 * specifico, non una pagina generica del sito.
 */
export function buildService({ name, description, url, features, category = "Hospitality Software" }: ServiceInput) {
  const fullUrl = url.startsWith("http") ? url : `${SITE_URL}${url}`
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url: fullUrl,
    serviceType: category,
    provider: {
      "@type": "Organization",
      name: "Santaddeo",
      url: SITE_URL,
      logo: `${SITE_URL}/logo-santaddeo.png`,
    },
    areaServed: { "@type": "Country", name: "Italy" },
    audience: {
      "@type": "BusinessAudience",
      audienceType: "Hotel, Agriturismi, B&B, Glamping, Campeggi",
    },
  }
  if (features && features.length > 0) {
    data.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: `${name} - funzionalita'`,
      itemListElement: features.map((f) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: f },
      })),
    }
  }
  return data
}
