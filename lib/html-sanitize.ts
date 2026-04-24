import sanitizeHtml from "sanitize-html"

/**
 * Server-side HTML sanitizer for email signatures.
 *
 * Uses `sanitize-html` (pure JS, no jsdom, no worker_threads) so Turbopack
 * can bundle it without runtime module-resolution errors.
 *
 * Scope: signatures pasted from Gmail / Outlook / other clients.
 * Must preserve: layout tables, inline styles, images, anchors, font tags,
 * bold/italic/underline, headings, lists, colors, widths, alignment.
 * Must strip: scripts, iframes, event handlers, javascript: URIs.
 */

const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "center",
  "col",
  "colgroup",
  "div",
  "em",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]

const GLOBAL_ATTRS = ["style", "class", "title", "dir", "lang"]

/** Sanitize rich HTML intended for an email signature. Safe for storage. */
export function sanitizeSignatureHtml(input: string): string {
  if (!input) return ""
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: [...GLOBAL_ATTRS, "href", "target", "rel"],
      img: [...GLOBAL_ATTRS, "src", "alt", "width", "height"],
      table: [...GLOBAL_ATTRS, "border", "cellpadding", "cellspacing", "width", "align", "bgcolor"],
      tbody: [...GLOBAL_ATTRS, "align", "valign"],
      thead: [...GLOBAL_ATTRS, "align", "valign"],
      tfoot: [...GLOBAL_ATTRS, "align", "valign"],
      tr: [...GLOBAL_ATTRS, "align", "valign", "bgcolor"],
      td: [...GLOBAL_ATTRS, "align", "valign", "width", "height", "colspan", "rowspan", "bgcolor"],
      th: [...GLOBAL_ATTRS, "align", "valign", "width", "height", "colspan", "rowspan", "bgcolor"],
      font: [...GLOBAL_ATTRS, "color", "face", "size"],
      div: [...GLOBAL_ATTRS, "align"],
      p: [...GLOBAL_ATTRS, "align"],
      span: GLOBAL_ATTRS,
      "*": GLOBAL_ATTRS,
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "cid"],
    allowedSchemesByTag: {
      img: ["http", "https", "data", "cid"],
    },
    allowProtocolRelative: true,
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.href && /^https?:/i.test(attribs.href) && attribs.target === "_blank") {
          return { tagName, attribs: { ...attribs, rel: "noopener noreferrer" } }
        }
        return { tagName, attribs }
      },
    },
  })
}

/** Extract plain text from HTML for the legacy `signature` column fallback. */
export function htmlToPlainText(html: string): string {
  if (!html) return ""
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|li|h[1-6]|table)\s*>/gi, "\n")
  const noTags = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
  return noTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
