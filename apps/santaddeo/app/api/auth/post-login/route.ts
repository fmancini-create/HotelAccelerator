import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

    const supabase = await createClient()

    // Verify the caller is authenticated and matches the userId
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use service role client to bypass RLS for profile update
    const adminClient = await createClient()
    const { error } = await adminClient.from("profiles").update({
      last_login_at: new Date().toISOString(),
    }).eq("id", userId)

    if (error) {
      console.error("[post-login] Failed to update last_login_at:", error.message)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
