import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { chunkText } from "./chunking"
import { embedTexts, toVectorLiteral } from "./embeddings"
import { extractPdfText, extractUrlText } from "./extract"

/**
 * Index (or re-index) a single knowledge source end to end:
 *   1. mark it `processing`
 *   2. resolve raw text by source type (text/pdf/url/conversation)
 *   3. chunk + embed
 *   4. replace its chunks atomically-ish (delete old, insert new)
 *   5. mark it `ready` (or `error` with a message)
 *
 * Tenant isolation: every read/write is filtered by property_id, and chunks
 * carry the same property_id used by the retrieval RPC.
 */
export async function indexSource(sourceId: string, propertyId: string): Promise<{ chunkCount: number }> {
  const supabase = createServiceClient()

  const { data: source, error: loadError } = await supabase
    .from("knowledge_sources")
    .select("*")
    .eq("id", sourceId)
    .eq("property_id", propertyId)
    .maybeSingle()

  if (loadError || !source) {
    throw new Error("Fonte non trovata")
  }

  await supabase
    .from("knowledge_sources")
    .update({ status: "processing", error: null })
    .eq("id", sourceId)
    .eq("property_id", propertyId)

  try {
    // 1. Resolve raw text + (optionally) a better title.
    let text = ""
    let resolvedTitle: string | null = source.title ?? null

    if (source.type === "text" || source.type === "conversation") {
      text = source.content ?? ""
    } else if (source.type === "pdf") {
      if (!source.file_url) throw new Error("PDF senza file allegato")
      text = await extractPdfText(source.file_url)
    } else if (source.type === "url") {
      if (!source.url) throw new Error("URL mancante")
      const extracted = await extractUrlText(source.url)
      text = extracted.text
      if (!resolvedTitle) resolvedTitle = extracted.title
    }

    text = (text ?? "").trim()
    if (!text) throw new Error("Nessun contenuto testuale estratto dalla fonte")

    // 2. Chunk + embed.
    const chunks = chunkText(text)
    if (chunks.length === 0) throw new Error("Impossibile suddividere il contenuto in frammenti")

    const embeddings = await embedTexts(chunks)

    // 3. Replace existing chunks for this source.
    await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId).eq("property_id", propertyId)

    const rows = chunks.map((content, i) => ({
      property_id: propertyId,
      source_id: sourceId,
      content,
      embedding: toVectorLiteral(embeddings[i]),
      token_count: Math.ceil(content.length / 4),
      chunk_index: i,
    }))

    // Insert in batches to stay well within payload limits.
    const BATCH = 100
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: insertError } = await supabase.from("knowledge_chunks").insert(rows.slice(i, i + BATCH))
      if (insertError) throw new Error(`Salvataggio frammenti fallito: ${insertError.message}`)
    }

    // 4. Persist stored content (for url/pdf we now have extracted text) + mark ready.
    await supabase
      .from("knowledge_sources")
      .update({
        status: "ready",
        error: null,
        title: resolvedTitle,
        content: source.type === "url" || source.type === "pdf" ? text.slice(0, 200_000) : source.content,
        chunk_count: chunks.length,
        last_indexed_at: new Date().toISOString(),
      })
      .eq("id", sourceId)
      .eq("property_id", propertyId)

    return { chunkCount: chunks.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore di indicizzazione"
    await supabase
      .from("knowledge_sources")
      .update({ status: "error", error: message })
      .eq("id", sourceId)
      .eq("property_id", propertyId)
    throw err
  }
}
