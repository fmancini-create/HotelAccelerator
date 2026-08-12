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
