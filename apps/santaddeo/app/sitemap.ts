import type { MetadataRoute } from "next"
import { ALL_ARTICLES } from "@/lib/blog"

/**
 * Sitemap rivista 13/05/2026 dopo audit Google Search Console
 * (24 pagine "Rilevata ma non indicizzata"). Cambiamenti rispetto alla
 * versione precedente:
 *
 * 1. Rimosse /auth/login e /auth/sign-up: non sono pagine SEO, sono pagine
 *    di conversione gated. Tenerle in sitemap dilata il crawl budget senza
 *    valore informativo per Google.
 * 2. Rimossa /partner-info: era un doppione di /partner con stesso intent
 *    ("programma partner"). Ora c'e' un redirect 301 in next.config che
 *    consolida tutta l'autorita' su /partner.
 * 3. Priority piu' discriminanti: home 1.0, top landing commerciali 0.9,
 *    landing secondarie 0.8, articolo pillar 0.85, articoli blog 0.6,
 *    pagine SEO informazionali 0.6, legale 0.3. Prima quasi tutto era
 *    0.7-0.9 e Google non aveva alcun segnale di priorita'.
 * 4. Blog: l'articolo pillar "software-revenue-management-hotel-italia"
 *    resta separato dal registry ALL_ARTICLES (vive come pagina statica
 *    fuori da /lib/blog) e mantiene priority 0.85.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.santaddeo.com"

  // Blog: index + articoli SEO aggregati dinamicamente dal registry
  // statico in lib/blog per mantenere sitemap e contenuto sempre allineati.
  const blogEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...ALL_ARTICLES.map((a) => ({
      url: `${baseUrl}/blog/${a.slug}`,
      // BlogArticle ha solo `publishedAt` come fonte di data canonica.
      // Riusiamo quella per `lastModified` finche' non avremo un campo
      // separato di update.
      lastModified: new Date(a.publishedAt),
      changeFrequency: "monthly" as const,
      // Abbassata da 0.7 a 0.6: gli articoli del registry sono importanti
      // ma non quanto le landing commerciali e l'articolo pillar.
      priority: 0.6,
    })),
    {
      // Articolo pillar SEO commerciale per query
      // "software revenue management hotel italia". Vive come pagina
      // statica fuori dal registry ALL_ARTICLES, quindi va aggiunto
      // manualmente alla sitemap. Priority alta: e' linkato dalla home.
      url: `${baseUrl}/blog/software-revenue-management-hotel-italia`,
      lastModified: new Date("2026-05-03T18:00:00+02:00"),
      changeFrequency: "monthly",
      priority: 0.85,
    },
  ]

  return [
    ...blogEntries,
    // Home: priority massima
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    // Pagine prodotto principali
    {
      url: `${baseUrl}/features`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    // Landing commerciali top-priority (USP del prodotto)
    {
      url: `${baseUrl}/landing/vendita`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/landing/guard`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/landing/dashboard-gratuita`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // Landing secondarie (verticali/feature specifiche)
    {
      url: `${baseUrl}/landing/autopilot`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/landing/agriturismi`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/landing/recupera-prenotazioni`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/landing/performance-ota`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/landing/recensioni`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/landing/variabili-personalizzate`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // Pagine azienda/conversione
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/partner`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/upgrade/hotel-accelerator`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/request-info`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    // Rassegna stampa: aggiornata dal cron giornaliero
    {
      url: `${baseUrl}/parlano-di-noi`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.5,
    },
    // Pagine SEO informazionali (long-tail)
    {
      url: `${baseUrl}/seo/cos-e-revenue-management`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/seo/faq-santaddeo`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    // Pagine legali
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/termini`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ]
}
