/**
 * Monitoring utilities for tenant health and performance tracking
 *
 * In production, integrate with:
 * - Vercel Analytics
 * - Sentry for error tracking
 * - Custom metrics dashboard
 */

export interface TenantMetrics {
  propertyId: string
  timestamp: number

  // Request metrics
  requestCount: number
  errorCount: number
  avgResponseTime: number

  // Resource usage
  dbQueryCount: number
  storageUsedBytes: number

  // Business metrics
  conversationCount: number
  messageCount: number
  eventCount: number
}

// In-memory metrics store (replace with Redis in production)
const metricsStore = new Map<string, TenantMetrics>()

/**
 * Track a request for a tenant
 */
export function trackRequest(propertyId: string, responseTimeMs: number, isError = false): void {
  const existing = metricsStore.get(propertyId) || createEmptyMetrics(propertyId)

  existing.requestCount++
  if (isError) existing.errorCount++

  // Rolling average
  existing.avgResponseTime =
    (existing.avgResponseTime * (existing.requestCount - 1) + responseTimeMs) / existing.requestCount
  existing.timestamp = Date.now()

  metricsStore.set(propertyId, existing)
}

/**
 * Track database queries
 */
export function trackDbQuery(propertyId: string, count = 1): void {
  const existing = metricsStore.get(propertyId) || createEmptyMetrics(propertyId)
  existing.dbQueryCount += count
  existing.timestamp = Date.now()
  metricsStore.set(propertyId, existing)
}

/**
 * Get metrics for a tenant
 */
export function getTenantMetrics(propertyId: string): TenantMetrics | null {
  return metricsStore.get(propertyId) || null
}

/**
 * Get all tenant metrics (for admin dashboard)
 */
export function getAllTenantMetrics(): TenantMetrics[] {
  return Array.from(metricsStore.values())
}

/**
 * Check if a tenant is experiencing issues
 */
export function checkTenantHealth(propertyId: string): {
  healthy: boolean
  issues: string[]
} {
  const metrics = metricsStore.get(propertyId)
  const issues: string[] = []

  if (!metrics) {
    return { healthy: true, issues: [] }
  }

  // Error rate > 10%
  if (metrics.requestCount > 10 && metrics.errorCount / metrics.requestCount > 0.1) {
    issues.push(`High error rate: ${((metrics.errorCount / metrics.requestCount) * 100).toFixed(1)}%`)
  }

  // Slow responses > 2s average
  if (metrics.avgResponseTime > 2000) {
    issues.push(`Slow responses: ${metrics.avgResponseTime.toFixed(0)}ms average`)
  }

  // High DB query count (potential N+1)
  if (metrics.dbQueryCount > metrics.requestCount * 10) {
    issues.push(`High DB query ratio: ${(metrics.dbQueryCount / metrics.requestCount).toFixed(1)} queries/request`)
  }

  return {
    healthy: issues.length === 0,
    issues,
  }
}

/**
 * Reset metrics (call periodically)
 */
export function resetMetrics(propertyId?: string): void {
  if (propertyId) {
    metricsStore.delete(propertyId)
  } else {
    metricsStore.clear()
  }
}

function createEmptyMetrics(propertyId: string): TenantMetrics {
  return {
    propertyId,
    timestamp: Date.now(),
    requestCount: 0,
    errorCount: 0,
    avgResponseTime: 0,
    dbQueryCount: 0,
    storageUsedBytes: 0,
    conversationCount: 0,
    messageCount: 0,
    eventCount: 0,
  }
}

/**
 * Log important security events
 */
export function logSecurityEvent(event: {
  type: "auth_failure" | "rate_limit" | "tenant_violation" | "suspicious_activity"
  propertyId?: string
  userId?: string
  ip?: string
  details: string
}): void {
  console.error(
    "[SECURITY]",
    JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
    }),
  )

  // In production, send to:
  // - Sentry
  // - Security dashboard
  // - Alert system
}
