import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { NextResponse } from "next/server"

// Security: uses cookie-based auth client (respects RLS)
export const dynamic = "force-dynamic"

export async function GET() {
  // FIX 30/05/2026 (incident "Onboarding Consulenza manda al login dalla
  // chat"): in preview (v0 chat / localhost) non esiste una sessione
  // Supabase, quindi getUser() e' null e questa API rispondeva
  // { redirect: "/auth/login" }. La pagina /accelerator/dashboard segue
  // quel redirect, e /accelerator/onboarding ci passa via
  // router.replace("/accelerator") -> tutto il ramo Accelerator finiva al
  // login in anteprima. In preview usiamo il service role client (bypassa
  // RLS) e saltiamo il guard sessione, come fa la dashboard principale.
  const isV0Preview = await isDevAuthAsync()

  // Bypass SUPER_ADMIN (17/07/2026): lo staff 4BID deve poter ENTRARE nella hub
  // Accelerator anche per strutture SENZA subscription (es. hotel di test come
  // Superlusso), senza essere rimandato a /accelerator/activate. Coerente col
  // resto del sistema che gia' sblocca i super_admin: hasAddon() (pace/rate-
  // shopper/commercial-balance), la pricing page e la nav header
  // (effectiveSuperAdmin). Qui era l'UNICO punto rimasto a fare da gate.
  let isSuperAdmin = false
  if (!isV0Preview) {
    const cookieClient = await createClient()
    const { data: { user } } = await cookieClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ redirect: "/auth/login" })
    }
    const { data: profile } = await cookieClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    isSuperAdmin = profile?.role === "super_admin" || profile?.role === "superadmin"
  }

  // Preview e super_admin usano il service role (vedono TUTTE le subscription
  // attive, non solo quelle consentite da RLS). Gli altri restano su RLS.
  const supabase = isV0Preview || isSuperAdmin ? await createServiceRoleClient() : await createClient()

  const { data: subscriptions } = await supabase
    .from("accelerator_subscriptions")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  // Per i tenant normali senza abbonamento -> pagina di attivazione.
  // Il super_admin (e la preview) NON viene mai rimandato: vede la hub anche
  // vuota, cosi' puo' comunque raggiungere i moduli sbloccati.
  if ((!subscriptions || subscriptions.length === 0) && !isSuperAdmin && !isV0Preview) {
    return NextResponse.json({ redirect: "/accelerator/activate" })
  }

  // Fetch hotels separately
  const hotelIds = [...new Set(subscriptions.map((s) => s.hotel_id).filter(Boolean))]
  const { data: hotels } = await supabase.from("hotels").select("*").in("id", hotelIds)

  // Attach hotels to subscriptions
  const subscriptionsWithHotels = subscriptions.map((sub) => ({
    ...sub,
    hotel: hotels?.find((h) => h.id === sub.hotel_id) || null,
  }))

  return NextResponse.json({ subscriptions: subscriptionsWithHotels })
}
