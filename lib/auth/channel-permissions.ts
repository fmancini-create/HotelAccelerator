export type ChannelCapability = "read" | "write" | "manage"

export interface TenantChannelRef {
  channel_type: string
  channel_id: string
}

export interface DirectChannelAssignment extends TenantChannelRef {
  can_receive?: boolean | null
  can_send?: boolean | null
}

export interface GroupChannelPermission {
  channel_type: string
  channel_id?: string | null
  can_read?: boolean | null
  can_write?: boolean | null
  can_manage?: boolean | null
}

export interface EffectiveChannelGrant extends TenantChannelRef {
  can_read: boolean
  can_write: boolean
  can_manage: boolean
}

function key(channelType: string, channelId: string): string {
  return `${channelType}:${channelId}`
}

/**
 * Combines direct assignments and inherited group permissions.
 *
 * Security rules:
 * - only channels in `tenantChannels` can be granted;
 * - `channel_id = null` is a legacy wildcard for channels of that type, but
 *   still only inside the current tenant;
 * - multiple groups are additive;
 * - direct assignments preserve their historical semantics and remain full
 *   channel assignments for backward compatibility.
 */
export function resolveEffectiveChannelGrants(params: {
  tenantChannels: TenantChannelRef[]
  directAssignments?: DirectChannelAssignment[] | null
  groupPermissions?: GroupChannelPermission[] | null
}): EffectiveChannelGrant[] {
  const tenantByType = new Map<string, Set<string>>()
  const tenantKeys = new Set<string>()

  for (const channel of params.tenantChannels) {
    tenantKeys.add(key(channel.channel_type, channel.channel_id))
    const ids = tenantByType.get(channel.channel_type) ?? new Set<string>()
    ids.add(channel.channel_id)
    tenantByType.set(channel.channel_type, ids)
  }

  const grants = new Map<string, EffectiveChannelGrant>()

  function apply(
    channelType: string,
    channelId: string,
    requested: { read?: boolean | null; write?: boolean | null; manage?: boolean | null },
  ) {
    const grantKey = key(channelType, channelId)
    if (!tenantKeys.has(grantKey)) return

    const write = requested.write === true
    const manage = requested.manage === true
    const read = requested.read === true || write || manage
    if (!read && !write && !manage) return

    const current = grants.get(grantKey) ?? {
      channel_type: channelType,
      channel_id: channelId,
      can_read: false,
      can_write: false,
      can_manage: false,
    }

    current.can_read ||= read
    current.can_write ||= write
    current.can_manage ||= manage
    grants.set(grantKey, current)
  }

  for (const assignment of params.directAssignments ?? []) {
    const canRead = assignment.can_receive !== false
    const canWrite = assignment.can_send !== false
    apply(assignment.channel_type, assignment.channel_id, {
      read: canRead,
      write: canWrite,
      manage: true,
    })
  }

  for (const permission of params.groupPermissions ?? []) {
    const targetIds = permission.channel_id
      ? [permission.channel_id]
      : Array.from(tenantByType.get(permission.channel_type) ?? [])

    for (const channelId of targetIds) {
      apply(permission.channel_type, channelId, {
        read: permission.can_read,
        write: permission.can_write,
        manage: permission.can_manage,
      })
    }
  }

  return Array.from(grants.values())
}

export function hasChannelCapability(
  grants: EffectiveChannelGrant[],
  channelType: string,
  channelId: string,
  capability: ChannelCapability,
): boolean {
  const grant = grants.find((row) => row.channel_type === channelType && row.channel_id === channelId)
  if (!grant) return false
  if (capability === "manage") return grant.can_manage
  if (capability === "write") return grant.can_write
  return grant.can_read
}
