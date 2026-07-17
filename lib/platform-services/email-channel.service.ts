import type { SupabaseClient } from "@supabase/supabase-js"
import { EmailChannelRepository } from "@/lib/platform-repositories/email-channel.repository"
import type { EmailChannel } from "@/lib/platform-repositories/email-channel.repository"
import { ValidationError, AuthorizationError, NotFoundError, ConflictError } from "@/lib/errors"
import { CommandLogger } from "@/lib/logging/command-log"
import { ChannelAssignmentService } from "@/lib/platform-services/channel-assignment.service"

export interface ChannelWithAssignments extends EmailChannel {
  assignments: { user_id: string; user_name?: string }[]
}

export interface CreateChannelRequest {
  email_address: string
  display_name: string | null
  is_active: boolean
  assigned_users: string[]
  color?: string | null
}

export interface UpdateChannelRequest {
  email_address: string
  display_name: string | null
  is_active: boolean
  assigned_users: string[]
  color?: string | null
}

export class EmailChannelService {
  private repository: EmailChannelRepository
  private assignments: ChannelAssignmentService

  constructor(private supabase: SupabaseClient) {
    this.repository = new EmailChannelRepository(supabase)
    this.assignments = new ChannelAssignmentService(supabase)
    CommandLogger.initialize(supabase)
  }

  async listChannels(propertyId: string): Promise<ChannelWithAssignments[]> {
    const channels = await this.repository.listByProperty(propertyId)
    const channelsWithAssignments = await Promise.all(
      channels.map(async (channel) => {
        const assignments = await this.assignments.listAssignments("email", channel.id)
        return {
          ...channel,
          assignments: assignments.map((a) => ({ user_id: a.user_id })),
        }
      }),
    )
    return channelsWithAssignments
  }

  async getChannel(channelId: string, propertyId: string): Promise<ChannelWithAssignments | null> {
    const channel = await this.repository.findById(channelId)
    if (!channel) return null
    if (channel.property_id !== propertyId) {
      throw new AuthorizationError("Non autorizzato ad accedere a questo canale")
    }
    const assignments = await this.assignments.listAssignments("email", channel.id)
    return {
      ...channel,
      assignments: assignments.map((a) => ({ user_id: a.user_id })),
    }
  }

  async createChannel(propertyId: string, data: CreateChannelRequest): Promise<ChannelWithAssignments> {
    if (!data.email_address || !data.email_address.includes("@")) {
      throw new ValidationError("Indirizzo email non valido")
    }

    const existing = await this.repository.findByEmail(data.email_address)
    if (existing) {
      throw new ConflictError("Questo indirizzo email è già configurato")
    }

    const channel = await this.repository.create({
      property_id: propertyId,
      name: data.display_name || data.email_address,
      email_address: data.email_address,
      display_name: data.display_name,
      is_active: data.is_active,
      provider: "manual",
      color: data.color ?? null,
    })

    await CommandLogger.logIntent("system", propertyId, "channel.email.create", "email_channel", channel.id, {
      email: data.email_address,
    })

    if (data.assigned_users.length > 0) {
      await this.assignments.setAssignments(propertyId, "email", channel.id, data.assigned_users)
    }

    // "Mail di default": if a tenant user has this mailbox as their own login
    // email, ensure they are assigned (owner) even if not selected manually.
    try {
      const { data: ownUser } = await this.supabase
        .from("admin_users")
        .select("id")
        .eq("property_id", propertyId)
        .ilike("email", data.email_address)
        .maybeSingle()
      if (ownUser?.id) {
        await this.assignments.addAssignment(propertyId, "email", channel.id, ownUser.id, "owner")
      }
    } catch (err) {
      console.error("[v0] Auto-assign mailbox owner failed:", err)
    }

    const assignments = await this.assignments.listAssignments("email", channel.id)
    return {
      ...channel,
      assignments: assignments.map((a) => ({ user_id: a.user_id })),
    }
  }

  async updateChannel(
    channelId: string,
    propertyId: string,
    data: UpdateChannelRequest,
  ): Promise<ChannelWithAssignments> {
    const channel = await this.repository.findById(channelId)
    if (!channel) {
      throw new NotFoundError("Canale non trovato")
    }
    if (channel.property_id !== propertyId) {
      throw new AuthorizationError("Non autorizzato a modificare questo canale")
    }

    if (!data.email_address || !data.email_address.includes("@")) {
      throw new ValidationError("Indirizzo email non valido")
    }

    if (data.email_address !== channel.email_address) {
      const existing = await this.repository.findByEmail(data.email_address)
      if (existing && existing.id !== channelId) {
        throw new ConflictError("Questo indirizzo email è già configurato")
      }
    }

    const updated = await this.repository.update(channelId, {
      email_address: data.email_address,
      display_name: data.display_name,
      is_active: data.is_active,
      ...(data.color !== undefined ? { color: data.color } : {}),
    })

    await this.assignments.setAssignments(propertyId, "email", channelId, data.assigned_users)

    await CommandLogger.logIntent("system", propertyId, "channel.email.update", "email_channel", channelId, {
      email: data.email_address,
    })

    const assignments = await this.assignments.listAssignments("email", channelId)
    return {
      ...updated,
      assignments: assignments.map((a) => ({ user_id: a.user_id })),
    }
  }

  async deleteChannel(channelId: string, propertyId: string): Promise<void> {
    const channel = await this.repository.findById(channelId)
    if (!channel) {
      throw new NotFoundError("Canale non trovato")
    }
    if (channel.property_id !== propertyId) {
      throw new AuthorizationError("Non autorizzato a eliminare questo canale")
    }

    await this.repository.delete(channelId)

    await CommandLogger.logIntent("system", propertyId, "channel.email.delete", "email_channel", channelId, {
      email: channel.email_address,
    })
  }

  async testConnection(channelId: string, propertyId: string): Promise<{ success: boolean; message: string }> {
    const channel = await this.repository.findById(channelId)
    if (!channel) {
      throw new NotFoundError("Canale non trovato")
    }
    if (channel.property_id !== propertyId) {
      throw new AuthorizationError("Non autorizzato a testare questo canale")
    }

    return {
      success: true,
      message: "Connessione verificata correttamente",
    }
  }

  async upsertOAuthChannel(
    propertyId: string,
    provider: "gmail" | "outlook",
    email: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
  ): Promise<void> {
    const existing = await this.repository.findByEmail(email)
    if (existing) {
      await this.repository.update(existing.id, {
        provider,
        oauth_access_token: accessToken,
        oauth_refresh_token: refreshToken,
        oauth_expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
        is_active: true,
      })
    } else {
      await this.repository.create({
        property_id: propertyId,
        name: email,
        email_address: email,
        display_name: email,
        is_active: true,
        provider,
        oauth_access_token: accessToken,
        oauth_refresh_token: refreshToken,
        oauth_expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
      })
    }
  }

  async toggleChannelStatus(channelId: string, propertyId: string): Promise<ChannelWithAssignments> {
    const channel = await this.repository.findById(channelId)
    if (!channel) {
      throw new NotFoundError("Canale non trovato")
    }
    if (channel.property_id !== propertyId) {
      throw new AuthorizationError("Non autorizzato a modificare questo canale")
    }

    const updated = await this.repository.update(channelId, {
      is_active: !channel.is_active,
    })

    const assignments = await this.assignments.listAssignments("email", channelId)
    return {
      ...updated,
      assignments: assignments.map((a) => ({ user_id: a.user_id })),
    }
  }
}
