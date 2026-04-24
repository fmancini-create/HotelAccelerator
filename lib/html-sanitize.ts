import DOMPurify from "isomorphic-dompurify"

/**
 * Sanitizer config for email signatures.
 *
 * Signatures are rich HTML pasted from Gmail/Outlook/etc. — they can contain:
 *   - tables (used for layout)
 *   - img with https: or data: (logos, social icons)
 *   - a with href (mailto:, tel:, https:)
 *   - inline styles (colors, font, size)
 *
 * We keep the allowlist permissive for formatting tags but strip <script>,
 * <iframe>, <object>, event handlers, javascript: URIs, etc.
 */
const SIGNATURE_CONFIG = {
  ALLOWED_TAGS: [
    // block
    "div", "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre",
    // inline
    "span", "a", "strong", "b", "em", "i", "u", "s", "small", "sub", "sup",
    "font", // legacy but used by Gmail signatures
    // lists
    "ul", "ol", "li",
    // tables (Gmail uses them for signature layout)
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col",
    // media
    "img",
  ],
  ALLOWED_ATTR: [
    "href", "target", "rel", "title",
    "src", "alt", "width", "height",
    "style", "class",
    "align", "valign",
    // table layout
    "colspan", "rowspan", "cellpadding", "cellspacing", "border",
    // legacy <font>
    "color", "face", "size",
    // prevent tracking pixels via remote content not needed; email clients handle this
    "bgcolor",
    // referenced cid: images from Gmail — keep the src but downstream code can rewrite
    "data-surl",
  ],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|cid|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "style", "link", "meta"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onmouseout", "onfocus", "onblur", "srcset"],
  KEEP_CONTENT: true,
  ALLOW_DATA_ATTR: false,
} as const

/** Sanitize rich HTML intended for an email signature. Safe for storage. */
export function sanitizeSignatureHtml(input: string): string {
  if (!input) return ""
  return DOMPurify.sanitize(input, SIGNATURE_CONFIG as any) as unknown as string
}

/** Extract plain text from HTML for the `signature` column fallback. */
export function htmlToPlainText(html: string): string {
  if (!html) return ""
  const withoutScripts = html.replace(/<script[^>]*>.*?<\/script>/gi, "")
  // Convert common block/break tags to newlines, then strip remaining tags.
  const withNewlines = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
  const text = withNewlines
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return text.replace(/\n{3,}/g, "\n\n").trim()
}
