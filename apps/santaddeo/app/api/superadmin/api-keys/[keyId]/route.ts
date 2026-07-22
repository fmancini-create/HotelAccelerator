/**
 * PATCH /api/superadmin/api-keys/:keyId -- Toggle active/inactive
 * DELETE /api/superadmin/api-keys/:keyId -- Revoke (delete) key
 */

import { createServiceRoleClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = await createServiceRoleClient()
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  return profile
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ keyId: string }> }) {
  const user = await getAuthUser()
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { keyId } = await params
  const body = await req.json()
  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase
    .from("platform_api_keys")
    .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
    .eq("id", keyId)
    .select("id, is_active")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ keyId: string }> }) {
  const user = await getAuthUser()
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { keyId } = await params
  const supabase = await createServiceRoleClient()

  const { error } = await supabase
    .from("platform_api_keys")
    .delete()
    .eq("id", keyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
