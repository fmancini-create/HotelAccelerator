import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId")
  
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }
  
  try {
    const supabase = await createClient()
    
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle()
    
    if (error) {
      console.error("[user-role] Error fetching profile:", error)
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 })
    }
    
    return NextResponse.json({ role: profile?.role || null })
  } catch (err) {
    console.error("[user-role] Unexpected error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
