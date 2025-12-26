import type {
  PlatformCollaborator,
  Structure,
  StructureWithStats,
  CollaboratorActivity,
  StructureUsageStats,
} from "@/lib/types/super-admin.types"
import type { SupabaseClient } from "@supabase/supabase-js"

export class SuperAdminRepository {
  constructor(private supabase: SupabaseClient) {}

  async getAllCollaborators(): Promise<PlatformCollaborator[]> {
    const { data, error } = await this.supabase
      .from("platform_collaborators")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error
    return data || []
  }

  async getCollaboratorById(id: string): Promise<PlatformCollaborator | null> {
    const { data, error } = await this.supabase.from("platform_collaborators").select("*").eq("id", id).maybeSingle()

    if (error) throw error
    return data
  }

  async getCollaboratorByEmail(email: string): Promise<PlatformCollaborator | null> {
    const { data, error } = await this.supabase
      .from("platform_collaborators")
      .select("*")
      .eq("email", email)
      .maybeSingle()

    if (error) throw error
    return data
  }

  async createCollaborator(data: {
    email: string
    name: string
    role: string
    created_by: string | null
  }): Promise<PlatformCollaborator> {
    const { data: created, error } = await this.supabase.from("platform_collaborators").insert(data).select().single()

    if (error) throw error
    return created
  }

  async updateCollaborator(id: string, updates: { name?: string; role?: string }): Promise<PlatformCollaborator> {
    const { data, error } = await this.supabase
      .from("platform_collaborators")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async toggleCollaboratorStatus(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.supabase
      .from("platform_collaborators")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw error
  }

  async getCollaboratorActivity(collaboratorId: string, limit = 20): Promise<CollaboratorActivity[]> {
    const { data, error } = await this.supabase
      .from("command_logs")
      .select("*")
      .eq("actor_id", collaboratorId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data || []) as CollaboratorActivity[]
  }

  async getAllStructures(): Promise<StructureWithStats[]> {
    const { data, error } = await this.supabase.from("properties").select("*").order("created_at", { ascending: false })

    if (error) throw error

    const structures = (data || []).map((property: any) => ({
      ...property,
      status: property.subscription_status || "active",
      users_count: 0,
      admin_count: 0,
      conversation_count: 0,
      last_activity_at: null,
    }))

    return structures
  }

  async getStructureById(id: string): Promise<Structure | null> {
    const { data, error } = await this.supabase
      .from("properties")
      .select(`
        *,
        admin_users(count)
      `)
      .eq("id", id)
      .maybeSingle()

    if (error) throw error

    if (!data) return null

    return {
      ...data,
      status: data.subscription_status || "active",
      users_count: data.admin_users?.[0]?.count || 0,
    } as Structure
  }

  async createStructure(data: {
    name: string
    slug: string
    plan: string
    trial_ends_at: string | null
  }): Promise<Structure> {
    const { data: created, error } = await this.supabase
      .from("properties")
      .insert({
        ...data,
        subscription_status: data.plan === "trial" ? "trial" : "active",
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error
    return created as Structure
  }

  async updateStructure(
    id: string,
    updates: {
      name?: string
      plan?: string
      subscription_status?: string
      trial_ends_at?: string | null
      inbox_enabled?: boolean
      cms_enabled?: boolean
      ai_enabled?: boolean
    },
  ): Promise<Structure> {
    const { data, error } = await this.supabase
      .from("properties")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as Structure
  }

  async getStructureUsageStats(propertyId: string): Promise<StructureUsageStats> {
    const { count: convCount } = await this.supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)

    const { count: msgCount } = await this.supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)

    const { data: commandStats } = await this.supabase
      .from("command_logs")
      .select("result, error_code, created_at")
      .eq("property_id", propertyId)

    const totalCommands = commandStats?.length || 0
    const totalErrors = commandStats?.filter((c) => c.result !== "success" || c.error_code).length || 0
    const errorRate = totalCommands > 0 ? (totalErrors / totalCommands) * 100 : 0

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const last30DaysCommands = commandStats?.filter((c) => new Date(c.created_at) > thirtyDaysAgo).length || 0

    const lastActivity = commandStats?.[0]?.created_at || null

    return {
      property_id: propertyId,
      total_conversations: convCount || 0,
      total_messages: msgCount || 0,
      total_write_commands: totalCommands,
      total_errors: totalErrors,
      error_rate: errorRate,
      last_30_days_commands: last30DaysCommands,
      last_activity_at: lastActivity,
    }
  }
}
