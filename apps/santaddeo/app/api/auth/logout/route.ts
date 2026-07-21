import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST() {
  console.log("[v0] Logout API called")
  try {
    // createClient() is async and handles cookies internally
    const supabase = await createClient()
    console.log("[v0] Supabase client created, calling signOut...")

    // Sign out from Supabase
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error("[v0] Supabase signOut error:", error)
    } else {
      console.log("[v0] Supabase signOut successful")
    }

    // Create response with logout marker cookie
    const response = NextResponse.json(
      { message: "Logged out successfully" },
      { status: 200 }
    )
    
    // Set logout marker cookie via Response headers (more reliable than cookies().set())
    response.cookies.set("v0_logged_out", "true", {
      path: "/",
      maxAge: 60 * 5, // 5 minutes
      httpOnly: true,
      sameSite: "lax",
    })
    console.log("[v0] Logout marker cookie set via response")

    return response
  } catch (error) {
    console.error("[v0] Logout error:", error)
    return NextResponse.json(
      { error: "Failed to logout" },
      { status: 500 }
    )
  }
}
