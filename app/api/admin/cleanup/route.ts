import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Delete from auth.users
    const { data: users } = await supabaseAdmin.auth.admin.listUsers()
    const userToDelete = users.users.find((u) => u.email === email)

    if (userToDelete) {
      await supabaseAdmin.auth.admin.deleteUser(userToDelete.id)
    }

    // Delete from admin_users
    await supabaseAdmin.from("admin_users").delete().eq("email", email)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Cleanup error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
