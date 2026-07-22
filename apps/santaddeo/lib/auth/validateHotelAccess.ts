import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { createClient as createSvcClient } from "@supabase/supabase-js"
import { getSellerHotelPermissions } from "@/lib/sales/revman-access"

const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
  return key
}

/**
 * Livello di accesso venditore consentito su una route hotel.
 * - 'metrics' -> basta il permesso Metriche (KPI/analytics sola lettura)
 * - 'full'    -> serve il permesso Dashboard completa (moduli avanzati)
 */
export type AllowSellerLevel = "metrics" | "full"

/**
 * Validates that the authenticated user has access to the given hotelId.
 * - Returns null if access is granted (super_admin or matching hotel_id).
 * - Returns a NextResponse error (401/403) if access is denied.
 *
 * Usage in API routes:
 *   const denied = await validateHotelAccess(hotelId)
 *   if (denied) return denied
 *
 * PERF 03/05/2026: la signature accetta ora un parametro opzionale
 * `preauthedUser`. Quando il route ha gia' chiamato `getAuthUserOrDev()` puo'
 * passare il `user` qui per evitare un secondo `auth.getUser()` duplicato
 * (1 round-trip a Supabase Auth in meno, ~100-200ms su ogni request,
 * pagati anche con cache hit). Backwards-compatible: senza il parametro il
 * comportamento e' invariato.
 */
export async function validateHotelAccess(
  hotelId: string,
  preauthedUser?: { id: string } | null,
  options?: { allowSeller?: AllowSellerLevel }
): Promise<NextResponse | null> {
  try {
    // In v0 sandbox / dev, skip auth check (no real Supabase session exists).
    // Same pattern used by dashboard-content.tsx for demo user.
    const isDev = await isDevAuthAsync()
    if (isDev) {
      console.log("[validateHotelAccess] DEV bypass for hotel:", hotelId)
      return null // Access granted in dev
    }

    // Resolve user: preferiamo il `preauthedUser` se passato, altrimenti
    // facciamo il round-trip ad auth.getUser() come prima.
    let user = preauthedUser ?? null
    if (!user) {
      const supabase = await createClient()
      const { data: { user: u }, error: authError } = await supabase.auth.getUser()
      if (authError || !u) {
        console.log("[validateHotelAccess] No auth user:", { authError: authError?.message })
        return NextResponse.json(
          { error: "Non autenticato" },
          { status: 401 }
        )
      }
      user = u
    }

    // Fetch profile with role and organization_id using service role
    // (avoids RLS issues on profiles table)
    const profileRes = await fetch(
      `${PROD_URL}/rest/v1/profiles?select=role,organization_id&id=eq.${user.id}`,
      {
        headers: {
          apikey: getServiceKey(),
          Authorization: `Bearer ${getServiceKey()}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (!profileRes.ok) {
      return NextResponse.json(
        { error: "Errore nel recupero profilo" },
        { status: 500 }
      )
    }

    const profiles = await profileRes.json()
    const profile = profiles?.[0]

    if (!profile) {
      return NextResponse.json(
        { error: "Profilo non trovato" },
        { status: 403 }
      )
    }

    // Super admin can access all hotels
    if (profile.role === "super_admin" || profile.role === "superadmin") {
      return null
    }

    // --- Check 1: NEW system - hotel_users junction table ---
    // Allows a user to be associated with multiple hotels
    const hotelUserRes = await fetch(
      `${PROD_URL}/rest/v1/hotel_users?select=id&user_id=eq.${user.id}&hotel_id=eq.${hotelId}&limit=1`,
      {
        headers: {
          apikey: getServiceKey(),
          Authorization: `Bearer ${getServiceKey()}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (hotelUserRes.ok) {
      const hotelUserRows = await hotelUserRes.json()
      if (hotelUserRows?.length > 0) {
        return null // Access granted via hotel_users
      }
    }

    // --- Check 2: OLD system - profiles.organization_id -> hotels.organization_id ---
    // Backwards compatibility: check if the hotel belongs to the user's organization
    if (profile.organization_id) {
      const hotelOrgRes = await fetch(
        `${PROD_URL}/rest/v1/hotels?select=id&id=eq.${hotelId}&organization_id=eq.${profile.organization_id}&limit=1`,
        {
          headers: {
            apikey: getServiceKey(),
            Authorization: `Bearer ${getServiceKey()}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      )

      if (hotelOrgRes.ok) {
        const hotelOrgRows = await hotelOrgRes.json()
        if (hotelOrgRows?.length > 0) {
          return null // Access granted via organization
        }
      }
    }

    // --- Check 2.5: MULTI-STRUTTURA - user_property_map ---
    // Assegnazione esplicita fatta dal super admin nel dialog "Gestisci
    // strutture". E' la stessa tabella che popola il selettore hotel della
    // dashboard (getSettingsData): senza questo check l'utente vedrebbe la
    // struttura nel menu ma riceverebbe 403 sulle pagine /dati e /settings.
    const propMapRes = await fetch(
      `${PROD_URL}/rest/v1/user_property_map?select=hotel_id&user_id=eq.${user.id}&hotel_id=eq.${hotelId}&limit=1`,
      {
        headers: {
          apikey: getServiceKey(),
          Authorization: `Bearer ${getServiceKey()}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (propMapRes.ok) {
      const propMapRows = await propMapRes.json()
      if (propMapRows?.length > 0) {
        return null // Access granted via user_property_map
      }
    }

    // --- Check 3: VENDITORE (opt-in via options.allowSeller) ---
    // Le dashboard dati sono pensate per il proprietario, ma un venditore con
    // accesso RevMan e il permesso adeguato puo' vederle in sola lettura per le
    // strutture a lui associate/concesse. Gate per livello:
    //   'metrics' -> view_metrics ; 'full' -> view_full_dashboard.
    if (options?.allowSeller) {
      try {
        const svc = createSvcClient(PROD_URL, getServiceKey(), {
          auth: { persistSession: false },
        })
        const perms = await getSellerHotelPermissions(svc, user.id, hotelId)
        if (perms) {
          const ok =
            options.allowSeller === "full" ? perms.view_full_dashboard : perms.view_metrics
          if (ok) {
            return null // Access granted via seller permission
          }
        }
      } catch (e) {
        console.log("[validateHotelAccess] seller check error:", (e as Error)?.message)
      }
    }

    // Neither system granted access
    return NextResponse.json(
      { error: "Accesso non autorizzato a questa struttura" },
      { status: 403 }
    )
  } catch (error) {
    console.error("[validateHotelAccess] Error:", error)
    return NextResponse.json(
      { error: "Errore di autenticazione" },
      { status: 500 }
    )
  }
}
