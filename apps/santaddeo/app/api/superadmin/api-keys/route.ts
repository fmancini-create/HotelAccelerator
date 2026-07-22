/**
 * SuperAdmin API Keys management
 * GET: Lista tutte le API keys (superadmin) o per org
 * POST: Genera una nuova API key
 */

import { createServiceRoleClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = await createServiceRoleClient()
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single()

  return profile
}

export async function GET() {
  const user = await getAuthUser()
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase
    .from("platform_api_keys")
    .select(`
      id, name, key_prefix, scopes, allowed_ips, is_active,
      last_used_at, expires_at, rate_limit_per_minute, created_at,
      organization_id
    `)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with org names
  const orgIds = [...new Set((data || []).map((k) => k.organization_id))]
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", orgIds)

  const orgMap = new Map((orgs || []).map((o) => [o.id, o.name]))

  const enriched = (data || []).map((k) => ({
    ...k,
    organization_name: orgMap.get(k.organization_id) || "Sconosciuta",
  }))

  return NextResponse.json({ data: enriched })
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, organization_id, scopes, expires_in_days, rate_limit_per_minute } = body

    if (!name || !organization_id || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json({
        error: "name, organization_id, and scopes[] are required"
      }, { status: 400 })
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

    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from("platform_api_keys")
      .insert({
        name,
        organization_id,
        scopes,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        is_active: true,
        expires_at: expiresAt,
        rate_limit_per_minute: rate_limit_per_minute || 100,
        created_by: user.id,
      })
      .select("id, name, key_prefix, scopes, is_active, expires_at, created_at")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Return the plain key ONCE -- it cannot be retrieved again
    return NextResponse.json({
      data: { ...data, plain_key: plainKey },
      warning: "Store this key securely. It will NOT be shown again.",
    }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
