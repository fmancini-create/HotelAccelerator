import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"

export async function GET() {
  // BUG FIX 30/04/2026: probe pubblica della presenza della funzione exec_sql.
  // Util per attaccanti che cercano vulnerabilita': risponde "exists: true"
  // senza autenticazione. Super_admin gate.
  const denied = await requireSuperAdmin()
  if (denied) return denied

  console.log("[v0] Check exec_sql function API called")

  try {
    const supabase = await createClient()
    console.log("[v0] Service role client created")

    // Try to call the exec_sql function with a simple query
    const { data, error } = await supabase.rpc("exec_sql", {
      sql_query: "SELECT 1",
    })

    if (error) {
      console.log("[v0] exec_sql function does not exist:", error.message)
      return NextResponse.json({ exists: false, error: error.message })
    }

    console.log("[v0] exec_sql function exists and works")
    return NextResponse.json({ exists: true })
  } catch (error: any) {
    console.error("[v0] Error checking exec_sql function:", error)
    return NextResponse.json({ exists: false, error: error.message }, { status: 500 })
  }
}
