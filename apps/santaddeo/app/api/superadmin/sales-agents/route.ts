import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

export const dynamic = "force-dynamic"

// Elenca tutti i venditori (sales_agent). Solo SuperAdmin.
export async function GET() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createServiceRoleClient()
  if (!isV0Preview) {
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "sales_agent")
    .order("full_name", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agents: data || [] })
}
