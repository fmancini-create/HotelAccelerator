import "server-only"
import { embed, embedMany } from "ai"
import { EMBEDDING_MODEL } from "./config"

/**
 * Embed a single value (used for the incoming user query at retrieval time).
 */
export async function embedText(value: string): Promise<number[]> {
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: value.slice(0, 8000),
  })
  return embedding
}

/**
 * Embed many values in one batched call (used when indexing a source's chunks).
 * Returned embeddings are in the same order as the input values.
 */
export async function embedTexts(values: string[]): Promise<number[][]> {
  if (values.length === 0) return []
  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: values.map((v) => v.slice(0, 8000)),
    maxParallelCalls: 2,
  })
  return embeddings
}

/**
 * pgvector accepts a bracketed, comma-separated string literal for the
 * `vector` type. Serialize a JS number[] to that format for inserts.
 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}
