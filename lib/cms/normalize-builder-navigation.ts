import type { CMSBuilderDocument } from "@/lib/cms/builder-document"

/**
 * Keeps navigation labels aligned with page titles and removes links to pages
 * that no longer exist. Missing navigation entries are intentionally not added:
 * absence means the tenant chose to hide that page from the menu.
 */
export function normalizeBuilderNavigation(document: CMSBuilderDocument): CMSBuilderDocument {
  const pagesBySlug = new Map(document.pages.map((page) => [page.slug, page]))
  const seen = new Set<string>()

  const navigation = [...document.navigation]
    .sort((a, b) => a.order - b.order)
    .filter((item) => {
      if (!pagesBySlug.has(item.href) || seen.has(item.href)) return false
      seen.add(item.href)
      return true
    })
    .map((item, order) => ({
      ...item,
      label: pagesBySlug.get(item.href)?.title || item.label,
      order,
    }))

  return { ...document, navigation }
}
