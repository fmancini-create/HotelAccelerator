import { createServiceRoleClient } from "@/lib/supabase/server"

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "sync"
  | "import"
  | "export"
  | "invite"
  | "accept_invite"
  | "change_role"
  | "activate_subscription"
  | "deactivate_subscription"

export type AuditResourceType =
  | "user"
  | "organization"
  | "hotel"
  | "booking"
  | "rate"
  | "room_type"
  | "availability"
  | "subscription"
  | "invitation"
  | "sync_job"
  | "pms_integration"
  | "alert_rule"
  | "system_setting"

export interface AuditLogParams {
  userId: string
  action: AuditAction
  resourceType: AuditResourceType
  resourceId?: string
  organizationId?: string
  hotelId?: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  metadata?: Record<string, any>
}

export async function logAuditEvent(params: AuditLogParams): Promise<string | null> {
  try {
    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase.rpc("log_audit_event", {
      p_user_id: params.userId,
      p_action: params.action,
      p_resource_type: params.resourceType,
      p_resource_id: params.resourceId || null,
      p_organization_id: params.organizationId || null,
      p_hotel_id: params.hotelId || null,
      p_old_values: params.oldValues || null,
      p_new_values: params.newValues || null,
      p_metadata: params.metadata || null,
    })

    if (error) {
      console.error("Failed to log audit event:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("Error in audit logging:", error)
    return null
  }
}

// Helper function to get audit logs for an organization
export async function getAuditLogs(options: {
  organizationId?: string
  hotelId?: string
  userId?: string
  action?: AuditAction
  resourceType?: AuditResourceType
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}) {
  const supabase = await createServiceRoleClient()

  let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false })

  if (options.organizationId) {
    query = query.eq("organization_id", options.organizationId)
  }
  if (options.hotelId) {
    query = query.eq("hotel_id", options.hotelId)
  }
  if (options.userId) {
    query = query.eq("user_id", options.userId)
  }
  if (options.action) {
    query = query.eq("action", options.action)
  }
  if (options.resourceType) {
    query = query.eq("resource_type", options.resourceType)
  }
  if (options.startDate) {
    query = query.gte("created_at", options.startDate.toISOString())
  }
  if (options.endDate) {
    query = query.lte("created_at", options.endDate.toISOString())
  }
  if (options.limit) {
    query = query.limit(options.limit)
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) {
    console.error("Failed to fetch audit logs:", error)
    return []
  }

  return data
}
