import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron-auth"

/**
 * Cron giornaliero "Parlano di noi".
 *
 * Cerca online le notizie che citano SANTADDEO o 4 Bid srl da PIÙ fonti
 * pubbliche (nessuna API key, link REALI e verificabili) e le salva in
 * `press_mentions`. Upsert idempotente sull'URL: rilanciare il cron non crea
 * duplicati.
 *
 * Fonti:
 *  1. Google News RSS (rete ampia, ma indicizza solo una parte degli articoli).
 *  2. Feed di ricerca delle testate di settore (WordPress `?s=...&feed=rss2`),
 *     che spesso coprono la notizia PRIMA/MEGLIO di Google News. Es. GuidaViaggi
 *     e Travelnostop hanno pubblicato sul lancio ma Google News ne indicizza
 *     solo una parte. Lista facilmente estendibile: aggiungere qui altre testate.
 *
 * Pubblicazione automatica (is_visible=true) come da scelta utente.
 */

export const maxDuration = 120
export const dynamic = "force-dynamic"

// UA da browser reale: alcune testate (es. GuidaViaggi) rispondono 403 ai bot.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

// Termini di ricerca per Google News. Le virgolette forzano la frase esatta.
const QUERIES = ['"Santaddeo"', '"4Bid srl"', '"4 Bid srl"', '"4Bid" revenue management']

// Feed di ricerca delle testate (WordPress search RSS). `source` esplicito
// perché questi feed non riportano il tag <source>. Per aggiungere una testata
// che cita SANTADDEO basta una riga qui.
const PUBLICATION_FEEDS: Array<{ source: string; url: string }> = [
  { source: "GuidaViaggi", url: "https://www.guidaviaggi.it/?s=santaddeo&feed=rss2" },
  { source: "Travelnostop", url: "https://www.travelnostop.com/?s=santaddeo&feed=rss2" },
  { source: "GuidaViaggi", url: "https://www.guidaviaggi.it/?s=4+bid&feed=rss2" },
  { source: "Travelnostop", url: "https://www.travelnostop.com/?s=4+bid&feed=rss2" },
]

// Menzioni CURATE manualmente. Servono per fonti che NON espongono un feed RSS
// o che bloccano i bot (es. Capterra dietro Cloudflare, post/share su Facebook):
// non possono essere recuperate in automatico, quindi le elenchiamo qui con il
// loro URL REALE. Vengono unite alle menzioni automatiche e reinserite ad ogni
// run (upsert idempotente sull'URL), così non si perdono mai.
// NB: usare SEMPRE URL reali e verificati, mai inventati.
const MANUAL_MENTIONS: Array<{
  title: string
  url: string
  source: string
  snippet?: string
  publishedAt?: string // ISO
}> = [
  {
    title: "Santaddeo su Capterra",
    url: "https://www.capterra.com/p/10038465/Santaddeo/",
    source: "Capterra",
    snippet: "Scheda e recensioni di Santaddeo, la piattaforma di revenue management alberghiero.",
  },
  {
    title: "Santaddeo: nuova piattaforma di revenue management anti-impossibile",
    url: "https://www.facebook.com/associazioneatex/posts/santaddeo-nuova-piattaforma-di-revenue-management-anti-impossibilesantaddeo-nuov/1296573309357496/",
    source: "ATEX (Facebook)",
    snippet: "L'associazione ATEX condivide il lancio di Santaddeo.",
  },
  {
    title: "Santaddeo, nuova piattaforma di revenue management",
    url: "https://www.facebook.com/groups/ospitalitaeturismo/posts/2310577156143855/",
    source: "Ospitalità e Turismo (Facebook)",
    snippet: "Condivisione nel gruppo Ospitalità e Turismo.",
  },
]

// Filtro di pertinenza: Google News è fuzzy e restituisce anche notizie NON
// pertinenti (es. "San Taddeo" festa religiosa, articoli a caso). Pubblicando
// in automatico, teniamo SOLO le notizie che citano davvero il brand nel
// titolo o nell'estratto. NB: "santaddeo" attaccato (non "san taddeo").
function isRelevant(title: string, snippet: string | null): boolean {
  const hay = `${title} ${snippet ?? ""}`.toLowerCase()
  return hay.includes("santaddeo") || hay.includes("4bid") || hay.includes("4 bid")
}

interface ParsedItem {
  title: string
  url: string
  source: string | null
  snippet: string | null
  publishedAt: string | null
}

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    // Entità numeriche decimali (es. &#8216; &#8217; virgolette tipografiche).
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    // Entità numeriche esadecimali (es. &#x2019;).
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "") // strip eventuali tag residui (description HTML)
    .trim()
}

function extractTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))
  return m ? decodeEntities(m[1]) : null
}

function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = []
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? []
  for (const block of blocks) {
    const rawTitle = extractTag(block, "title")
    const link = extractTag(block, "link")
    if (!rawTitle || !link) continue
    // Google News mette il titolo come "Titolo - Fonte"; separiamo la fonte.
    const source = extractTag(block, "source")
    let title = rawTitle
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim()
    }
    const pub = extractTag(block, "pubDate")
    let publishedAt: string | null = null
    if (pub) {
      const d = new Date(pub)
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString()
    }
    const snippet = extractTag(block, "description")
    items.push({ title, url: link, source, snippet, publishedAt })
  }
  return items
}

async function fetchQuery(query: string): Promise<ParsedItem[]> {
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=it&gl=IT&ceid=IT:it`
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "it-IT,it;q=0.9" },
    cache: "no-store",
  })
  if (!res.ok) {
    console.error(`[cron/press-mentions] google news fetch failed for "${query}": ${res.status}`)
    return []
  }
  const xml = await res.text()
  return parseRss(xml).map((it) => ({ ...it, query }))
}

// Legge un feed di ricerca di una testata. I link sono già canonici (no
// redirect) e la fonte è quella dichiarata nella config.
async function fetchPublicationFeed(feed: { source: string; url: string }): Promise<ParsedItem[]> {
  const res = await fetch(feed.url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/rss+xml,application/xml,text/xml,*/*",
      "Accept-Language": "it-IT,it;q=0.9",
    },
    cache: "no-store",
  })
  if (!res.ok) {
    console.error(`[cron/press-mentions] ${feed.source} feed failed: ${res.status}`)
    return []
  }
  const xml = await res.text()
  return parseRss(xml).map((it) => ({ ...it, source: it.source ?? feed.source }))
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const started = Date.now()
  const supabase = await createServiceRoleClient()

  // Raccogli e deduplica fra tutte le fonti.
  //  - dedup per URL (stesso link esatto)
  //  - dedup per TITOLO normalizzato: lo stesso articolo arriva sia dal feed
  //    diretto della testata sia dal redirect di Google News
  //    (`news.google.com/rss/articles/...`). Preferiamo SEMPRE il link diretto,
  //    più pulito e stabile.
  const byUrl = new Map<string, ParsedItem & { query?: string }>()
  const byTitle = new Map<string, string>() // titolo normalizzato -> url scelto
  const isGoogleNews = (url: string) => url.includes("news.google.com")
  const normTitle = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()

  const addItem = (it: ParsedItem & { query?: string }) => {
    if (!isRelevant(it.title, it.snippet)) return
    if (byUrl.has(it.url)) return
    const key = normTitle(it.title)
    const existingUrl = byTitle.get(key)
    if (existingUrl) {
      // Stesso articolo già presente: sostituisci solo se il nuovo link è
      // diretto e quello esistente è un redirect Google News.
      if (isGoogleNews(existingUrl) && !isGoogleNews(it.url)) {
        byUrl.delete(existingUrl)
        byUrl.set(it.url, it)
        byTitle.set(key, it.url)
      }
      return
    }
    byUrl.set(it.url, it)
    byTitle.set(key, it.url)
  }

  // Fonte 0: menzioni curate manualmente (già verificate). Inserite per prime
  // così hanno priorità nella dedup per titolo; saltano il filtro di pertinenza.
  for (const m of MANUAL_MENTIONS) {
    const key = normTitle(m.title)
    byUrl.set(m.url, {
      title: m.title,
      url: m.url,
      source: m.source,
      snippet: m.snippet ?? null,
      publishedAt: m.publishedAt ?? null,
      query: "manual",
    })
    byTitle.set(key, m.url)
  }

  // Fonte 1: feed di ricerca delle testate (link DIRETTI, preferiti).
  for (const feed of PUBLICATION_FEEDS) {
    try {
      for (const it of await fetchPublicationFeed(feed)) addItem({ ...it, query: `feed:${feed.source}` })
    } catch (err) {
      console.error(`[cron/press-mentions] ${feed.source} feed error:`, err instanceof Error ? err.message : err)
    }
  }

  // Fonte 2: Google News RSS (rete ampia, riempie ciò che le testate non coprono).
  for (const q of QUERIES) {
    try {
      for (const it of await fetchQuery(q)) addItem(it as ParsedItem & { query: string })
    } catch (err) {
      console.error(`[cron/press-mentions] google news error for "${q}":`, err instanceof Error ? err.message : err)
    }
  }

  const rows = Array.from(byUrl.values()).map((it) => ({
    title: it.title,
    url: it.url,
    source: it.source,
    snippet: it.snippet,
    query_term: it.query,
    published_at: it.publishedAt,
    is_visible: true,
  }))

  let upserted = 0
  if (rows.length > 0) {
    // onConflict url -> idempotente. ignoreDuplicates: non sovrascrive le
    // righe esistenti (preserva eventuali modifiche manuali di visibilità).
    const { error, count } = await supabase
      .from("press_mentions")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true, count: "exact" })
    if (error) {
      console.error("[cron/press-mentions] upsert error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    upserted = count ?? 0
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    sources: { googleNews: QUERIES, publicationFeeds: PUBLICATION_FEEDS.map((f) => f.source) },
    found: rows.length,
    inserted: upserted,
  })
}
