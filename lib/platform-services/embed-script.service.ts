import { EmbedScriptRepository } from "@/lib/platform-repositories"
import type {
  EmbedScript,
  CreateEmbedScriptInput,
  UpdateEmbedScriptInput,
  EmbedScriptStatus,
} from "@/lib/types/embed-script.types"
import type { SupabaseClient } from "@supabase/supabase-js"

export class EmbedScriptService {
  private repository: EmbedScriptRepository

  constructor(supabase: SupabaseClient) {
    this.repository = new EmbedScriptRepository(supabase)
  }

  async getScriptById(id: string): Promise<EmbedScript | null> {
    return this.repository.findById(id)
  }

  async getScriptsByProperty(propertyId: string): Promise<EmbedScript[]> {
    return this.repository.findByPropertyId(propertyId)
  }

  async getActiveScriptsByProperty(propertyId: string): Promise<EmbedScript[]> {
    return this.repository.findActiveByPropertyId(propertyId)
  }

  async createScript(propertyId: string, input: CreateEmbedScriptInput): Promise<EmbedScript> {
    try {
      new URL(input.destination_url)
    } catch {
      throw new Error("URL destinazione non valido")
    }
    return this.repository.create(propertyId, input)
  }

  async updateScript(id: string, input: UpdateEmbedScriptInput): Promise<EmbedScript> {
    const script = await this.repository.findById(id)
    if (!script) {
      throw new Error("Script non trovato")
    }
    if (input.destination_url) {
      try {
        new URL(input.destination_url)
      } catch {
        throw new Error("URL destinazione non valido")
      }
    }
    return this.repository.update(id, input)
  }

  async updateScriptConfig(id: string, config: Partial<EmbedScript["config"]>): Promise<EmbedScript> {
    return this.repository.updateConfig(id, config)
  }

  async updateScriptStatus(id: string, status: EmbedScriptStatus): Promise<EmbedScript> {
    return this.repository.updateStatus(id, status)
  }

  async deleteScript(id: string, propertyId: string): Promise<void> {
    const script = await this.repository.findById(id)
    if (!script) {
      throw new Error("Script non trovato")
    }
    return this.repository.deleteScript(id, propertyId)
  }

  async trackView(id: string): Promise<void> {
    await this.repository.incrementViews(id)
  }

  async trackInteraction(id: string): Promise<void> {
    await this.repository.incrementInteractions(id)
  }
}
