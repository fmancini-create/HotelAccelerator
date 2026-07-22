import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

/**
 * Conteggio leggero delle conversazioni della chat guida non ancora viste
 * dal SuperAdmin. Usato dal menu superadmin per mostrare il pallino rosso
 * accanto al tab "Comunicazioni" senza dover caricare l'intera lista.
 *
 * Polling consigliato dal client: ogni 30-60 secondi.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ count: 0 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "super_admin") {
      return NextResponse.json({ count: 0 })
    }

    // RLS bypass: la tabella ha policy "scrittura/lettura solo via
    // service-role" (vedi memoria 02/05/2026 — la chat guida deve poter
    // scrivere anche per visitatori anonimi). Auth gia' verificato sopra.
    const svc = await createServiceRoleClient()

    const { count, error } = await svc
      .from("page_guide_conversations")
      .select("*", { count: "exact", head: true })
      .eq("has_unread_for_admin", true)

    if (error) {
      // Soft fail: il pallino rosso e' UX non critica
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: count || 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
