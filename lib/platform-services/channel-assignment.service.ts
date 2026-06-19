import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Generic per-user channel assignments, valid for ANY channel type
 * (email / whatsapp / telegram / chat / ...). Writes the unified
 * `channel_user_assignments` table consumed by the inbox access enforcement
 * and the Gmail channel resolver.
 */
export type ChannelType = "email" | "whatsapp" | "telegram" | "chat" | "instagram" | "facebook"

export interface ChannelAssignmentRow {
  user_id: string
  assignment_type: string
  can_send: boolean
  can_receive: boolean
  receives_notifications: boolean
}

export class ChannelAssignmentService {
  constructor(private supabase: SupabaseClient) {}

  async listAssignments(channelType: ChannelType, channelId: string): Promise<ChannelAssignmentRow[]> {
    const { data, error } = await this.supabase
      .from("channel_user_assignments")
      .select("user_id, assignment_type, can_send, can_receive, receives_notifications")
      .eq("channel_type", channelType)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })

    if (error) throw error
    return (data || []) as ChannelAssignmentRow[]
  }

  async listUserIds(channelType: ChannelType, channelId: string): Promise<string[]> {
    const rows = await this.listAssignments(channelType, channelId)
    return rows.map((r) => r.user_id)
  }

  /**
   * Replaces the full set of users assigned to a channel. The first user in the
   * list is marked as 'owner', the rest as 'member' (mirrors the legacy email behaviour).
   */
  async setAssignments(
    propertyId: string,
    channelType: ChannelType,
    channelId: string,
    userIds: string[],
  ): Promise<void> {
    await this.supabase
      .from("channel_user_assignments")
      .delete()
      .eq("channel_type", channelType)
      .eq("channel_id", channelId)

    if (userIds.length > 0) {
      const rows = userIds.map((userId, index) => ({
        property_id: propertyId,
        channel_type: channelType,
        channel_id: channelId,
        user_id: userId,
        assignment_type: index === 0 ? "owner" : "member",
      }))

      const { error } = await this.supabase.from("channel_user_assignments").insert(rows)
      if (error) throw error
    }
  }

  /** Adds a single user to a channel (idempotent), without removing existing ones. */
  async addAssignment(
    propertyId: string,
    channelType: ChannelType,
    channelId: string,
    userId: string,
    assignmentType: "owner" | "member" = "member",
  ): Promise<void> {
    const { error } = await this.supabase.from("channel_user_assignments").upsert(
      {
        property_id: propertyId,
        channel_type: channelType,
        channel_id: channelId,
        user_id: userId,
        assignment_type: assignmentType,
      },
      { onConflict: "channel_type,channel_id,user_id" },
    )
    if (error) throw error
  }
}
