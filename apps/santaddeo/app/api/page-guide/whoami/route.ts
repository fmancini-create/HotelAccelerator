/**
 * Page Guide — whoami endpoint
 *
 * Restituisce in modo affidabile (server-side, cookie-bound) lo stato di
 * autenticazione dell'utente che apre la guida interattiva. Sostituisce il
 * vecchio check client-side via Supabase JS che era fragile su preview/v0
 * sandbox e in alcuni domini di produzione (cookie HttpOnly non leggibili).
 *
 * Bug fissato (02/05/2026): la chat dopo la prima risposta chiedeva nome+email
 * anche agli utenti gia' loggati perche' il check client-side falliva spesso e
 * `isAuthenticated` restava false. Ora il client si fida di questo endpoint.
 */
import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user, supabase } = await getAuthUserOrDev()

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 200 })
    }

    // Tentiamo di leggere il first_name dal profilo. Se la query fallisce
    // (RLS, profilo mancante) ricadiamo sui metadata Supabase e poi sull'email.
    let firstName = ""
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", user.id)
        .maybeSingle()
      if (profile?.first_name) firstName = profile.first_name
    } catch {
      /* ignore — fallback below */
    }

    if (!firstName) {
      const meta = (user as { user_metadata?: Record<string, unknown> })
        .user_metadata
      const metaFirst =
        (typeof meta?.first_name === "string" && meta.first_name) ||
        (typeof meta?.name === "string" && (meta.name as string).split(" ")[0]) ||
        ""
      firstName = metaFirst || (user.email?.split("@")[0] ?? "")
    }

    return NextResponse.json({
      authenticated: true,
      firstName,
      email: user.email ?? null,
    })
  } catch {
    // Mai bloccare la guida per errori auth — il client trattera' come anonimo.
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }
}
