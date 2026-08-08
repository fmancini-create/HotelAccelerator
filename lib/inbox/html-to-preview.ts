/**
 * Turn a stored message body into the one-line preview shown in the Inbox list.
 *
 * Message bodies are stored raw, exactly as the mail arrived, so `content` is
 * usually a full HTML document. Printing it straight into the list produced
 * rows reading `<html style="color-scheme:light dark"><head><style ...`, with
 * the subject squeezed down to a single character next to it.
 *
 * The bulk of that noise is the contents of <style> and <head>, which strip-
 * the-tags alone does NOT remove: dropping `<style>` and `</style>` leaves all
 * the CSS between them behind as text. Those elements have to be removed whole,
 * before any tag stripping.
 *
 * This is for display only. It is never inserted as HTML.
 */

const PREVIEW_MAX_LENGTH = 200

/** Elements whose *contents* are not readable text and must go entirely. */
const NON_TEXT_ELEMENTS = /<(script|style|head|title|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi

/** Unclosed variants of the same, e.g. a truncated body. */
const NON_TEXT_ELEMENTS_UNCLOSED = /<(script|style|head|title|noscript)\b[^>]*>[\s\S]*$/i

const HTML_COMMENTS = /<!--[\s\S]*?-->/g
const DOCTYPE = /<!doctype[^>]*>/gi

/** Tags that imply a line break, so words either side do not run together. */
const BLOCK_LEVEL = /<(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/table)\b[^>]*>/gi

const ANY_TAG = /<[^>]*>/g

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  zwnj: "",
  shy: "",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  igrave: "ì",
  ograve: "ò",
  ugrave: "ù",
  euro: "€",
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name) => {
      const decoded = NAMED_ENTITIES[String(name).toLowerCase()]
      return decoded === undefined ? whole : decoded
    })
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ""
  try {
    return String.fromCodePoint(code)
  } catch {
    return ""
  }
}

/**
 * Extract readable text from a message body.
 *
 * Returns an empty string when nothing readable is left, so the caller can skip
 * rendering the preview altogether rather than print a stray separator.
 */
export function htmlToPreview(content: string | null | undefined, maxLength = PREVIEW_MAX_LENGTH): string {
  if (!content) return ""

  let text = String(content)
    .replace(DOCTYPE, " ")
    .replace(HTML_COMMENTS, " ")
    .replace(NON_TEXT_ELEMENTS, " ")
    .replace(NON_TEXT_ELEMENTS_UNCLOSED, " ")
    .replace(BLOCK_LEVEL, " ")
    .replace(ANY_TAG, " ")

  text = decodeEntities(text)
    // Invisible characters used to pad email preheaders. They survive every
    // step above and eat the character budget.
    //
    // U+034F (combining grapheme joiner) is in this list because of what the
    // real data showed: Amazon's preheader is hundreds of "\u034F " pairs, and
    // because each one is followed by a real space, the whitespace collapse
    // below could not merge them. Counting tags and empty results said the
    // preview was fine; only printing it revealed rows reading
    // `Ordinato: "Mastro Lindo..." ͏ ͏ ͏ ͏ ͏ ͏ ͏ ͏ ͏ ͏ ͏`.
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u034F\u2060\u180E]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd()
}
