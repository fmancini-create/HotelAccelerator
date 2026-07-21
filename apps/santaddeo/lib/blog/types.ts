// Tipi del sistema blog SEO Santaddeo.
// File additivo, niente dipendenze a roba esistente.
// Nessuna interazione con DB/API: tutto data statico.

export type ClusterKey = "rms" | "pricing" | "kpi" | "ota" | "strategia" | "longtail"

export type Block =
  // Paragrafo standard
  | { type: "p"; text: string }
  // Sezione (H2). Niente piu' di un H1 nell'articolo (e' il title).
  | { type: "h2"; text: string }
  // Sotto-sezione (H3) dentro un H2
  | { type: "h3"; text: string }
  // Lista non ordinata
  | { type: "ul"; items: string[] }
  // Lista ordinata
  | { type: "ol"; items: string[] }
  // Citazione/highlight
  | { type: "quote"; text: string; cite?: string }
  // CTA soft verso landing prodotto. Renderizzata come box visibile.
  | { type: "cta"; text: string; href: string; label: string }

export interface BlogArticle {
  /** Slug URL-safe, usato in /blog/[slug] */
  slug: string
  /** H1 + <title> (tag Title), max ~60 caratteri ideale */
  title: string
  /** Meta description, ideale 140-160 caratteri */
  description: string
  /** Keyword principale + 2-4 secondarie */
  keywords: string[]
  /** Cluster tematico per il related grouping */
  cluster: ClusterKey
  /** Data ISO YYYY-MM-DD. Usata per article:published_time e sort */
  publishedAt: string
  /** Stima minuti di lettura. Calcolata su ~200 parole/min */
  readingMinutes: number
  /** Slug di altri 3 articoli correlati (per internal linking) */
  relatedSlugs: string[]
  /** Sommario testuale 1-2 frasi mostrato sopra il body */
  lead: string
  /** Corpo strutturato dell'articolo */
  body: Block[]
  /**
   * Title tag SEO opzionale. Se assente si usa `title` (retrocompat).
   * Serve a differenziare il <title> (ottimizzato keyword) dall'H1 leggibile.
   */
  seoTitle?: string
  /**
   * FAQ opzionali. Se presenti, la pagina [slug] emette lo schema JSON-LD
   * FAQPage E renderizza una sezione "Domande frequenti" visibile.
   * Prop CORRETTA: `faqs` (plurale). Vuoto/assente = nessuna FAQ.
   */
  faqs?: { q: string; a: string }[]
}

export const CLUSTER_LABELS: Record<ClusterKey, string> = {
  rms: "Revenue Management System",
  pricing: "Pricing dinamico",
  kpi: "KPI hotel",
  ota: "OTA & disintermediazione",
  strategia: "Strategia",
  longtail: "Software & strumenti",
}
