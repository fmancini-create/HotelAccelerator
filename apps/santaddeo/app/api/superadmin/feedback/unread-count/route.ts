import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * Conteggio leggero dei feedback dei tenant (suggerimenti / problemi) ancora
 * "aperti", cioe' non ancora presi in carico dal SuperAdmin. Usato dalla nav
 * superadmin e dalla dashboard per mostrare un avviso quando un tenant invia
 * una nuova segnalazione, senza dover caricare l'intera lista.
 *
 * Usa getAuthUserOrDev (come /api/user-feedback) cosi' funziona sia in
 * produzione (auth via cookie + RLS) sia in preview/dev (utente super_admin
 * simulato + service role). Polling consigliato dal client: ogni 60 secondi.
 */
export async function GET() {
  try {
    const { user, supabase } = await getAuthUserOrDev()
    if (!user) return NextResponse.json({ count: 0 })

    // Verifica ruolo super_admin: in dev l'utente simulato ha gia' il ruolo,
    // in produzione lo leggiamo dal profilo.
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
      .from("user_feedback")
      .select("*", { count: "exact", head: true })
      .eq("status", "open")

    if (error) {
      // Soft fail: il badge di avviso e' UX non critica
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: count || 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
