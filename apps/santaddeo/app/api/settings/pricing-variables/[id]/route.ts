import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// Toggle is_active for pricing variables (accessible by admin/manager, not just superadmin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Always use service role for admin operations on pricing_variables
    // Auth check is done separately
    const supabase = await createClient()
    console.log("[v0] pricing-variables PUT - using service role for id:", id)
    
    // In production, verify user has admin/manager role
    const isDev = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development"
    if (!isDev) {
      const authClient = await createClient()
      const { data: { user }, error: authError } = await authClient.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      if (!profile || !["superadmin", "super_admin", "admin", "manager"].includes(profile.role)) {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
      }
    }

    const body = await request.json()

    // Only allow toggling is_active from this endpoint (security)
    if (body.is_active === undefined) {
      return NextResponse.json({ error: "Solo il campo is_active puo' essere modificato" }, { status: 400 })
    }

    const { data: updatedVariable, error } = await supabase
      .from("pricing_variables")
      .update({
        is_active: body.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error toggling pricing variable:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ variable: updatedVariable })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
