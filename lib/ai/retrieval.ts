import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { embedText } from "./embeddings"
import { DEFAULT_MATCH_COUNT } from "./config"

export interface RetrievedChunk {
  id: string
  source_id: string
  content: string
  similarity: number
  /** Origin page of the chunk, filled in by attachSourceMeta. */
  source_url?: string | null
  source_title?: string | null
}

/**
 * Attach the origin page (url + title) to already-retrieved chunks.
 *
 * The crawler stores page *text*, so links are stripped: a chunk can literally
 * read "clicca qui" with no href, and 0 of the indexed chunks contain a URL.
 * The address is not lost though — it lives on the source row. Without this the
 * assistant can offer to "redirect you to the booking system" and then be
 * unable to say where, which is a dead end for the guest.
 */
export async function attachSourceMeta(chunks: RetrievedChunk[]): Promise<RetrievedChunk[]> {
  const sourceIds = [...new Set(chunks.map((c) => c.source_id).filter(Boolean))]
  if (sourceIds.length === 0) return chunks

  const supabase = createServiceClient()
  const { data, error } = await supabase.from("knowledge_sources").select("id, url, title").in("id", sourceIds)

  if (error) {
    console.log(`[v0] attachSourceMeta error: ${error.message}`)
    return chunks
  }

  type SourceMeta = { id: string; url: string | null; title: string | null }
  const byId = new Map<string, SourceMeta>(
    ((data ?? []) as unknown as SourceMeta[]).map((s) => [s.id, s]),
  )
  return chunks.map((c) => {
    const source = byId.get(c.source_id)
    return { ...c, source_url: source?.url ?? null, source_title: source?.title ?? null }
  })
}

/**
 * Retrieve the most relevant knowledge chunks for a query, scoped to an
 * explicit set of knowledge bases via the match_knowledge_chunks_by_bases RPC.
 * A channel may combine several bases, so retrieval spans all of them.
 * `minSimilarity` filters out weak matches server-side so callers only see
 * genuinely relevant context.
 */
export async function retrieveContext(
  baseIds: string[],
  query: string,
  opts?: { matchCount?: number; minSimilarity?: number },
): Promise<RetrievedChunk[]> {
  const trimmed = query?.trim()
  if (!trimmed || baseIds.length === 0) return []

  const embedding = await embedText(trimmed)
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc("match_knowledge_chunks_by_bases", {
    p_base_ids: baseIds,
    query_embedding: `[${embedding.join(",")}]`,
    match_count: opts?.matchCount ?? DEFAULT_MATCH_COUNT,
    min_similarity: opts?.minSimilarity ?? 0,
  })

  if (error) {
    console.log(`[v0] retrieveContext RPC error: ${error.message}`)
    return []
  }
  return (data as RetrievedChunk[]) ?? []
}
