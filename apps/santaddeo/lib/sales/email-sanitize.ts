/**
 * Sanitizzazione leggera dell'HTML prodotto dall'editor rich-text del
 * compositore email (grassetto, corsivo, sottolineato, elenchi, link, a-capo).
 *
 * Niente dipendenze esterne: usiamo una whitelist molto stretta di tag e
 * attributi. Tutto cio' che non e' esplicitamente consentito viene rimosso.
 * L'obiettivo e' evitare iniezione di <script>, handler on*, iframe, stili
 * arbitrari ecc., mantenendo solo formattazione di base.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "span",
  "div",
  "h3",
  "h4",
])

/**
 * Ripulisce l'HTML mantenendo solo i tag/attributi consentiti.
 * Implementazione basata su regex (sufficiente per l'output controllato del
 * nostro editor): rimuove script/style, normalizza i tag non ammessi e filtra
 * gli attributi tenendo solo href (http/https/mailto) sui link.
 */
export function sanitizeEmailHtml(input: string): string {
  if (!input) return ""
  let html = input

  // Rimuove blocchi pericolosi per intero.
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\/\s*\1\s*>/gi, "")
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, "")
  // Rimuove eventuali commenti.
  html = html.replace(/<!--[\s\S]*?-->/g, "")

  // Processa ogni tag: tiene solo quelli in whitelist, filtra gli attributi.
  html = html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ""
    const isClosing = match.startsWith("</")
    if (isClosing) return `</${tag}>`

    // Per i link, conserva solo href sicuro + target/rel.
    if (tag === "a") {
      const hrefMatch = rawAttrs.match(/href\s*=\s*("([^"]*)"|'([^']*)')/i)
      const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim()
      if (/^(https?:|mailto:)/i.test(href)) {
        const safeHref = href.replace(/"/g, "&quot;")
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">`
      }
      return "<a>"
    }

    // Tutti gli altri tag consentiti: nessun attributo.
    return `<${tag}>`
  })

  return html.trim()
}

/** Converte HTML in testo semplice leggibile (per body_text / preheader). */
export function emailHtmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
