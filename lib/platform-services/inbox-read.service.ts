import { InboxReadRepository } from "@/lib/platform-repositories/inbox-read.repository"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ConversationListItem, ConversationDetail, ConversationListOptions } from "@/lib/types/inbox-read.types"
import { ValidationError } from "@/lib/errors"

export class InboxReadService {
  private repository: InboxReadRepository

  constructor(supabase: SupabaseClient) {
    this.repository = new InboxReadRepository(supabase)
  }

  async listConversations(propertyId: string, options: ConversationListOptions = {}): Promise<ConversationListItem[]> {
    let conversations = await this.repository.listConversations(propertyId, options)

    if (options.mode !== "gmail") {
      if (options.filter) {
        conversations = this.applyComplexFilter(conversations, options.filter)
      }
      conversations = this.sortByPriority(conversations)
    }

    return conversations
  }

  async getConversation(propertyId: string, conversationId: string): Promise<ConversationDetail | null> {
    if (!this.isValidUUID(conversationId)) {
      throw new ValidationError("Invalid conversation ID format")
    }
    return await this.repository.getConversation(propertyId, conversationId)
  }

  async getStats(propertyId: string): Promise<{
    total: number
    open: number
    closed: number
    archived: number
  }> {
    const counts = await this.repository.countByStatus(propertyId)
    return {
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      open: counts.open || 0,
      closed: counts.closed || 0,
      archived: counts.archived || 0,
    }
  }

  private applyComplexFilter(conversations: ConversationListItem[], filter: string): ConversationListItem[] {
    if (filter === "action_needed") {
      return conversations.filter((conv) => {
        const nextAction = conv.intelligence_summary?.next_action?.action
        return nextAction && !["await_response", "none"].includes(nextAction)
      })
    }
    if (filter === "high_priority") {
      return conversations.filter((conv) => conv.intelligence_summary?.next_action?.priority === "high")
    }
    return conversations
  }

  private sortByPriority(conversations: ConversationListItem[]): ConversationListItem[] {
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
    return [...conversations].sort((a, b) => {
      const aPriority = a.intelligence_summary?.next_action?.priority || "low"
      const bPriority = b.intelligence_summary?.next_action?.priority || "low"
      return priorityOrder[aPriority] - priorityOrder[bPriority]
    })
  }

  private isValidUUID(id: string): boolean {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return UUID_REGEX.test(id)
  }
}
