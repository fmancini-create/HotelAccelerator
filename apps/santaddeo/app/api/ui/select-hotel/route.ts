import { NextResponse, type NextRequest } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

// Force dynamic execution: this route writes a cookie based on the
// authenticated user and must never be cached.
export const dynamic = "force-dynamic"

/**
 * POST /api/ui/select-hotel
 *
 * Server-side cookie writer for the super-admin tenant switcher.
 *
 * Why this endpoint exists (FIX 30/04/2026 — incident "cambio struttura
 * da prenotazioni Massabo' non va, ricarica la pagina ma sempre come
 * Massabo'"):
 *
 * Previously the hotel context wrote the impersonation cookie via
 * `document.cookie = ...` and immediately navigated with
 * `window.location.href = ...`. In some browsers (Safari, Brave, older
 * Chrome) `document.cookie` is committed lazily on a microtask boundary;
 * the navigation fires before the cookie store is flushed and the next
 * request is sent with the previous (stale) cookie value.
 *
 * Effect: server-rendered layouts that read the cookie via `getSettingsData()`
 * keep returning the OLD hotel (e.g. Massabo'), even though the URL contains
 * `?hotel=NEW_ID` and the user clicked another tenant.
 *
 * Fix: scrivere il cookie tramite un endpoint server-side. Il browser persiste
 * il cookie come parte della response prima che il chiamante prosegua, quindi
 * la successiva navigation include sempre il valore aggiornato.
 *
 * Authorization:
 *  - super_admin: free choice across all hotels.
 *  - regular user: only hotels in their own organization.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUserOrDev()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const hotelId = body?.hotelId
    if (!hotelId || typeof hotelId !== "string") {
      return NextResponse.json({ error: "Missing hotelId" }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, organization_id")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const isSuperAdmin = profile.role === "super_admin"

    // Authorize the requested hotel
    let allowed = false
    if (isSuperAdmin) {
      const { data: hotel } = await supabase
        .from("hotels")
        .select("id")
        .eq("id", hotelId)
        .maybeSingle()
      allowed = !!hotel
    } else if (profile.organization_id) {
      const { data: hotel } = await supabase
        .from("hotels")
        .select("id")
        .eq("id", hotelId)
        .eq("organization_id", profile.organization_id)
        .maybeSingle()
      allowed = !!hotel
    }

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Set the cookie as part of the response. Path=/ so it applies to all
    // routes; SameSite=Lax so it survives top-level navigations; Secure
    // because the production site is HTTPS-only; HttpOnly is intentionally
    // OMITTED so the existing client code (and the in-memory React context)
    // can keep reading the cookie via document.cookie if needed.
    const response = NextResponse.json({ ok: true, hotelId })
    response.cookies.set("impersonated_hotel_id", hotelId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
    return response
  } catch (error) {
    console.error(
      "[v0] Error in POST /api/ui/select-hotel:",
      error instanceof Error ? error.message : error,
    )
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
