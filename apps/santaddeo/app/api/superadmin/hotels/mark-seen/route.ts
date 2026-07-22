import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * Segna come "visti" gli hotel appena registrati: azzera il pallino di avviso.
 * Chiamato quando il SuperAdmin apre il tab "Hotel" (come aprire la posta non
 * letta). Imposta superadmin_seen_at=now() su tutti gli hotel ancora NULL.
 */
export async function POST() {
  try {
    const { user, supabase } = await getAuthUserOrDev()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    let isSuperAdmin = (user as { role?: string }).role === "super_admin"
    if (!isSuperAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      isSuperAdmin = profile?.role === "super_admin"
    }
    if (!isSuperAdmin) return NextResponse.json({ ok: false }, { status: 403 })

    const { error } = await supabase
      .from("hotels")
      .update({ superadmin_seen_at: new Date().toISOString() })
      .is("superadmin_seen_at", null)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 })
  }
}
