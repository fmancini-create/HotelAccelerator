import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { isMissingInternalKnowledgeSyncSchema, type InternalKnowledgeProductKey } from "@/lib/ai/internal-knowledge-sync"

export type InternalKnowledgeSyncStatus = {
  productKey: InternalKnowledgeProductKey
  knowledgeBaseId: string
  repository: string
  sourcePaths: string[]
  revision: string
  status: "pending" | "processing" | "ready" | "error"
  error: string | null
  receivedAt: string
  indexedAt: string | null
  knowledgeBaseName: string
  sourceTitle: string
  chunkCount: number
}

export type InternalKnowledgeSyncDiagnostics =
  | { schemaAvailable: false; sources: [] }
  | { schemaAvailable: true; sources: InternalKnowledgeSyncStatus[]; error?: string }

export async function getInternalKnowledgeSyncDiagnostics(
  hubPropertyId: string,
): Promise<InternalKnowledgeSyncDiagnostics> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("internal_knowledge_sync_sources")
    .select(
      "product_key, knowledge_base_id, repository, source_paths, last_revision, last_sync_status, last_error, last_received_at, last_indexed_at, knowledge_bases(name), knowledge_sources(title, status, error, chunk_count, last_indexed_at)",
    )
    .eq("hub_property_id", hubPropertyId)
    .order("product_key", { ascending: true })

  if (error) {
    if (isMissingInternalKnowledgeSyncSchema(error)) return { schemaAvailable: false, sources: [] }
    throw error
  }

  const sources = ((data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
    const base = row.knowledge_bases as { name?: unknown } | null
    const source = row.knowledge_sources as {
      title?: unknown
      status?: unknown
      error?: unknown
      chunk_count?: unknown
      last_indexed_at?: unknown
    } | null
    const productKey = row.product_key
    if (
      typeof productKey !== "string"
      || !["hotel-accelerator", "santaddeo-rms", "hotel-profit-ai", "manubot"].includes(productKey)
      || typeof row.repository !== "string"
      || typeof row.knowledge_base_id !== "string"
      || typeof row.last_revision !== "string"
      || typeof row.last_received_at !== "string"
      || !source
    ) return []

    const status = source.status ?? row.last_sync_status
    if (!["pending", "processing", "ready", "error"].includes(String(status))) return []
    return [{
      productKey: productKey as InternalKnowledgeProductKey,
      knowledgeBaseId: row.knowledge_base_id,
      repository: row.repository,
      sourcePaths: Array.isArray(row.source_paths)
        ? row.source_paths.filter((path): path is string => typeof path === "string")
        : [],
      revision: row.last_revision,
      status: status as InternalKnowledgeSyncStatus["status"],
      error: typeof source.error === "string" ? source.error : typeof row.last_error === "string" ? row.last_error : null,
      receivedAt: row.last_received_at,
      indexedAt:
        typeof source.last_indexed_at === "string"
          ? source.last_indexed_at
          : typeof row.last_indexed_at === "string"
            ? row.last_indexed_at
            : null,
      knowledgeBaseName: typeof base?.name === "string" ? base.name : "Base interna 4BID",
      sourceTitle: typeof source.title === "string" ? source.title : "Documentazione interna sincronizzata",
      chunkCount: typeof source.chunk_count === "number" ? source.chunk_count : 0,
    }]
  })

  return { schemaAvailable: true, sources }
}
