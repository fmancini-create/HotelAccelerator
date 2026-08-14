import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { DEFAULT_CONFIDENCE_THRESHOLD } from "./config"

export type AiMode = "disabled" | "on_request" | "autopilot"

export interface KnowledgeBase {
  id: string
  property_id: string
  name: string
  description: string | null
  mode: AiMode
  language: string
  persona: string | null
  confidence_threshold: number
  fallback_message: string | null
  created_at: string
  updated_at: string
}

export interface KnowledgeBaseWithCount extends KnowledgeBase {
  source_count: number
}

/** Resolved behavior for a channel: the primary base drives mode/threshold/persona,
 *  while retrieval spans every linked base (baseIds). */
export interface ResolvedChannelAi {
  bases: KnowledgeBase[]
  primary: KnowledgeBase | null
  baseIds: string[]
}

export type KnowledgeBasePatch = Partial<
  Pick<
    KnowledgeBase,
    "name" | "description" | "mode" | "language" | "persona" | "confidence_threshold" | "fallback_message"
  >
>

function rowToBase(data: Record<string, unknown>): KnowledgeBase {
  return {
    id: data.id as string,
    property_id: data.property_id as string,
    name: (data.name as string) ?? "",
    description: (data.description as string) ?? null,
    mode: ((data.mode as AiMode) ?? "disabled") as AiMode,
    language: (data.language as string) ?? "it",
    persona: (data.persona as string) ?? null,
    confidence_threshold:
      typeof data.confidence_threshold === "number"
        ? (data.confidence_threshold as number)
        : DEFAULT_CONFIDENCE_THRESHOLD,
    fallback_message: (data.fallback_message as string) ?? null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  }
}

/** List all knowledge bases for a property, with their source counts. */
export async function getKnowledgeBases(propertyId: string): Promise<KnowledgeBaseWithCount[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("knowledge_bases")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true })

  if (error) throw new Error(`Lettura basi di conoscenza fallita: ${error.message}`)
  const bases = ((data ?? []) as Record<string, unknown>[]).map(rowToBase)
  if (bases.length === 0) return []

  const { data: sources } = await supabase
    .from("knowledge_sources")
    .select("knowledge_base_id")
    .eq("property_id", propertyId)

  const counts = new Map<string, number>()
  for (const s of (sources ?? []) as { knowledge_base_id: string | null }[]) {
    if (s.knowledge_base_id) counts.set(s.knowledge_base_id, (counts.get(s.knowledge_base_id) ?? 0) + 1)
  }
  return bases.map((b) => ({ ...b, source_count: counts.get(b.id) ?? 0 }))
}

/** Fetch a single base, scoped to the property (tenant isolation). */
export async function getKnowledgeBase(baseId: string, propertyId: string): Promise<KnowledgeBase | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("knowledge_bases")
    .select("*")
    .eq("id", baseId)
    .eq("property_id", propertyId)
    .maybeSingle()
  return data ? rowToBase(data) : null
}

export async function createKnowledgeBase(propertyId: string, patch: KnowledgeBasePatch): Promise<KnowledgeBase> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("knowledge_bases")
    .insert({
      property_id: propertyId,
      name: patch.name?.trim() || "Nuova base",
      description: patch.description ?? null,
      mode: patch.mode ?? "disabled",
      language: patch.language ?? "it",
      persona: patch.persona ?? null,
      confidence_threshold: patch.confidence_threshold ?? DEFAULT_CONFIDENCE_THRESHOLD,
      fallback_message: patch.fallback_message ?? null,
    })
    .select("*")
    .single()
  if (error) throw new Error(`Creazione base fallita: ${error.message}`)
  return rowToBase(data)
}

export async function updateKnowledgeBase(
  baseId: string,
  propertyId: string,
  patch: KnowledgeBasePatch,
): Promise<KnowledgeBase> {
  const supabase = createServiceClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim() || "Base"
  if (patch.description !== undefined) update.description = patch.description
  if (patch.mode !== undefined) update.mode = patch.mode
  if (patch.language !== undefined) update.language = patch.language
  if (patch.persona !== undefined) update.persona = patch.persona
  if (patch.confidence_threshold !== undefined) update.confidence_threshold = patch.confidence_threshold
  if (patch.fallback_message !== undefined) update.fallback_message = patch.fallback_message

  const { data, error } = await supabase
    .from("knowledge_bases")
    .update(update)
    .eq("id", baseId)
    .eq("property_id", propertyId)
    .select("*")
    .single()
  if (error) throw new Error(`Aggiornamento base fallito: ${error.message}`)
  return rowToBase(data)
}

export async function deleteKnowledgeBase(baseId: string, propertyId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from("knowledge_bases").delete().eq("id", baseId).eq("property_id", propertyId)
  if (error) throw new Error(`Eliminazione base fallita: ${error.message}`)
}

/**
 * Resolve the knowledge bases linked to a channel, ordered by position.
 * The first (position 0) is the primary base that drives behavior; every
 * linked base contributes content to retrieval via `baseIds`.
 */
export async function getBasesForChannel(channelId: string): Promise<ResolvedChannelAi> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("channel_knowledge_bases")
    .select("position, knowledge_bases(*)")
    .eq("channel_id", channelId)
    .order("position", { ascending: true })

  if (error || !data) return { bases: [], primary: null, baseIds: [] }

  const rows = data as { knowledge_bases: Record<string, unknown> | null }[]
  const bases = rows
    .map((row) => {
      const kb = row.knowledge_bases
      return kb ? rowToBase(kb) : null
    })
    .filter((b): b is KnowledgeBase => b !== null)

  return { bases, primary: bases[0] ?? null, baseIds: bases.map((b) => b.id) }
}

/**
 * Replace the ordered list of bases linked to a channel (index = position).
 *
 * Delegates to the `set_channel_knowledge_bases` database function so the
 * delete + insert happen in a SINGLE transaction. Doing it in two separate
 * statements from here meant that a failing insert left the channel with zero
 * bases: the assistant silently stopped answering while the error only said
 * "salvataggio fallito". The function also drops duplicate ids (the primary
 * key would reject them) and re-checks that channel and bases belong to the
 * same property.
 */
export async function setChannelBases(
  channelId: string,
  orderedBaseIds: string[],
  propertyId: string,
): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc("set_channel_knowledge_bases", {
    p_channel_id: channelId,
    p_property_id: propertyId,
    p_base_ids: orderedBaseIds,
  })
  if (error) throw new Error(`Salvataggio associazioni canale fallito: ${error.message}`)
}
