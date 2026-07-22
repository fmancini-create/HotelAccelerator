import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * Conteggio leggero degli hotel appena REGISTRATI e non ancora "visti" dal
 * SuperAdmin (hotels.superadmin_seen_at IS NULL). Alimenta il pallino di avviso
 * nella nav/dashboard superadmin, allo stesso modo dei feedback tenant.
 *
 * Usa getAuthUserOrDev cosi' funziona sia in produzione (auth cookie + RLS) sia
 * in preview/dev (super_admin simulato + service role). Polling client: 60s.
 */
export async function GET() {
  try {
    const { user, supabase } = await getAuthUserOrDev()
    if (!user) return NextResponse.json({ count: 0 })

    let isSuperAdmin = (user as { role?: string }).role === "super_admin"
    if (!isSuperAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      isSuperAdmin = profile?.role === "super_admin"
    }
    if (!isSuperAdmin) return NextResponse.json({ count: 0 })

    const { count, error } = await supabase
      .from("hotels")
      .select("*", { count: "exact", head: true })
      .is("superadmin_seen_at", null)
      .is("deleted_at", null)

    if (error) {
      // Soft fail: il badge di avviso e' UX non critica
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: count || 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
