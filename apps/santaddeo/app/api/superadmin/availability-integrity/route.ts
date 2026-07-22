/**
 * API per il banner di allerta integrità DISPONIBILITÀ nella dashboard superadmin.
 *
 *   GET  -> lista alert APERTI (resolved_at IS NULL) da availability_integrity_alerts.
 *   POST -> risolve manualmente un alert ({ id }): imposta resolved_at + resolved_by.
 *
 * Popolata dal cron /api/cron/availability-integrity. Solo super_admin.
 * Speculare a /api/superadmin/pricing-integrity.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

async function assertSuperAdmin(): Promise<
  { ok: true; email: string | null } | { ok: false; status: number }
> {
  if (await isDevAuthAsync()) return { ok: true, email: "dev@preview" }
  const authClient = await createClient()
  const user = await getAuthUser(authClient)
  if (!user) return { ok: false, status: 401 }
  const supabase = await createServiceRoleClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
    return { ok: false, status: 403 }
  }
  return { ok: true, email: user.email ?? null }
}

export async function GET() {
  const auth = await assertSuperAdmin()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    )
  }
  try {
    const supabase = await createServiceRoleClient()
    const { data, error } = await supabase
      .from("availability_integrity_alerts")
      .select("id, kind, hotel_id, hotel_name, severity, detail, detected_at")
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
    if (error) throw error
    return NextResponse.json({ alerts: data || [] })
  } catch (error) {
    console.error("[availability-integrity API] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    )
  }
  try {
    const body = await request.json().catch(() => ({}))
    const id: string | undefined = body?.id
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing `id`" }, { status: 400 })
    }
    const supabase = await createServiceRoleClient()
    const { error } = await supabase
      .from("availability_integrity_alerts")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: auth.email || "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[availability-integrity API] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
