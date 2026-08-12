import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { embedText } from "./embeddings"
import { DEFAULT_MATCH_COUNT } from "./config"

export interface RetrievedChunk {
  id: string
  source_id: string
  content: string
  similarity: number
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
