import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { DEFAULT_CONFIDENCE_THRESHOLD } from "./config"

export type AiMode = "disabled" | "on_request" | "autopilot"
export type AiChannel = "telegram" | "whatsapp" | "email"

export interface AiAgentSettings {
  property_id: string
  mode: AiMode
  channels: Record<AiChannel, boolean>
  persona: string | null
  language: string
  confidence_threshold: number
  fallback_message: string | null
}

const DEFAULTS: Omit<AiAgentSettings, "property_id"> = {
  mode: "disabled",
  channels: { telegram: true, whatsapp: true, email: true },
  persona: null,
  language: "it",
  confidence_threshold: DEFAULT_CONFIDENCE_THRESHOLD,
  fallback_message: null,
}

/**
 * Read the AI agent settings for a property. Returns safe defaults (disabled)
 * when no row exists yet, so callers never have to special-case first use.
 */
export async function getAiSettings(propertyId: string): Promise<AiAgentSettings> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("ai_agent_settings")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (!data) return { property_id: propertyId, ...DEFAULTS }

  return {
    property_id: propertyId,
    mode: (data.mode as AiMode) ?? DEFAULTS.mode,
    channels: { ...DEFAULTS.channels, ...(data.channels as Record<AiChannel, boolean>) },
    persona: data.persona ?? null,
    language: data.language ?? DEFAULTS.language,
    confidence_threshold:
      typeof data.confidence_threshold === "number" ? data.confidence_threshold : DEFAULTS.confidence_threshold,
    fallback_message: data.fallback_message ?? null,
  }
}

/**
 * Create or update the AI settings for a property (upsert on property_id).
 */
export async function upsertAiSettings(
  propertyId: string,
  patch: Partial<Omit<AiAgentSettings, "property_id">>,
): Promise<AiAgentSettings> {
  const supabase = createServiceClient()
  const current = await getAiSettings(propertyId)
  const merged = { ...current, ...patch, channels: { ...current.channels, ...(patch.channels ?? {}) } }

  const { error } = await supabase.from("ai_agent_settings").upsert(
    {
      property_id: propertyId,
      mode: merged.mode,
      channels: merged.channels,
      persona: merged.persona,
      language: merged.language,
      confidence_threshold: merged.confidence_threshold,
      fallback_message: merged.fallback_message,
    },
    { onConflict: "property_id" },
  )
  if (error) throw new Error(`Salvataggio impostazioni IA fallito: ${error.message}`)
  return merged
}

/** Whether the AI should act on a given channel for this property. */
export function isChannelEnabled(settings: AiAgentSettings, channel: AiChannel): boolean {
  return settings.mode !== "disabled" && settings.channels[channel] === true
}
