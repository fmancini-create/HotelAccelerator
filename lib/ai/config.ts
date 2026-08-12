/**
 * Central AI configuration for the per-tenant knowledge base.
 *
 * Models are referenced as Vercel AI Gateway `provider/model` strings, so no
 * provider SDK packages are required. The gateway is authenticated via the
 * AI_GATEWAY_API_KEY environment variable.
 */

// Chat model used to generate replies grounded in retrieved knowledge.
export const CHAT_MODEL = "openai/gpt-5.4-mini"

// Embedding model. text-embedding-3-small = 1536 dims, matches the
// vector(1536) column and HNSW index defined in the migration.
export const EMBEDDING_MODEL = "openai/text-embedding-3-small"
export const EMBEDDING_DIMENSIONS = 1536

// Retrieval defaults (can be overridden per-tenant via ai_agent_settings).
export const DEFAULT_MATCH_COUNT = 6
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.35

// Chunking defaults (characters, not tokens — a simple, robust heuristic).
export const CHUNK_SIZE = 1200
export const CHUNK_OVERLAP = 200

// Hard caps to protect cost and DB size on very large sources.
export const MAX_CHUNKS_PER_SOURCE = 400
export const MAX_SOURCE_CHARS = 500_000
