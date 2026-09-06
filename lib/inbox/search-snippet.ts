import { htmlToPreview } from "@/lib/inbox/html-to-preview"

export interface SearchHighlight {
  start: number
  end: number
}

export interface SearchSnippet {
  text: string
  highlights: SearchHighlight[]
}

const SEARCHABLE_TEXT_MAX = 50_000
const SNIPPET_DEFAULT_MAX = 260

function literalTerms(query: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of query.replace(/"/g, " ").split(/\s+/)) {
    if (!raw || raw.toUpperCase() === "OR" || raw.startsWith("-")) continue
    const cleaned = raw.replace(/^[^\p{L}\p{N}@]+|[^\p{L}\p{N}@._+-]+$/gu, "").trim()
    if (cleaned.length < 2) continue
    const key = cleaned.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }
  return result
}

function trigrams(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase()
  const grams = new Set<string>()
  if (normalized.length < 3) {
    grams.add(normalized)
    return grams
  }
  for (let i = 0; i <= normalized.length - 3; i++) grams.add(normalized.slice(i, i + 3))
  return grams
}

function diceCoefficient(a: string, b: string): number {
  const aSet = trigrams(a)
  const bSet = trigrams(b)
  if (aSet.size === 0 || bSet.size === 0) return 0
  let common = 0
  for (const gram of aSet) if (bSet.has(gram)) common++
  return (2 * common) / (aSet.size + bSet.size)
}

function findApproximateWord(text: string, terms: string[]): { start: number; end: number } | null {
  const useful = terms.filter((term) => term.length >= 4 && term.length <= 40)
  if (useful.length === 0) return null

  let best: { start: number; end: number; score: number } | null = null
  const searchable = text.slice(0, SEARCHABLE_TEXT_MAX)
  const words = searchable.matchAll(/[\p{L}\p{N}]+/gu)

  for (const match of words) {
    const word = match[0]
    const start = match.index ?? 0
    for (const term of useful) {
      if (Math.abs(word.length - term.length) > 4) continue
      const score = diceCoefficient(term, word)
      if (score < 0.58 || (best && score <= best.score)) continue
      best = { start, end: start + word.length, score }
      if (score >= 0.95) return best
    }
  }

  return best
}

function collectHighlights(
  text: string,
  terms: string[],
  approximate?: { start: number; end: number } | null,
): SearchHighlight[] {
  const lower = text.toLocaleLowerCase()
  const ranges: SearchHighlight[] = []

  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const needle = term.toLocaleLowerCase()
    if (needle.length < 2) continue
    let cursor = 0
    let found = 0
    while (cursor < lower.length && found < 6) {
      const index = lower.indexOf(needle, cursor)
      if (index < 0) break
      ranges.push({ start: index, end: index + needle.length })
      cursor = index + needle.length
      found++
    }
  }

  if (approximate) ranges.push(approximate)
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)

  const merged: SearchHighlight[] = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

/**
 * Crea lo snippet nello stesso modo in cui un motore web mostra il frammento
 * pertinente: porta il match al centro e restituisce intervalli da evidenziare.
 * Nessun HTML viene prodotto o fidato.
 */
export function buildSearchSnippet(
  content: string | null | undefined,
  query: string,
  expandedTerms: string[] = [],
  maxLength = SNIPPET_DEFAULT_MAX,
): SearchSnippet | null {
  if (!content) return null
  const readable = htmlToPreview(content, SEARCHABLE_TEXT_MAX)
  if (!readable) return null

  const terms = [...literalTerms(query), ...expandedTerms.flatMap(literalTerms)]
  const uniqueTerms = [...new Map(terms.map((term) => [term.toLocaleLowerCase(), term])).values()]
  const lower = readable.toLocaleLowerCase()

  let exact: { start: number; end: number } | null = null
  for (const term of [...uniqueTerms].sort((a, b) => b.length - a.length)) {
    const index = lower.indexOf(term.toLocaleLowerCase())
    if (index < 0) continue
    if (!exact || index < exact.start) exact = { start: index, end: index + term.length }
  }

  const approximate = exact ? null : findApproximateWord(readable, uniqueTerms)
  const focus = exact ?? approximate

  if (readable.length <= maxLength) {
    return { text: readable, highlights: collectHighlights(readable, uniqueTerms, approximate) }
  }

  const desiredStart = focus ? Math.max(0, focus.start - Math.floor(maxLength * 0.32)) : 0
  let start = desiredStart
  if (start > 0) {
    const nextSpace = readable.indexOf(" ", start)
    if (nextSpace >= 0 && nextSpace - start < 40) start = nextSpace + 1
  }

  let end = Math.min(readable.length, start + maxLength)
  if (end < readable.length) {
    const previousSpace = readable.lastIndexOf(" ", end)
    if (previousSpace > start + Math.floor(maxLength * 0.65)) end = previousSpace
  }

  const rawWindow = readable.slice(start, end)
  const leadingTrim = rawWindow.length - rawWindow.trimStart().length
  const body = rawWindow.trim()
  const prefix = start > 0 ? "…" : ""
  const suffix = end < readable.length ? "…" : ""
  const text = `${prefix}${body}${suffix}`

  // source index -> snippet index. The left trim moves source indexes LEFT in
  // the rendered body, so it must be subtracted (not added).
  const bodyOffset = prefix.length - start - leadingTrim

  const sourceHighlights = collectHighlights(readable, uniqueTerms, approximate)
    .filter((range) => range.end > start + leadingTrim && range.start < end)
    .map((range) => ({
      start: Math.max(prefix.length, range.start + bodyOffset),
      end: Math.min(text.length - suffix.length, range.end + bodyOffset),
    }))
    .filter((range) => range.end > range.start)

  return { text, highlights: sourceHighlights }
}
