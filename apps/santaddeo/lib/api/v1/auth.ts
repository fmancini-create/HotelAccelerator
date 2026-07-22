/**
 * Platform API v1 -- Authentication
 *
 * Ogni richiesta a /api/v1/* deve avere l'header:
 *   Authorization: Bearer sk_live_<token>
 *
 * Il token viene hashato (SHA-256) e confrontato con key_hash in platform_api_keys.
 * Se valido, restituisce organization_id + scopes + hotel_ids accessibili.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { type ApiScope, hasScope } from "./scopes"
import type { NextRequest } from "next/server"

export interface ApiKeyContext {
  keyId: string
  organizationId: string
  scopes: string[]
  hotelIds: string[]
  rateLimitPerMinute: number
}

/**
 * Hash SHA-256 di una stringa (per confrontare il token con key_hash).
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Autentica una richiesta API e verifica lo scope richiesto.
 *
 * @returns ApiKeyContext se autenticata, oppure un oggetto errore { error, status }
 */
export async function authenticateApiKey(
  req: NextRequest,
  requiredScope: ApiScope
): Promise<ApiKeyContext | { error: string; status: number }> {
  // 1. Estrai il token: supporta Authorization: Bearer, X-API-Key header, e ?api_key= query param
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || ""
  const xApiKey = req.headers.get("x-api-key") || req.headers.get("X-Api-Key") || ""
  const queryApiKey = req.nextUrl.searchParams.get("api_key") || ""

  let token = ""
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim()
  } else if (xApiKey) {
    token = xApiKey.trim()
  } else if (queryApiKey) {
    token = queryApiKey.trim()
  }

  if (!token) {
    console.error("[v1/auth] No API key found. Authorization:", authHeader ? `"${authHeader.substring(0, 20)}..."` : "(empty)",
      "X-API-Key:", xApiKey ? "present" : "absent", "query api_key:", queryApiKey ? "present" : "absent")
    return { error: "Missing or invalid Authorization header. Use: Bearer sk_live_<token>", status: 401 }
  }
  if (!token || !token.startsWith("sk_live_")) {
    return { error: "Invalid API key format. Keys start with sk_live_", status: 401 }
  }

  // 2. Hash il token e cerca nel DB
  const hash = await sha256(token)
  const supabase = await createServiceRoleClient()

  const { data: keyRecord, error: keyError } = await supabase
    .from("platform_api_keys")
    .select("id, organization_id, scopes, allowed_ips, is_active, expires_at, rate_limit_per_minute")
    .eq("key_hash", hash)
    .maybeSingle()

  if (keyError || !keyRecord) {
    return { error: "Invalid API key", status: 401 }
  }

  // 3. Verifiche di validita'
  if (!keyRecord.is_active) {
    return { error: "API key is disabled", status: 403 }
  }

  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return { error: "API key has expired", status: 403 }
  }

  // 4. IP allowlist (se configurato)
  if (keyRecord.allowed_ips && keyRecord.allowed_ips.length > 0) {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || ""
    if (!keyRecord.allowed_ips.includes(clientIp)) {
      return { error: "IP not allowed", status: 403 }
    }
  }

  // 5. Verifica scope
  if (!hasScope(keyRecord.scopes, requiredScope)) {
    return { error: `Insufficient scope. Required: ${requiredScope}`, status: 403 }
  }

  // 6. Trova gli hotel dell'organizzazione
  const { data: hotels } = await supabase
    .from("hotels")
    .select("id")
    .eq("organization_id", keyRecord.organization_id)

  const hotelIds = (hotels || []).map((h) => h.id)

  // 7. Aggiorna last_used_at (fire and forget)
  supabase
    .from("platform_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id)
    .then(() => {})

  return {
    keyId: keyRecord.id,
    organizationId: keyRecord.organization_id,
    scopes: keyRecord.scopes,
    hotelIds,
    rateLimitPerMinute: keyRecord.rate_limit_per_minute,
  }
}

/**
 * Helper: verifica che un hotel_id richiesto appartenga all'organizzazione autenticata.
 */
export function assertHotelAccess(ctx: ApiKeyContext, hotelId: string): { error: string; status: number } | null {
  if (!ctx.hotelIds.includes(hotelId)) {
    return { error: `Hotel ${hotelId} not found or not accessible with this API key`, status: 404 }
  }
  return null
}
