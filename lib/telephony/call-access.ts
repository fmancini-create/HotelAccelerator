import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { CallerIdentity } from "@/lib/auth/admin-access"

export type CallVisibilityScope = "own" | "groups" | "selected" | "all"

export type CallAccess = {
  scope: CallVisibilityScope
  canReadTranscripts: boolean
  canListenRecordings: boolean
  userIds: string[]
  extensions: string[]
  inherited: boolean
}

const RANK: Record<Exclude<CallVisibilityScope, "selected">, number> = {
  own: 0,
  groups: 1,
  all: 2,
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))]
}

export async function resolveCallAccess(
  db: SupabaseClient,
  identity: CallerIdentity & { propertyId: string },
): Promise<CallAccess> {
  if (identity.isSuperAdmin || identity.isTenantAdmin) {
    return {
      scope: "all",
      canReadTranscripts: true,
      canListenRecordings: true,
      userIds: [],
      extensions: [],
      inherited: false,
    }
  }

  const viewerUserId = identity.adminUserId
  if (!viewerUserId) {
    return {
      scope: "own",
      canReadTranscripts: false,
      canListenRecordings: false,
      userIds: [],
      extensions: [],
      inherited: false,
    }
  }

  const { data: ownRule } = await db
    .from("user_call_access")
    .select("visibility_scope, can_read_transcripts, can_listen_recordings")
    .eq("property_id", identity.propertyId)
    .eq("user_id", viewerUserId)
    .maybeSingle()

  let scope: CallVisibilityScope = "own"
  let canReadTranscripts = true
  let canListenRecordings = false
  let inherited = !ownRule
  let targetGroupIds: string[] = []
  let targetUserIds: string[] = [viewerUserId]

  const { data: memberships } = await db
    .from("user_group_members")
    .select("group_id, user_groups!inner(property_id)")
    .eq("user_id", viewerUserId)
    .eq("user_groups.property_id", identity.propertyId)
  const ownGroupIds = unique((memberships ?? []).map((m: any) => m.group_id))

  if (ownRule) {
    scope = ownRule.visibility_scope as CallVisibilityScope
    canReadTranscripts = ownRule.can_read_transcripts !== false
    canListenRecordings = ownRule.can_listen_recordings === true

    if (scope === "groups") targetGroupIds = ownGroupIds
    if (scope === "selected") {
      const [selectedUsers, selectedGroups] = await Promise.all([
        db
          .from("user_call_access_users")
          .select("target_user_id")
          .eq("property_id", identity.propertyId)
          .eq("viewer_user_id", viewerUserId),
        db
          .from("user_call_access_groups")
          .select("target_group_id")
          .eq("property_id", identity.propertyId)
          .eq("viewer_user_id", viewerUserId),
      ])
      targetUserIds = unique([viewerUserId, ...(selectedUsers.data ?? []).map((r: any) => r.target_user_id)])
      targetGroupIds = unique((selectedGroups.data ?? []).map((r: any) => r.target_group_id))
    }
  } else if (ownGroupIds.length > 0) {
    const { data: groupRules } = await db
      .from("group_call_access")
      .select("group_id, visibility_scope, can_read_transcripts, can_listen_recordings")
      .eq("property_id", identity.propertyId)
      .in("group_id", ownGroupIds)

    const rules = groupRules ?? []
    if (rules.length > 0) {
      const best = [...rules].sort(
        (a: any, b: any) => RANK[(b.visibility_scope as keyof typeof RANK) ?? "own"] - RANK[(a.visibility_scope as keyof typeof RANK) ?? "own"],
      )[0] as any
      scope = (best.visibility_scope as CallVisibilityScope) || "own"
      canReadTranscripts = rules.some((r: any) => r.can_read_transcripts !== false)
      canListenRecordings = rules.some((r: any) => r.can_listen_recordings === true)
      if (scope === "groups") targetGroupIds = ownGroupIds
    }
  }

  if (scope === "all") {
    return { scope, canReadTranscripts, canListenRecordings, userIds: [], extensions: [], inherited }
  }

  if (targetGroupIds.length > 0) {
    const { data: members } = await db
      .from("user_group_members")
      .select("user_id, user_groups!inner(property_id)")
      .in("group_id", targetGroupIds)
      .eq("user_groups.property_id", identity.propertyId)
    targetUserIds = unique([viewerUserId, ...targetUserIds, ...(members ?? []).map((m: any) => m.user_id)])
  }

  const [personalExtensions, groupExtensions] = await Promise.all([
    targetUserIds.length
      ? db
          .from("telephony_user_extensions")
          .select("extension")
          .eq("property_id", identity.propertyId)
          .in("user_id", targetUserIds)
      : Promise.resolve({ data: [] as Array<{ extension: string | null }> }),
    targetGroupIds.length
      ? db
          .from("telephony_extension_labels")
          .select("extension")
          .eq("property_id", identity.propertyId)
          .in("group_id", targetGroupIds)
      : Promise.resolve({ data: [] as Array<{ extension: string | null }> }),
  ])

  return {
    scope,
    canReadTranscripts,
    canListenRecordings,
    userIds: unique(targetUserIds),
    extensions: unique([
      ...(personalExtensions.data ?? []).map((r: any) => String(r.extension || "")),
      ...(groupExtensions.data ?? []).map((r: any) => String(r.extension || "")),
    ]),
    inherited,
  }
}

export function applyCallAccess<T>(query: T, access: CallAccess): T {
  if (access.scope === "all") return query

  const clauses: string[] = []
  if (access.userIds.length > 0) clauses.push(`user_id.in.(${access.userIds.join(",")})`)
  if (access.extensions.length > 0) clauses.push(`extension.in.(${access.extensions.join(",")})`)

  const q = query as unknown as { or: (filter: string) => T; eq: (column: string, value: unknown) => T }
  if (clauses.length === 0) {
    return q.eq("user_id", "00000000-0000-0000-0000-000000000000")
  }
  return q.or(clauses.join(","))
}
