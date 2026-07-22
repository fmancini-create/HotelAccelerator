import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { resolveLanding } from "@/lib/auth/resolve-landing"

/**
 * Restituisce la landing page corretta per l'utente autenticato dopo il login.
 * Usato dal client di login per instradare correttamente i venditori con
 * doppio ruolo (venditore + admin di struttura) verso il selettore di area.
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  // Affidabilita': subito dopo il login browser-side i cookie di sessione
  // possono non essere ancora propagati a questa richiesta server (race).
  // Se il client ci passa l'access token nell'header Authorization, validiamo
  // direttamente quello; altrimenti ricadiamo sui cookie.
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization")
  const bearer = authHeader && authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null

  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ path: "/auth/login", error: "not_authenticated" }, { status: 401 })
  }

  try {
    const admin = await createServiceRoleClient()

    // best-effort: aggiorna last_login_at
    await admin
      .from("profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id)

    const landing = await resolveLanding(admin, user.id)
    return NextResponse.json(landing)
  } catch (e) {
    console.error("[auth/resolve-landing] failed", e)
    // fallback sicuro: dashboard
    return NextResponse.json({
      path: "/dashboard",
      isSalesAgent: false,
      hasTenantAccess: false,
      isSuperAdmin: false,
      hotels: [],
    })
  }
}
