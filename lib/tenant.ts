// ===========================================
// TENANT CONTEXT - Utility per multitenancy
// ===========================================

// Default property_id per Villa I Barronci (tenant #1)
export const DEFAULT_PROPERTY_ID = "c16ad260-2c34-4544-9909-5cd444773986"

/**
 * Ottiene il property_id dalla request
 * Priorità: header > query param > body > default
 */
export function getPropertyId(request: Request, body?: Record<string, unknown>): string {
  // 1. Check header X-Property-ID
  const headerPropertyId = request.headers.get("X-Property-ID")
  if (headerPropertyId) return headerPropertyId

  // 2. Check query param
  const url = new URL(request.url)
  const queryPropertyId = url.searchParams.get("property_id") || url.searchParams.get("tenant_id")
  if (queryPropertyId) return queryPropertyId

  // 3. Check body
  if (body?.property_id) return body.property_id as string
  if (body?.tenant_id) return body.tenant_id as string

  // 4. Default to Villa I Barronci
  return DEFAULT_PROPERTY_ID
}

/**
 * Valida che un property_id sia un UUID valido
 */
export function isValidPropertyId(propertyId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(propertyId)
}

/**
 * Aggiunge property_id a un oggetto per insert/update
 */
export function withPropertyId<T extends Record<string, unknown>>(
  data: T,
  propertyId: string,
): T & { property_id: string } {
  return { ...data, property_id: propertyId }
}

/**
 * Ottiene il property_id di default (Villa I Barronci)
 * Usato lato client dove non c'è Request
 */
export async function getDefaultPropertyId(): Promise<string> {
  return DEFAULT_PROPERTY_ID
}
