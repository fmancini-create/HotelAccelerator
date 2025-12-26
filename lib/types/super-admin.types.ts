// Super Admin Domain Types

export type PlatformRole = "super_admin" | "support" | "viewer"
export type SubscriptionStatus = "active" | "trial" | "suspended" | "cancelled"
export type Plan = "trial" | "basic" | "pro" | "enterprise"

// Platform Collaborators
export interface PlatformCollaborator {
  id: string
  email: string
  name: string
  role: PlatformRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface CreateCollaboratorCommand {
  email: string
  name: string
  role: PlatformRole
}

export interface UpdateCollaboratorCommand {
  id: string
  name?: string
  role?: PlatformRole
}

// Structures (Tenants)
export interface Structure {
  id: string
  name: string
  slug: string
  domain: string | null
  subdomain: string | null
  custom_domain: string | null
  active_domain_type: string | null
  plan: Plan
  subscription_status: SubscriptionStatus
  status?: SubscriptionStatus
  users_count?: number
  trial_ends_at: string | null
  monthly_price_cents: number
  inbox_enabled: boolean
  cms_enabled: boolean
  ai_enabled: boolean
  frontend_enabled: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StructureWithStats extends Structure {
  admin_count: number
  conversation_count: number
  last_activity_at: string | null
}

export interface CreateStructureCommand {
  name: string
  slug: string
  plan: Plan
  trial_ends_at?: string | null
}

export interface UpdateStructureCommand {
  id: string
  name?: string
  plan?: Plan
  subscription_status?: SubscriptionStatus
  trial_ends_at?: string | null
  inbox_enabled?: boolean
  cms_enabled?: boolean
  ai_enabled?: boolean
}

// Activity & Stats
export interface CollaboratorActivity {
  collaborator_id: string
  command_type: string
  entity_type: string
  entity_id: string
  success: boolean
  created_at: string
  duration_ms: number | null
  error_code: string | null
}

export interface StructureUsageStats {
  property_id: string
  total_conversations: number
  total_messages: number
  total_write_commands: number
  total_errors: number
  error_rate: number
  last_30_days_commands: number
  last_activity_at: string | null
}
