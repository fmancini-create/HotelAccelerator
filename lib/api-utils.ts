/**
 * API Utilities - Common patterns for secure, rate-limited API routes
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  checkRateLimit,
  rateLimitExceeded,
  rateLimitHeaders,
  RATE_LIMITS,
  type RateLimitConfig,
} from "@/lib/rate-limiter"
import { verifyTenantAccess, TenantGuardError } from "@/lib/tenant-guard"

export interface ApiContext {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string; email: string }
  propertyId: string
}

export type ApiHandler = (context: ApiContext, request: Request) => Promise<Response>

interface CreateApiHandlerOptions {
  /** Rate limit configuration */
  rateLimit?: RateLimitConfig
  /** Whether to require property access verification */
  requirePropertyAccess?: boolean
  /** Custom property ID extractor */
  getPropertyId?: (request: Request) => Promise<string | null>
}

/**
 * Creates a secure API handler with authentication, rate limiting, and tenant verification
 */
export function createApiHandler(handler: ApiHandler, options: CreateApiHandlerOptions = {}) {
  const { rateLimit = RATE_LIMITS.read, requirePropertyAccess = true, getPropertyId } = options

  return async (request: Request): Promise<Response> => {
    try {
      // 1. Create Supabase client
      const supabase = await createClient()

      // 2. Verify authentication
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user || !user.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // 3. Get property ID
      let propertyId: string | null = null

      if (getPropertyId) {
        propertyId = await getPropertyId(request)
      } else {
        // Default: get from URL search params or body
        const url = new URL(request.url)
        propertyId = url.searchParams.get("propertyId")

        if (!propertyId && request.method !== "GET") {
          try {
            const body = await request.clone().json()
            propertyId = body.propertyId || body.property_id
          } catch {
            // Body parsing failed, continue without
          }
        }
      }

      if (requirePropertyAccess && !propertyId) {
        return NextResponse.json({ error: "Property ID is required" }, { status: 400 })
      }

      // 4. Rate limiting per tenant
      const rateLimitKey = propertyId ? `${propertyId}:${user.id}` : user.id

      const rateLimitResult = checkRateLimit(rateLimitKey, rateLimit)

      if (!rateLimitResult.success) {
        return rateLimitExceeded(rateLimitResult)
      }

      // 5. Verify tenant access
      if (requirePropertyAccess && propertyId) {
        const hasAccess = await verifyTenantAccess(propertyId)

        if (!hasAccess) {
          return NextResponse.json({ error: "Access denied to this property" }, { status: 403 })
        }
      }

      // 6. Execute handler
      const context: ApiContext = {
        supabase,
        user: { id: user.id, email: user.email },
        propertyId: propertyId || "",
      }

      const response = await handler(context, request)

      // Add rate limit headers to response
      const headers = new Headers(response.headers)
      Object.entries(rateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
        headers.set(key, value)
      })

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (error) {
      // Handle known errors
      if (error instanceof TenantGuardError) {
        console.error("[API] Tenant guard error:", error.message)
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }

      // Log unexpected errors
      console.error("[API] Unexpected error:", error)

      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}

/**
 * Helper for public API routes (no auth required, but rate limited)
 */
export function createPublicApiHandler(
  handler: (request: Request) => Promise<Response>,
  rateLimit: RateLimitConfig = RATE_LIMITS.embed,
) {
  return async (request: Request): Promise<Response> => {
    try {
      // Rate limit by IP or session
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"

      const rateLimitResult = checkRateLimit(`public:${ip}`, rateLimit)

      if (!rateLimitResult.success) {
        return rateLimitExceeded(rateLimitResult)
      }

      const response = await handler(request)

      // Add rate limit headers
      const headers = new Headers(response.headers)
      Object.entries(rateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
        headers.set(key, value)
      })

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (error) {
      console.error("[Public API] Error:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
