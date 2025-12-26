/**
 * Tenant Quotas System
 *
 * Manages resource limits per tenant/property to prevent abuse
 * and ensure fair resource distribution across the platform.
 */

import { createClient } from "@/lib/supabase/server"

export interface TenantQuota {
  // Storage limits
  maxPhotosCount: number
  maxPhotoSizeMb: number
  maxTotalStorageMb: number

  // Content limits
  maxPagesCount: number
  maxSectionsPerPage: number

  // Communication limits
  maxEmailChannels: number
  maxConversationsPerMonth: number
  maxMessagesPerDay: number

  // Embed/Marketing limits
  maxEmbedScripts: number
  maxMessageRules: number
  maxEventsPerDay: number

  // Team limits
  maxAdminUsers: number
}

export interface TenantUsage {
  photosCount: number
  totalStorageMb: number
  pagesCount: number
  emailChannelsCount: number
  conversationsThisMonth: number
  messagesToday: number
  embedScriptsCount: number
  messageRulesCount: number
  eventsToday: number
  adminUsersCount: number
}

export interface QuotaCheckResult {
  allowed: boolean
  resource: string
  current: number
  limit: number
  message?: string
}

// Default quotas per plan
export const PLAN_QUOTAS: Record<string, TenantQuota> = {
  free: {
    maxPhotosCount: 50,
    maxPhotoSizeMb: 5,
    maxTotalStorageMb: 500,
    maxPagesCount: 10,
    maxSectionsPerPage: 10,
    maxEmailChannels: 1,
    maxConversationsPerMonth: 100,
    maxMessagesPerDay: 50,
    maxEmbedScripts: 2,
    maxMessageRules: 5,
    maxEventsPerDay: 1000,
    maxAdminUsers: 2,
  },
  starter: {
    maxPhotosCount: 200,
    maxPhotoSizeMb: 10,
    maxTotalStorageMb: 2000,
    maxPagesCount: 50,
    maxSectionsPerPage: 20,
    maxEmailChannels: 3,
    maxConversationsPerMonth: 500,
    maxMessagesPerDay: 200,
    maxEmbedScripts: 10,
    maxMessageRules: 20,
    maxEventsPerDay: 10000,
    maxAdminUsers: 5,
  },
  professional: {
    maxPhotosCount: 1000,
    maxPhotoSizeMb: 20,
    maxTotalStorageMb: 10000,
    maxPagesCount: 200,
    maxSectionsPerPage: 50,
    maxEmailChannels: 10,
    maxConversationsPerMonth: 2000,
    maxMessagesPerDay: 1000,
    maxEmbedScripts: 50,
    maxMessageRules: 100,
    maxEventsPerDay: 100000,
    maxAdminUsers: 20,
  },
  enterprise: {
    maxPhotosCount: 10000,
    maxPhotoSizeMb: 50,
    maxTotalStorageMb: 100000,
    maxPagesCount: 1000,
    maxSectionsPerPage: 100,
    maxEmailChannels: 50,
    maxConversationsPerMonth: 50000,
    maxMessagesPerDay: 10000,
    maxEmbedScripts: 200,
    maxMessageRules: 500,
    maxEventsPerDay: 1000000,
    maxAdminUsers: 100,
  },
}

/**
 * Get quotas for a tenant based on their plan
 */
export async function getTenantQuotas(propertyId: string): Promise<TenantQuota> {
  const supabase = await createClient()

  const { data: property } = await supabase.from("properties").select("plan").eq("id", propertyId).single()

  const plan = property?.plan || "free"
  return PLAN_QUOTAS[plan] || PLAN_QUOTAS.free
}

/**
 * Get current usage for a tenant
 */
export async function getTenantUsage(propertyId: string): Promise<TenantUsage> {
  const supabase = await createClient()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  // Parallel queries for efficiency
  const [
    photosResult,
    pagesResult,
    emailChannelsResult,
    conversationsResult,
    messagesTodayResult,
    embedScriptsResult,
    messageRulesResult,
    eventsTodayResult,
    adminUsersResult,
  ] = await Promise.all([
    supabase.from("photos").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
    supabase.from("cms_pages").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
    supabase.from("email_channels").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .gte("created_at", startOfMonth),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .gte("created_at", startOfDay),
    supabase.from("embed_scripts").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
    supabase.from("message_rules").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .gte("created_at", startOfDay),
    supabase.from("admin_users").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
  ])

  return {
    photosCount: photosResult.count || 0,
    totalStorageMb: 0, // TODO: Calculate from blob storage
    pagesCount: pagesResult.count || 0,
    emailChannelsCount: emailChannelsResult.count || 0,
    conversationsThisMonth: conversationsResult.count || 0,
    messagesToday: messagesTodayResult.count || 0,
    embedScriptsCount: embedScriptsResult.count || 0,
    messageRulesCount: messageRulesResult.count || 0,
    eventsToday: eventsTodayResult.count || 0,
    adminUsersCount: adminUsersResult.count || 0,
  }
}

/**
 * Check if a specific action is allowed based on quotas
 */
export async function checkQuota(
  propertyId: string,
  resource: keyof TenantUsage,
  increment = 1,
): Promise<QuotaCheckResult> {
  const [quotas, usage] = await Promise.all([getTenantQuotas(propertyId), getTenantUsage(propertyId)])

  const limitMap: Record<keyof TenantUsage, keyof TenantQuota> = {
    photosCount: "maxPhotosCount",
    totalStorageMb: "maxTotalStorageMb",
    pagesCount: "maxPagesCount",
    emailChannelsCount: "maxEmailChannels",
    conversationsThisMonth: "maxConversationsPerMonth",
    messagesToday: "maxMessagesPerDay",
    embedScriptsCount: "maxEmbedScripts",
    messageRulesCount: "maxMessageRules",
    eventsToday: "maxEventsPerDay",
    adminUsersCount: "maxAdminUsers",
  }

  const limitKey = limitMap[resource]
  const current = usage[resource]
  const limit = quotas[limitKey]
  const allowed = current + increment <= limit

  return {
    allowed,
    resource,
    current,
    limit,
    message: allowed
      ? undefined
      : `Quota exceeded for ${resource}: ${current}/${limit}. Upgrade your plan for higher limits.`,
  }
}

/**
 * Get full quota status for dashboard display
 */
export async function getQuotaStatus(propertyId: string): Promise<{
  quotas: TenantQuota
  usage: TenantUsage
  percentages: Record<string, number>
  warnings: string[]
}> {
  const [quotas, usage] = await Promise.all([getTenantQuotas(propertyId), getTenantUsage(propertyId)])

  const percentages: Record<string, number> = {
    photos: Math.round((usage.photosCount / quotas.maxPhotosCount) * 100),
    pages: Math.round((usage.pagesCount / quotas.maxPagesCount) * 100),
    emailChannels: Math.round((usage.emailChannelsCount / quotas.maxEmailChannels) * 100),
    conversations: Math.round((usage.conversationsThisMonth / quotas.maxConversationsPerMonth) * 100),
    messages: Math.round((usage.messagesToday / quotas.maxMessagesPerDay) * 100),
    embedScripts: Math.round((usage.embedScriptsCount / quotas.maxEmbedScripts) * 100),
    messageRules: Math.round((usage.messageRulesCount / quotas.maxMessageRules) * 100),
    events: Math.round((usage.eventsToday / quotas.maxEventsPerDay) * 100),
    adminUsers: Math.round((usage.adminUsersCount / quotas.maxAdminUsers) * 100),
  }

  const warnings: string[] = []
  for (const [key, percentage] of Object.entries(percentages)) {
    if (percentage >= 90) {
      warnings.push(`${key} usage at ${percentage}% - consider upgrading`)
    } else if (percentage >= 75) {
      warnings.push(`${key} usage at ${percentage}%`)
    }
  }

  return { quotas, usage, percentages, warnings }
}
