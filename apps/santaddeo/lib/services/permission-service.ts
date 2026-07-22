import { createServerClient } from "@/lib/supabase/server"

export interface Feature {
  id: string
  code: string
  name: string
  description: string | null
  category: string
}

export interface UserPermission {
  feature_code: string
  is_allowed: boolean
  source: "role" | "override"
}

export class PermissionService {
  /**
   * Check if a user has permission to access a feature
   */
  static async hasPermission(userId: string, featureCode: string): Promise<boolean> {
    const supabase = await createServerClient()

    // Get user's profile with role
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single()

    if (!profile) return false

    if (profile.role === "super_admin") return true

    const { data: userPermission } = await supabase
      .from("user_permission_overrides")
      .select("is_allowed")
      .eq("user_id", userId)
      .eq("feature_code", featureCode)
      .maybeSingle()

    if (userPermission) {
      return userPermission.is_allowed
    }

    const { data: rolePermission } = await supabase
      .from("role_permissions")
      .select("is_allowed")
      .eq("role", profile.role)
      .eq("feature_code", featureCode)
      .maybeSingle()

    return rolePermission?.is_allowed ?? false
  }

  /**
   * Get all permissions for a user
   */
  static async getUserPermissions(userId: string): Promise<UserPermission[]> {
    const supabase = await createServerClient()

    // Get user's profile with role
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single()

    if (!profile) return []

    // Get all features
    const { data: features } = await supabase.from("features").select("*").order("category")

    if (!features) return []

    if (profile.role === "super_admin") {
      return features.map((f) => ({
        feature_code: f.code,
        is_allowed: true,
        source: "role" as const,
      }))
    }

    const { data: userOverrides } = await supabase
      .from("user_permission_overrides")
      .select("feature_code, is_allowed")
      .eq("user_id", userId)

    const overridesMap = new Map(userOverrides?.map((o) => [o.feature_code, o.is_allowed]) || [])

    const { data: rolePermissions } = await supabase
      .from("role_permissions")
      .select("feature_code, is_allowed")
      .eq("role", profile.role)

    const rolePermissionsMap = new Map(rolePermissions?.map((p) => [p.feature_code, p.is_allowed]) || [])

    // Combine permissions
    return features.map((feature) => {
      const hasOverride = overridesMap.has(feature.code)
      return {
        feature_code: feature.code,
        is_allowed: hasOverride ? overridesMap.get(feature.code)! : (rolePermissionsMap.get(feature.code) ?? false),
        source: hasOverride ? ("override" as const) : ("role" as const),
      }
    })
  }

  /**
   * Grant or revoke a permission for a user
   */
  static async setUserPermission(
    userId: string,
    featureCode: string,
    isAllowed: boolean,
    grantedBy: string,
    reason?: string,
  ): Promise<void> {
    const supabase = await createServerClient()

    const { data: feature } = await supabase.from("features").select("code").eq("code", featureCode).single()

    if (!feature) throw new Error("Feature not found")

    await supabase.from("user_permission_overrides").upsert(
      {
        user_id: userId,
        feature_code: featureCode,
        is_allowed: isAllowed,
        granted_by: grantedBy,
        reason,
      },
      {
        onConflict: "user_id,feature_code",
      },
    )
  }

  /**
   * Remove a user permission override (revert to role default)
   */
  static async removeUserPermission(userId: string, featureCode: string): Promise<void> {
    const supabase = await createServerClient()

    const { data: feature } = await supabase.from("features").select("code").eq("code", featureCode).single()

    if (!feature) throw new Error("Feature not found")

    await supabase.from("user_permission_overrides").delete().eq("user_id", userId).eq("feature_code", featureCode)
  }

  /**
   * Get all features grouped by category
   */
  static async getAllFeatures(): Promise<Record<string, Feature[]>> {
    const supabase = await createServerClient()

    const { data: features } = await supabase.from("features").select("*").order("category")

    if (!features) return {}

    return features.reduce(
      (acc, feature) => {
        if (!acc[feature.category]) {
          acc[feature.category] = []
        }
        acc[feature.category].push(feature)
        return acc
      },
      {} as Record<string, Feature[]>,
    )
  }
}
