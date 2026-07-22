/**
 * Tenant API Keys management
 * GET: Lista le API keys dell'organizzazione dell'utente corrente
 * POST: Genera una nuova API key per la propria organizzazione
 */

import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function getAuthUserWithOrg(hotelId?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = await createClient()
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single()

  if (!profile) return null

  // If a hotelId is provided, resolve the organization_id from that hotel
  // This fixes the bug where consultants with cross-org access always see
  // the API keys of their first organization instead of the selected hotel's org
  let resolvedOrgId = profile.organization_id
  if (hotelId) {
    const { data: hotel } = await serviceClient
      .from("hotels")
      .select("organization_id")
      .eq("id", hotelId)
      .single()
    if (hotel?.organization_id) {
      resolvedOrgId = hotel.organization_id
    }
  }

  if (!resolvedOrgId) return null
  return { ...profile, organization_id: resolvedOrgId }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const hotelId = searchParams.get("hotelId")
  const user = await getAuthUserWithOrg(hotelId)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("platform_api_keys")
    .select(`
      id, name, key_prefix, key_encrypted, scopes, allowed_ips, is_active,
      last_used_at, expires_at, rate_limit_per_minute, created_at
    `)
    .eq("organization_id", user.organization_id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data || [] })
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const hotelId = searchParams.get("hotelId")
  const user = await getAuthUserWithOrg(hotelId)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, scopes, expires_in_days } = body

    if (!name || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json({
        error: "name and scopes[] are required"
      }, { status: 400 })
    }

    // Sanitize scopes: trim whitespace, remove empty strings, remove stray semicolons
    const cleanScopes = scopes
      .map((s: string) => s.trim().replace(/;/g, ""))
      .filter((s: string) => s.length > 0)

    // Tenant allowed scopes: all read + write scopes defined in API_SCOPES
    const TENANT_ALLOWED_SCOPES = [
      "hotels:read", "hotels:write",
      "bookings:read", "bookings:write",
      "production:read",
      "fiscal:read",
      "availability:read",
      "guests:read",
      "channels:read",
      "webhooks:read", "webhooks:write",
    ]
    const invalidScopes = cleanScopes.filter((s: string) => !TENANT_ALLOWED_SCOPES.includes(s))
    if (invalidScopes.length > 0) {
      return NextResponse.json({
        error: `Scopes non consentiti: ${invalidScopes.join(", ")}`,
      }, { status: 403 })
    }

    // Generate the key
    const randomBytes = new Uint8Array(32)
    crypto.getRandomValues(randomBytes)
    const keyBody = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("")
    const plainKey = `sk_live_${keyBody}`
    const keyHash = await sha256(plainKey)
    const keyPrefix = plainKey.slice(0, 12)

    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
      : null

    const supabase = await createClient()

    // Limit: max 10 keys per organization
    const { count } = await supabase
      .from("platform_api_keys")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", user.organization_id)

    if ((count || 0) >= 10) {
      return NextResponse.json({
        error: "Limite massimo di 10 API keys per organizzazione raggiunto"
      }, { status: 429 })
    }

    const { data, error } = await supabase
      .from("platform_api_keys")
      .insert({
        name,
        organization_id: user.organization_id,
        scopes: cleanScopes,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        key_encrypted: plainKey,
        is_active: true,
        expires_at: expiresAt,
        rate_limit_per_minute: 60,
        created_by: user.id,
      })
      .select("id, name, key_prefix, key_encrypted, scopes, is_active, expires_at, created_at")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: { ...data, plain_key: plainKey },
    }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
