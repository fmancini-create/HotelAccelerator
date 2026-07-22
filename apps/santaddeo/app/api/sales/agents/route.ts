import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/agents
 * Lista agenti per il selettore (solo superadmin)
 */
export async function GET() {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const svc = await createServiceRoleClient()

  const { data: agents, error } = await svc
    .from("sales_agents")
    .select("id, display_name, email, is_active")
    .eq("is_active", true)
    .order("display_name", { ascending: true })

  if (error) {
    console.error("[sales/agents] GET error:", error)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  return NextResponse.json({ agents: agents || [] })
}
