/**
 * Conversione testo semplice <-> HTML per le email dei venditori.
 *
 * I venditori NON devono scrivere HTML a mano: l'editor mostra testo normale.
 * - I template predefiniti (in HTML) vengono convertiti in testo leggibile per
 *   la modifica con `htmlToPlainText`.
 * - Al momento dell'invio il testo viene riconvertito in HTML email-safe con
 *   `plainTextToHtml` (paragrafi, elenchi con trattino, link cliccabili).
 *
 * I placeholder `{{link_signup}}` / `{{link_dashboard_demo}}` / `{{...}}`
 * vengono mantenuti: la sostituzione con l'URL reale avviene lato server.
 */

/** Decodifica le entita' HTML piu' comuni. */
function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

/**
 * Converte l'HTML di un template in testo semplice leggibile.
 * - <a href="URL">TESTO</a>  -> "TESTO: URL" (mantiene il placeholder/URL)
 * - <li>...</li>             -> "- ..."
 * - <p>, <br>, <ul>          -> a capo
 * - ogni altro tag           -> rimosso
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ""
  let text = html

  // Link: conserva testo + destinazione cosi' il venditore vede dove punta.
  // FIX 15/07/2026: se l'etichetta E' GIA' l'URL stesso (link creato da
  // linkify), NON produrre "URL: URL" -> ogni round-trip editor<->invio
  // RADDOPPIAVA i link (caso reale: email lead con 4 link duplicati, di cui
  // 3 con ":" incollato nell'href -> 404).
  text = text.replace(
    /<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, label) => {
      const cleanLabel = label.replace(/<[^>]+>/g, "").trim()
      if (!cleanLabel) return href
      const stripPunct = (s: string) => s.replace(/[:;,.]+$/, "")
      if (stripPunct(cleanLabel) === stripPunct(href)) return stripPunct(href)
      return `${cleanLabel}: ${href}`
    },
  )

  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n\n")
    .replace(/<(ul|ol)[^>]*>/gi, "\n")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "") // tag rimanenti

  text = decodeEntities(text)

  // Sanificazione URL (15/07/2026): ripara i corpi email gia' corrotti dal
  // vecchio round-trip. (1) rimuove ":;,." incollati in coda agli URL;
  // (2) collassa lo stesso URL ripetuto consecutivamente in uno solo.
  text = text.replace(/(https?:\/\/\S+?)[:;,.]+(?=\s|$)/g, "$1")
  text = text.replace(/(https?:\/\/\S+)(?:\s+\1)+/g, "$1")

  // Alcune sorgenti (es. testo generato dall'AI) usano i caratteri bullet
  // "•/●/▪/‣/·" INLINE invece di un vero elenco <ul><li>: senza questa
  // normalizzazione resterebbe tutto un unico paragrafo compresso. Spezziamo
  // ogni bullet inline su una nuova riga con trattino, cosi' che
  // plainTextToHtml lo ricostruisca come elenco leggibile.
  text = text.replace(/[ \t]*[•●▪‣·]\s+/g, "\n- ")

  // Normalizza spazi/righe vuote.
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "")
}

/** Escape dei caratteri HTML speciali (le graffe dei placeholder restano). */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Trasforma URL e placeholder {{link_*}} in link cliccabili.
 * FIX 15/07/2026: la punteggiatura in coda (":;,.!?") NON fa piu' parte
 * dell'URL: prima "https://.../sign-up:" finiva NELL'href -> 404.
 */
function linkify(line: string): string {
  return line.replace(
    /(https?:\/\/[^\s<]+|\{\{link_[a-z_]+\}\})/g,
    (match) => {
      const trail = match.match(/[:;,.!?]+$/)?.[0] ?? ""
      const url = trail ? match.slice(0, -trail.length) : match
      return `<a href="${url}" style="color:#10b981;text-decoration:underline;">${url}</a>${trail}`
    },
  )
}

/**
 * Converte il testo semplice scritto dal venditore in HTML email-safe.
 * - righe che iniziano con "- " o "* " -> elenco puntato <ul><li>
 * - righe vuote -> separano i paragrafi
 * - URL e {{link_*}} -> link cliccabili
 */
export function plainTextToHtml(text: string): string {
  if (!text) return ""
  // Se sembra gia' HTML (vecchi dati), lascialo invariato.
  if (/<(p|div|ul|ol|li|a|br|strong|h[1-6])\b/i.test(text)) return text

  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const blocks: string[] = []
  let paragraph: string[] = []
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${linkify(escapeHtml(paragraph.join(" ")))}</p>`)
      paragraph = []
    }
  }
  const flushList = () => {
    if (listItems.length) {
      const items = listItems
        .map((li) => `<li>${linkify(escapeHtml(li))}</li>`)
        .join("")
      blocks.push(`<ul>${items}</ul>`)
      listItems = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      flushParagraph()
      // Una riga vuota chiude la lista SOLO se il prossimo contenuto non e'
      // un altro bullet (cosi' i template con righe vuote tra i <li> restano
      // un unico elenco).
      const next = lines.slice(i + 1).find((l) => l.trim() !== "")
      if (!next || !/^[-*]\s+/.test(next.trim())) {
        flushList()
      }
      continue
    }
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      flushParagraph()
      listItems.push(bullet[1])
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()

  return blocks.join("\n")
}
