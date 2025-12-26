import { createClient } from "@/lib/supabase/server"

export interface MessageRule {
  id: string
  property_id: string
  name: string
  description: string | null
  rule_type: "page_visits" | "room_interest" | "return_visitor"
  conditions: Record<string, any>
  message_type: "popup" | "chat"
  message_content: {
    title?: string
    body: string
    cta_text?: string
    cta_url?: string
    image_url?: string
  }
  is_active: boolean
  priority: number
  max_impressions_per_session: number
  max_impressions_per_day: number
  target_pages: string[]
  exclude_pages: string[]
  start_date: string | null
  end_date: string | null
  impressions_count: number
  clicks_count: number
  created_at: string
  updated_at: string
}

export interface CreateMessageRuleData {
  property_id: string
  name: string
  description?: string | null
  rule_type: "page_visits" | "room_interest" | "return_visitor"
  conditions: Record<string, any>
  message_type: "popup" | "chat"
  message_content: {
    title?: string
    body: string
    cta_text?: string
    cta_url?: string
    image_url?: string
  }
  is_active?: boolean
  priority?: number
  max_impressions_per_session?: number
  max_impressions_per_day?: number
  target_pages?: string[]
  exclude_pages?: string[]
  start_date?: string | null
  end_date?: string | null
}

export interface UpdateMessageRuleData extends Partial<CreateMessageRuleData> {
  updated_at?: string
}

export class MessageRuleRepository {
  static async findByPropertyId(propertyId: string): Promise<MessageRule[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("message_rules")
      .select("*")
      .eq("property_id", propertyId)
      .order("priority", { ascending: false })

    if (error) throw new Error(`Failed to fetch message rules: ${error.message}`)
    return data || []
  }

  static async findById(ruleId: string): Promise<MessageRule | null> {
    const supabase = await createClient()
    const { data, error } = await supabase.from("message_rules").select("*").eq("id", ruleId).single()

    if (error) {
      if (error.code === "PGRST116") return null
      throw new Error(`Failed to fetch message rule: ${error.message}`)
    }
    return data
  }

  static async findByName(propertyId: string, name: string, excludeId?: string): Promise<MessageRule | null> {
    const supabase = await createClient()
    let query = supabase.from("message_rules").select("*").eq("property_id", propertyId).eq("name", name)

    if (excludeId) {
      query = query.neq("id", excludeId)
    }

    const { data, error } = await query.maybeSingle()

    if (error) throw new Error(`Failed to check rule name: ${error.message}`)
    return data
  }

  static async findActiveRules(propertyId: string, now: string): Promise<MessageRule[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("message_rules")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order("priority", { ascending: false })

    if (error) throw new Error(`Failed to fetch active rules: ${error.message}`)
    return data || []
  }

  static async create(ruleData: CreateMessageRuleData): Promise<MessageRule> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("message_rules")
      .insert({
        ...ruleData,
        is_active: ruleData.is_active ?? false,
        priority: ruleData.priority ?? 10,
        max_impressions_per_session: ruleData.max_impressions_per_session ?? 1,
        max_impressions_per_day: ruleData.max_impressions_per_day ?? 3,
        target_pages: ruleData.target_pages ?? [],
        exclude_pages: ruleData.exclude_pages ?? [],
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to create message rule: ${error.message}`)
    return data
  }

  static async update(ruleId: string, ruleData: UpdateMessageRuleData): Promise<MessageRule> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("message_rules")
      .update({
        ...ruleData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ruleId)
      .select()
      .single()

    if (error) throw new Error(`Failed to update message rule: ${error.message}`)
    return data
  }

  static async delete(ruleId: string): Promise<void> {
    const supabase = await createClient()
    const { error } = await supabase.from("message_rules").delete().eq("id", ruleId)

    if (error) throw new Error(`Failed to delete message rule: ${error.message}`)
  }

  static async toggleActive(ruleId: string, isActive: boolean): Promise<MessageRule> {
    return this.update(ruleId, { is_active: isActive })
  }
}
