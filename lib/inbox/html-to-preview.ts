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
    // A newline, not a space: the header strip below needs line boundaries to
    // know where a `Subject:` line ends. The final whitespace collapse turns
    // these back into single spaces, so the visible result is unchanged.
    .replace(BLOCK_LEVEL, "\n")
    .replace(ANY_TAG, " ")

  text = decodeEntities(text)
    // Mail headers carried inside the body of a wrapped/forwarded message.
    // Scidoo's booking mails start with `Subject: ✅ Your booking is confirmed`,
    // so the row repeated a subject line the list already shows in its own
    // column. Stripped only at the very start, and only for known header
    // names, so a message that merely mentions "Subject:" mid-text is safe.
    //
    // This runs BEFORE the whitespace collapse below on purpose: once newlines
    // are gone there is no line to anchor the match to, and the rule would
    // have to guess where the header ends.
    //
    // `^\s*` and not `^`: the stored body starts with `\r\n<!doctype html>`,
    // and stripping the markup leaves that leading whitespace behind, so an
    // anchor at character zero matched nothing. The first attempt looked
    // correct and passed its unit test; only the rendered row showed the header
    // still there.
    .replace(/^\s*(?:[ \t]*(?:Subject|Oggetto|From|To|Cc|Date|Da|A|Data|Reply-To|Mittente):[^\n]*(?:\n|$))+/i, "")

  text = text
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

/** Same normalisation on both sides, so punctuation or spacing cannot defeat the match. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The preview as the list should show it: readable text, minus the subject
 * when the body merely repeats it.
 *
 * Many transactional mails open with their own subject line, so the row read
 * `Ordinato: "Mastro Lindo Gomma Magica,..." - Ordinato: "Mastro Lindo Gomma
 * Magica,..."` - the same sentence twice, using up the only line available for
 * saying something new. Seen on screen, not caught by any count.
 */
export function buildPreview(
  content: string | null | undefined,
  subject?: string | null,
  maxLength = PREVIEW_MAX_LENGTH,
): string {
  // Extract first WITHOUT the cap: trimming to 200 characters and only then
  // removing a repeated subject would leave a preview far shorter than it
  // should be, sometimes empty.
  const full = htmlToPreview(content, Number.POSITIVE_INFINITY)
  if (!full) return ""

  const trimmedSubject = (subject ?? "").trim()
  let text = full

  if (trimmedSubject) {
    const n = normalise(full)
    const s = normalise(trimmedSubject)
    // Only a leading repetition is removed. A subject quoted further down is
    // usually part of a real sentence and must stay.
    if (s.length > 0 && n.startsWith(s)) {
      // Walk the original string to the same offset: `normalise` can change
      // length, so the normalised index cannot be reused directly.
      let consumed = 0
      let seen = 0
      while (consumed < full.length && seen < s.length) {
        seen = normalise(full.slice(0, ++consumed)).length
      }
      const remainder = full.slice(consumed).replace(/^[\s\p{P}]+/u, "").trim()
      // If the body says nothing beyond the subject, show nothing: an empty
      // preview is honest, a duplicated one is noise.
      text = remainder
    }
  }

  if (!text) return ""
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd()
}
