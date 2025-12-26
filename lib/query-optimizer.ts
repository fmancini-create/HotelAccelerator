/**
 * Query Optimizer
 *
 * Utilities for optimizing database queries in a multitenant environment.
 * Includes batch loading, pagination, and caching strategies.
 */

import { createClient } from "@/lib/supabase/server"

export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

/**
 * Standard pagination helper
 */
export function getPaginationRange(params: PaginationParams): { from: number; to: number } {
  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1
  return { from, to }
}

/**
 * Create paginated response
 */
export function createPaginatedResult<T>(data: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.pageSize)
  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages,
      hasMore: params.page < totalPages,
    },
  }
}

/**
 * Batch loader for preventing N+1 queries
 * Groups multiple IDs into a single query
 */
export class BatchLoader<T> {
  private pending: Map<string, { resolve: (value: T | null) => void; reject: (error: Error) => void }[]> = new Map()
  private cache: Map<string, T> = new Map()
  private scheduled = false

  constructor(
    private loadFn: (ids: string[]) => Promise<Map<string, T>>,
    private cacheMs = 60000,
  ) {}

  async load(id: string): Promise<T | null> {
    // Check cache first
    const cached = this.cache.get(id)
    if (cached) return cached

    return new Promise((resolve, reject) => {
      // Add to pending batch
      if (!this.pending.has(id)) {
        this.pending.set(id, [])
      }
      this.pending.get(id)!.push({ resolve, reject })

      // Schedule batch execution
      if (!this.scheduled) {
        this.scheduled = true
        setTimeout(() => this.executeBatch(), 0)
      }
    })
  }

  private async executeBatch() {
    this.scheduled = false

    const ids = Array.from(this.pending.keys())
    if (ids.length === 0) return

    try {
      const results = await this.loadFn(ids)

      // Resolve all pending promises
      for (const [id, callbacks] of this.pending.entries()) {
        const result = results.get(id) || null
        if (result) {
          this.cache.set(id, result)
          // Auto-expire cache
          setTimeout(() => this.cache.delete(id), this.cacheMs)
        }
        for (const { resolve } of callbacks) {
          resolve(result)
        }
      }
    } catch (error) {
      // Reject all pending promises
      for (const callbacks of this.pending.values()) {
        for (const { reject } of callbacks) {
          reject(error as Error)
        }
      }
    }

    this.pending.clear()
  }

  clearCache() {
    this.cache.clear()
  }
}

/**
 * Create a property batch loader
 */
export function createPropertyLoader() {
  return new BatchLoader<{ id: string; name: string; slug: string }>(async (ids) => {
    const supabase = await createClient()
    const { data } = await supabase.from("properties").select("id, name, slug").in("id", ids)

    const map = new Map()
    for (const item of data || []) {
      map.set(item.id, item)
    }
    return map
  })
}

/**
 * Create a contact batch loader
 */
export function createContactLoader(propertyId: string) {
  return new BatchLoader<{ id: string; email: string; name: string }>(async (ids) => {
    const supabase = await createClient()
    const { data } = await supabase
      .from("contacts")
      .select("id, email, name")
      .eq("property_id", propertyId)
      .in("id", ids)

    const map = new Map()
    for (const item of data || []) {
      map.set(item.id, item)
    }
    return map
  })
}

/**
 * Optimized query for conversations with messages
 * Uses single query with JSON aggregation instead of N+1
 */
export async function getConversationsWithLastMessage(
  propertyId: string,
  params: PaginationParams & { status?: string; channel?: string },
) {
  const supabase = await createClient()
  const { from, to } = getPaginationRange(params)

  let query = supabase
    .from("conversations")
    .select(
      `
      *,
      contact:contacts(id, email, name, phone),
      messages:messages(
        id, content, created_at, direction
      )
    `,
      { count: "exact" },
    )
    .eq("property_id", propertyId)
    .order("updated_at", { ascending: false })
    .order("created_at", { foreignTable: "messages", ascending: false })
    .limit(1, { foreignTable: "messages" })
    .range(from, to)

  if (params.status) {
    query = query.eq("status", params.status)
  }
  if (params.channel) {
    query = query.eq("channel", params.channel)
  }

  const { data, count, error } = await query

  if (error) throw error

  return createPaginatedResult(data || [], count || 0, params)
}

/**
 * Optimized stats query using single aggregation
 */
export async function getTenantStats(propertyId: string) {
  const supabase = await createClient()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString()

  // Single query with multiple counts
  const { data, error } = await supabase.rpc("get_tenant_stats", {
    p_property_id: propertyId,
    p_start_of_month: startOfMonth,
    p_start_of_week: startOfWeek,
  })

  if (error) {
    // Fallback to parallel queries if RPC doesn't exist
    const [conversations, messages, contacts, events] = await Promise.all([
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
      supabase.from("events").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
    ])

    return {
      totalConversations: conversations.count || 0,
      totalMessages: messages.count || 0,
      totalContacts: contacts.count || 0,
      totalEvents: events.count || 0,
    }
  }

  return data
}
