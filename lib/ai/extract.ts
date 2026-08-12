import "server-only"
import { parse } from "node-html-parser"
import { MAX_SOURCE_CHARS } from "./config"

/**
 * Extract plain text from a PDF located at a URL (e.g. a Vercel Blob URL).
 * Uses unpdf, which bundles a serverless-friendly build of pdf.js.
 */
export async function extractPdfText(fileUrl: string): Promise<string> {
  const res = await fetch(fileUrl)
  if (!res.ok) throw new Error(`Impossibile scaricare il PDF (HTTP ${res.status})`)
  const buffer = new Uint8Array(await res.arrayBuffer())

  const { extractText, getDocumentProxy } = await import("unpdf")
  const pdf = await getDocumentProxy(buffer)
  const { text } = await extractText(pdf, { mergePages: true })
  const merged = Array.isArray(text) ? text.join("\n\n") : text
  return merged.slice(0, MAX_SOURCE_CHARS)
}

/**
 * Fetch a web page and extract readable text, stripping scripts, styles, nav
 * and other non-content elements. Deliberately dependency-light: good enough
 * for hotel sites (rooms, services, policies) without a full readability lib.
 */
export async function extractUrlText(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "HotelAcceleratorBot/1.0 (+knowledge-indexer)" },
    redirect: "follow",
  })
  if (!res.ok) throw new Error(`Impossibile leggere la pagina (HTTP ${res.status})`)
  const html = await res.text()

  const root = parse(html, { comment: false })
  root.querySelectorAll("script, style, noscript, svg, nav, footer, header, form, iframe").forEach((el) => el.remove())

  const title = root.querySelector("title")?.textContent?.trim() || url
  const main = root.querySelector("main") || root.querySelector("article") || root.querySelector("body") || root
  const text = main.textContent
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_SOURCE_CHARS)

  return { title, text }
}

const NON_PAGE_EXT =
  /\.(jpe?g|png|gif|webp|svg|ico|css|js|mjs|json|xml|pdf|zip|rar|gz|mp4|mp3|avi|mov|woff2?|ttf|eot|doc|docx|xls|xlsx|ppt|pptx)(\?|#|$)/i

function sameHost(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, "")
    const hb = new URL(b).hostname.replace(/^www\./, "")
    return ha === hb
  } catch {
    return false
  }
}

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    u.hash = ""
    // Drop trailing slash (except root) for dedupe stability.
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1)
    return u.toString()
  } catch {
    return null
  }
}

/** Fetch and parse <loc> entries from a sitemap (handles sitemap-index too). */
async function fetchSitemapLocs(sitemapUrl: string, depth = 0): Promise<string[]> {
  if (depth > 2) return []
  try {
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": "HotelAcceleratorBot/1.0 (+knowledge-indexer)" },
      redirect: "follow",
    })
    if (!res.ok) return []
    const xml = await res.text()
    const locs = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1].trim())
    const isIndex = /<sitemapindex[\s>]/i.test(xml)
    if (isIndex) {
      const children = locs.slice(0, 10)
      const nested = await Promise.all(children.map((c) => fetchSitemapLocs(c, depth + 1)))
      return nested.flat()
    }
    return locs
  } catch {
    return []
  }
}

/**
 * Discover the crawlable pages of a website. Strategy:
 *   1. Try sitemap.xml (and sitemap-index) at the site root — the reliable path.
 *   2. Fall back to crawling same-host links starting from the given page.
 * Returns a deduplicated, same-host, HTML-only list capped at `maxPages`.
 */
export async function discoverSiteUrls(startUrl: string, maxPages = 50): Promise<string[]> {
  const origin = new URL(startUrl).origin
  const found = new Set<string>()

  // 1. Sitemap(s).
  for (const candidate of [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]) {
    const locs = await fetchSitemapLocs(candidate)
    for (const loc of locs) {
      const n = normalizeUrl(loc, origin)
      if (n && sameHost(n, origin) && !NON_PAGE_EXT.test(n)) found.add(n)
      if (found.size >= maxPages) break
    }
    if (found.size >= maxPages) break
  }

  if (found.size > 0) return Array.from(found).slice(0, maxPages)

  // 2. Fallback: breadth-first crawl of same-host links.
  const queue: string[] = [normalizeUrl(startUrl, origin) || startUrl]
  const visited = new Set<string>()
  while (queue.length > 0 && found.size < maxPages) {
    const current = queue.shift() as string
    if (visited.has(current)) continue
    visited.add(current)
    try {
      const res = await fetch(current, {
        headers: { "User-Agent": "HotelAcceleratorBot/1.0 (+knowledge-indexer)" },
        redirect: "follow",
      })
      if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) continue
      found.add(current)
      const html = await res.text()
      const root = parse(html, { comment: false })
      for (const a of root.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href")
        if (!href) continue
        const n = normalizeUrl(href, current)
        if (n && sameHost(n, origin) && !NON_PAGE_EXT.test(n) && !visited.has(n) && !queue.includes(n)) {
          queue.push(n)
        }
      }
    } catch {
      // skip unreachable page
    }
  }

  return Array.from(found).slice(0, maxPages)
}
