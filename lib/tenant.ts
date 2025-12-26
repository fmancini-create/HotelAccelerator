// ===========================================
// TENANT CONTEXT - Utility per multitenancy
// ===========================================

// ===========================================
// TENANT CONTEXT - DEPRECATED
// ===========================================
// WARNING: This file contains deprecated multi-tenancy utilities.
// Use lib/auth-property.ts for secure property_id resolution.
// ===========================================

/**
 * @deprecated Use isValidPropertyId from lib/auth-property.ts
 * Validates that a property_id is a valid UUID format
 */
export function isValidPropertyId(propertyId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(propertyId)
}

/**
 * @deprecated Use withPropertyId from lib/auth-property.ts
 * Aggiunge property_id a un oggetto per insert/update
 */
export function withPropertyId<T extends Record<string, unknown>>(
  data: T,
  propertyId: string,
): T & { property_id: string } {
  return { ...data, property_id: propertyId }
}
