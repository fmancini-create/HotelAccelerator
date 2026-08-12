import { CHUNK_SIZE, CHUNK_OVERLAP, MAX_CHUNKS_PER_SOURCE, MAX_SOURCE_CHARS } from "./config"

/**
 * Split text into overlapping chunks suitable for embedding.
 *
 * Strategy: normalize whitespace, then split on paragraph boundaries and pack
 * paragraphs into chunks up to CHUNK_SIZE characters, carrying CHUNK_OVERLAP
 * characters of context between consecutive chunks. Paragraphs longer than
 * CHUNK_SIZE are hard-split. This keeps semantically related text together
 * while bounding chunk size.
 */
export function chunkText(raw: string): string[] {
  if (!raw) return []

  // Normalize: collapse excessive whitespace, keep paragraph breaks.
  const text = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_SOURCE_CHARS)

  if (!text) return []

  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ""

  const pushCurrent = () => {
    const trimmed = current.trim()
    if (trimmed) chunks.push(trimmed)
    current = ""
  }

  for (const paragraph of paragraphs) {
    // Hard-split paragraphs that alone exceed the chunk size.
    if (paragraph.length > CHUNK_SIZE) {
      pushCurrent()
      for (let i = 0; i < paragraph.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(paragraph.slice(i, i + CHUNK_SIZE).trim())
        if (chunks.length >= MAX_CHUNKS_PER_SOURCE) return chunks.slice(0, MAX_CHUNKS_PER_SOURCE)
      }
      continue
    }

    if (current.length + paragraph.length + 2 > CHUNK_SIZE) {
      pushCurrent()
      // Carry overlap from the end of the previous chunk for continuity.
      const prev = chunks[chunks.length - 1]
      if (prev && CHUNK_OVERLAP > 0) {
        current = prev.slice(-CHUNK_OVERLAP) + "\n\n"
      }
    }
    current += (current ? "\n\n" : "") + paragraph

    if (chunks.length >= MAX_CHUNKS_PER_SOURCE) return chunks.slice(0, MAX_CHUNKS_PER_SOURCE)
  }
  pushCurrent()

  return chunks.slice(0, MAX_CHUNKS_PER_SOURCE)
}
