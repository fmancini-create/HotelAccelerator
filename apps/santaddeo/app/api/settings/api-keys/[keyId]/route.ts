/**
 * Tenant API Key detail operations
 * PATCH: Toggle active/inactive
 * DELETE: Revoke (hard delete)
 */

import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

async function getAuthUserWithOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = await createClient()
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single()

  if (!profile?.organization_id) return null
  return profile
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const user = await getAuthUserWithOrg()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { keyId } = await params
  const supabase = await createClient()

  // Verify ownership
  const { data: key } = await supabase
    .from("platform_api_keys")
    .select("id, is_active, organization_id")
    .eq("id", keyId)
    .eq("organization_id", user.organization_id)
    .single()

  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { error } = await supabase
    .from("platform_api_keys")
    .update({ is_active: !key.is_active, updated_at: new Date().toISOString() })
    .eq("id", keyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, is_active: !key.is_active })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const user = await getAuthUserWithOrg()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { keyId } = await params
  const supabase = await createClient()

  // Verify ownership before delete
  const { data: key } = await supabase
    .from("platform_api_keys")
    .select("id, organization_id")
    .eq("id", keyId)
    .eq("organization_id", user.organization_id)
    .single()

  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { error } = await supabase
    .from("platform_api_keys")
    .delete()
    .eq("id", keyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
