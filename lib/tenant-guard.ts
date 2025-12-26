/**
 * Tenant Guard - Security layer for multitenant data access
 *
 * Provides runtime verification that all database operations are properly scoped to a tenant.
 * This is a defense-in-depth layer on top of RLS policies.
 */

import { createClient } from "@/lib/supabase/server"

export class TenantGuardError extends Error {
  constructor(
    message: string,
    public readonly propertyId: string,
    public readonly operation: string,
  ) {
    super(message)
    this.name = "TenantGuardError"
  }
}

/**
 * Verify that the current user has access to the specified property
 */
export async function verifyTenantAccess(propertyId: string): Promise<boolean> {
  if (!propertyId) {
    throw new TenantGuardError("Property ID is required", "", "verify")
  }

  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return false
  }

  // Check if user is a platform collaborator (super admin)
  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("id, role")
    .eq("email", user.email)
    .eq("is_active", true)
    .single()

  if (collaborator) {
    // Super admins have access to all properties
    return true
  }

  // Check if user is an admin for this specific property
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, role")
    .eq("email", user.email)
    .eq("property_id", propertyId)
    .single()

  return !!adminUser
}

/**
 * Assert tenant access - throws if access denied
 */
export async function assertTenantAccess(propertyId: string): Promise<void> {
  const hasAccess = await verifyTenantAccess(propertyId)

  if (!hasAccess) {
    throw new TenantGuardError(`Access denied to property ${propertyId}`, propertyId, "assert")
  }
}

/**
 * Wrap a query result to verify all returned records belong to the expected tenant
 */
export function verifyTenantData<T extends { property_id?: string }>(
  data: T[] | T | null,
  expectedPropertyId: string,
  operation: string,
): T[] | T | null {
  if (!data) return data

  const records = Array.isArray(data) ? data : [data]

  for (const record of records) {
    if (record.property_id && record.property_id !== expectedPropertyId) {
      // Log security incident
      console.error(`[SECURITY] Tenant data leak detected!`, {
        expectedPropertyId,
        actualPropertyId: record.property_id,
        operation,
        timestamp: new Date().toISOString(),
      })

      throw new TenantGuardError(
        "Data integrity violation: cross-tenant data access detected",
        expectedPropertyId,
        operation,
      )
    }
  }

  return data
}

/**
 * Helper to ensure property_id is always included in insert/update operations
 */
export function withPropertyId<T extends Record<string, unknown>>(
  data: T,
  propertyId: string,
): T & { property_id: string } {
  if (!propertyId) {
    throw new TenantGuardError("Property ID is required for data operations", "", "withPropertyId")
  }

  return {
    ...data,
    property_id: propertyId,
  }
}

/**
 * Validate that a query includes property_id filter
 */
export function validateTenantQuery(
  query: { property_id?: string },
  expectedPropertyId: string,
  operation: string,
): void {
  if (query.property_id !== expectedPropertyId) {
    throw new TenantGuardError(`Query must filter by property_id=${expectedPropertyId}`, expectedPropertyId, operation)
  }
}
