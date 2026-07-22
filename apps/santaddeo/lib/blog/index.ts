import type { BlogArticle, ClusterKey } from "./types"
import { CLUSTER_LABELS } from "./types"
import { CLUSTER_RMS } from "./articles/cluster-rms"
import { CLUSTER_PRICING } from "./articles/cluster-pricing"
import { CLUSTER_KPI } from "./articles/cluster-kpi"
import { CLUSTER_OTA } from "./articles/cluster-ota"
import { CLUSTER_DISTRIBUZIONE } from "./articles/cluster-distribuzione"

/**
 * Blog/SEO content registry. 25 articoli statici (5 cluster x 5 articoli),
 * niente DB, niente runtime. La fonte unica e' questo file.
 *
 * Architettura intenzionale: articoli sono dati TS strutturati a blocchi
 * (BlogArticle.body: Block[]), non MDX. Vantaggi: type-safety completa,
 * niente dipendenze esterne, ricerca facile in code review, parsing zero
 * a runtime.
 */
export const ALL_ARTICLES: BlogArticle[] = [
  ...CLUSTER_RMS,
  ...CLUSTER_PRICING,
  ...CLUSTER_KPI,
  ...CLUSTER_OTA,
  ...CLUSTER_DISTRIBUZIONE,
]

const ARTICLE_BY_SLUG: Record<string, BlogArticle> = ALL_ARTICLES.reduce(
  (acc, a) => {
    acc[a.slug] = a
    return acc
  },
  {} as Record<string, BlogArticle>,
)

export function getArticleBySlug(slug: string): BlogArticle | null {
  return ARTICLE_BY_SLUG[slug] ?? null
}

export function getArticlesByCluster(cluster: ClusterKey): BlogArticle[] {
  return ALL_ARTICLES.filter((a) => a.cluster === cluster)
}

export function getRelatedArticles(article: BlogArticle, limit = 3): BlogArticle[] {
  const related: BlogArticle[] = []
  for (const slug of article.relatedSlugs) {
    const found = ARTICLE_BY_SLUG[slug]
    if (found) related.push(found)
    if (related.length >= limit) break
  }
  // Fallback: se non ci sono abbastanza related dichiarati esplicitamente,
  // riempi con altri articoli dello stesso cluster (escluso quello corrente).
  if (related.length < limit) {
    const sameCluster = getArticlesByCluster(article.cluster).filter(
      (a) => a.slug !== article.slug && !related.find((r) => r.slug === a.slug),
    )
    for (const a of sameCluster) {
      related.push(a)
      if (related.length >= limit) break
    }
  }
  return related.slice(0, limit)
}

export function getAllSlugs(): string[] {
  return ALL_ARTICLES.map((a) => a.slug)
}

/** Ordine canonico dei cluster nel blog index (curato, non alfabetico) */
export const CLUSTERS_ORDER: ClusterKey[] = [
  "rms",
  "pricing",
  "kpi",
  "ota",
  "strategia",
  "longtail",
]

export { CLUSTER_LABELS }
export type { BlogArticle, ClusterKey }
