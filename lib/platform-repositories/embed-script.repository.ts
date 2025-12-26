import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  EmbedScript,
  CreateEmbedScriptInput,
  UpdateEmbedScriptInput,
  EmbedScriptStatus,
} from "@/lib/types/embed-script.types"

export class EmbedScriptRepository {
  constructor(private supabase: SupabaseClient) {}

  async findById(id: string): Promise<EmbedScript | null> {
    const { data, error } = await this.supabase.from("embed_scripts").select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data
  }

  async findByPropertyId(propertyId: string): Promise<EmbedScript[]> {
    const { data, error } = await this.supabase
      .from("embed_scripts")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
    if (error) throw error
    return data || []
  }

  async findActiveByPropertyId(propertyId: string): Promise<EmbedScript[]> {
    const { data, error } = await this.supabase
      .from("embed_scripts")
      .select("*")
      .eq("property_id", propertyId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
    if (error) throw error
    return data || []
  }

  async create(propertyId: string, input: CreateEmbedScriptInput): Promise<EmbedScript> {
    const { data, error } = await this.supabase
      .from("embed_scripts")
      .insert({
        property_id: propertyId,
        name: input.name,
        type: input.type,
        destination_url: input.destination_url,
        config: input.config || {},
        customization: input.customization || {},
        status: "inactive",
      })
      .select()
      .single()
    if (error) throw error
    return data
  }

  async update(id: string, input: UpdateEmbedScriptInput): Promise<EmbedScript> {
    const updateData: Record<string, unknown> = {}
    if (input.name !== undefined) updateData.name = input.name
    if (input.destination_url !== undefined) updateData.destination_url = input.destination_url
    if (input.config !== undefined) updateData.config = input.config
    if (input.customization !== undefined) updateData.customization = input.customization
    if (input.status !== undefined) updateData.status = input.status
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await this.supabase.from("embed_scripts").update(updateData).eq("id", id).select().single()
    if (error) throw error
    return data
  }

  async updateConfig(id: string, config: Partial<EmbedScript["config"]>): Promise<EmbedScript> {
    const existing = await this.findById(id)
    if (!existing) throw new Error("Script not found")

    const { data, error } = await this.supabase
      .from("embed_scripts")
      .update({
        config: { ...existing.config, ...config },
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  async updateStatus(id: string, status: EmbedScriptStatus): Promise<EmbedScript> {
    const { data, error } = await this.supabase
      .from("embed_scripts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  async deleteScript(id: string, propertyId: string): Promise<void> {
    const { error } = await this.supabase.from("embed_scripts").delete().eq("id", id).eq("property_id", propertyId)
    if (error) throw error
  }

  async incrementViews(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("increment_embed_script_views", { script_id: id })
    if (error) {
      // Fallback if RPC doesn't exist
      const script = await this.findById(id)
      if (script) {
        await this.supabase
          .from("embed_scripts")
          .update({ views: (script.views || 0) + 1 })
          .eq("id", id)
      }
    }
  }

  async incrementInteractions(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("increment_embed_script_interactions", { script_id: id })
    if (error) {
      // Fallback if RPC doesn't exist
      const script = await this.findById(id)
      if (script) {
        await this.supabase
          .from("embed_scripts")
          .update({ interactions: (script.interactions || 0) + 1 })
          .eq("id", id)
      }
    }
  }
}
