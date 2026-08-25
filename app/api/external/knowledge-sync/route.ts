import { after, type NextRequest, NextResponse } from "next/server"
import { indexSource } from "@/lib/ai/ingest"
import {
  contentSha256,
  getAuthorizedInternalKnowledgeRepository,
  internalKnowledgeSyncSchema,
  isMissingInternalKnowledgeSyncSchema,
  verifyInternalKnowledgeSyncSignature,
} from "@/lib/ai/internal-knowledge-sync"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" }
const MAX_BODY_BYTES = 750_000

type SyncResult = {
  knowledge_base_id: string
  knowledge_source_id: string
  content_changed: boolean
}

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  const syncSecret = process.env.INTERNAL_KNOWLEDGE_SYNC_SECRET
  if (!syncSecret || syncSecret.length < 32) {
    console.error("[internal-knowledge-sync] configurazione segreto mancante o non valida")
    return response({ error: "Sincronizzazione interna non configurata" }, 503)
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return response({ error: "Corpo richiesta non leggibile" }, 400)
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return response({ error: "Richiesta troppo grande" }, 413)
  }

  const signatureValid = verifyInternalKnowledgeSyncSignature({
    rawBody,
    timestamp: request.headers.get("x-internal-knowledge-timestamp"),
    signature: request.headers.get("x-internal-knowledge-signature"),
    secret: syncSecret,
  })
  if (!signatureValid) {
    console.warn("[internal-knowledge-sync] firma rifiutata")
    return response({ error: "Non autorizzato" }, 401)
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return response({ error: "Corpo JSON non valido" }, 400)
  }
  const parsed = internalKnowledgeSyncSchema.safeParse(body)
  if (!parsed.success) return response({ error: "Payload di sincronizzazione non valido" }, 400)
  if (contentSha256(parsed.data.content) !== parsed.data.content_sha256.toLowerCase()) {
    return response({ error: "Impronta del contenuto non valida" }, 400)
  }
  const authorizedRepository = getAuthorizedInternalKnowledgeRepository(
    parsed.data.product_key,
    process.env.INTERNAL_KNOWLEDGE_SYNC_REPOSITORIES,
  )
  if (!authorizedRepository) {
    console.error("[internal-knowledge-sync] repository autorizzato non configurato", { product: parsed.data.product_key })
    return response({ error: "Sincronizzazione interna non configurata" }, 503)
  }
  if (authorizedRepository !== parsed.data.repository) {
    console.warn("[internal-knowledge-sync] repository rifiutato", { product: parsed.data.product_key })
    return response({ error: "Non autorizzato" }, 403)
  }

  try {
    const supabase = createServiceClient()
    const { data: hub, error: hubError } = await supabase
      .from("properties")
      .select("id")
      .eq("slug", "4bid")
      .eq("type", "company")
      .maybeSingle()
    if (hubError) throw hubError
    if (!hub) return response({ error: "Tenant hub 4BID non disponibile" }, 503)

    const { data, error } = await supabase.rpc("upsert_internal_knowledge_sync_source", {
      p_hub_property_id: hub.id,
      p_product_key: parsed.data.product_key,
      p_repository: parsed.data.repository,
      p_revision: parsed.data.revision,
      p_content_sha256: parsed.data.content_sha256.toLowerCase(),
      p_source_paths: parsed.data.source_paths,
      p_content: parsed.data.content,
    })
    if (error) throw error

    const sync = (data as SyncResult[] | null)?.[0]
    if (!sync) throw new Error("La sincronizzazione non ha restituito una fonte")

    if (sync.content_changed) {
      after(async () => {
        try {
          await indexSource(sync.knowledge_source_id, hub.id)
        } catch (error) {
          console.error("[internal-knowledge-sync] indicizzazione fallita", {
            product: parsed.data.product_key,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      })
    }

    return response(
      {
        accepted: true,
        product_key: parsed.data.product_key,
        revision: parsed.data.revision,
        content_changed: sync.content_changed,
        indexing: sync.content_changed ? "pending" : "unchanged",
      },
      202,
    )
  } catch (error) {
    if (isMissingInternalKnowledgeSyncSchema(error)) {
      return response({ error: "La migrazione della sincronizzazione interna non è ancora applicata" }, 503)
    }
    console.error("[internal-knowledge-sync] errore", {
      product: parsed.data.product_key,
      message: error instanceof Error ? error.message : String(error),
    })
    return response({ error: "Sincronizzazione interna non riuscita" }, 500)
  }
}
