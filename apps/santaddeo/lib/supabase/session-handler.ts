import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { getPublicSupabaseConfig } from "@/lib/supabase/server"

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getPublicSupabaseConfig()

// Routes that require authentication - redirect to login if no session
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/dashboard-v2",
  "/dashboard-v3",
  "/dati",
  "/accelerator",
  "/calendar",
  "/occupancy",
  "/settings",
  "/superadmin",
  "/admin",
  "/onboarding",
  "/sales",
  // Tour guidato / Modalita' Demo: route top-level accessibile sia ai tenant
  // (property_admin/sub_user) sia ai venditori. Richiede login ma NON e' in
  // HOTEL_AREA_PREFIXES, cosi' un sales_agent non viene rediretto a /sales.
  // Vive fuori da /sales apposta: dentro /sales erediterebbe il layout CRM
  // Venditori (header venditori) e i tenant verrebbero respinti.
  "/demo",
  "/api/dashboard",
  "/api/dati",
  "/api/accelerator",
  "/api/sales",
]

// Routes che sono "hotel-area": un sales_agent NON deve poterle aprire
// perche' contengono dati operativi degli hotel (dashboard KPI, calendario,
// settings PMS, ecc.) e mostrano avvisi tipo "PMS non configurato" che
// hanno senso solo per gli hotel manager. Quando un sales_agent prova ad
// accedere a uno di questi, lo redirigiamo silenziosamente a /sales.
//
// NB: NON includiamo /superadmin (un agent puo' anche essere superadmin)
// ne' /sales (la sua area), ne' /api/* (gli API hanno gia' i loro guard).
const HOTEL_AREA_PREFIXES = [
  "/dashboard",
  "/dashboard-v2",
  "/dashboard-v3",
  "/dati",
  "/accelerator",
  "/calendar",
  "/occupancy",
  "/settings",
  "/onboarding",
]

// Routes that should never be blocked
const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/sign-up",
  "/auth/reset-password",
  "/login",
  "/api/auth",
  "/api/cron",
  "/api/v1",
  "/api/webhooks",
  // FIX 06/05/2026 sera (incident "process-pricing-queue 401 da
  // vercel-cron"): questa rotta vive sotto /api/accelerator/ per ragioni
  // storiche (originariamente era una API utente, poi promossa a cron
  // dedicato), MA /api/accelerator e' in PROTECTED_PREFIXES. Il middleware
  // intercettava la chiamata cron (header Authorization: Bearer
  // <CRON_SECRET> ma NESSUN cookie utente) e ritornava 401 JSON prima che
  // il route handler potesse validare il CRON_SECRET. Effetto: 4
  // invocazioni Vercel Cron in 30min tutte 401, drain pricing fermo da
  // ore, 1 entry pending Barronci dalle 10:46 mai processata, 0 email di
  // variazione prezzi a tutti gli hotel.
  // Whitelistando il path esatto sblocchiamo il cron senza allargare
  // /api/accelerator al pubblico (la sicurezza resta nel route handler
  // che richiede `Bearer ${CRON_SECRET}`).
  "/api/accelerator/process-pricing-queue",
]

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
}

function isHotelArea(pathname: string): boolean {
  return HOTEL_AREA_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// Module-level flag: we only want to log the "dev-auth bypass active"
// message once per process, not on every middleware invocation.
let middlewareWarned = false

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ─── Keep-warm bypass (23/06/2026) ──────────────────────────────────
  // Il cron /api/cron/keep-warm pinga le route pesanti con ?warm=1 + header
  // x-keep-warm per scaldarne la lambda. MA /api/dashboard e /api/dati sono
  // PROTECTED: senza cookie il middleware rispondeva 401 PRIMA di raggiungere
  // la route, quindi la lambda target non si avviava mai e il warming non
  // funzionava (analytics ancora a 5,2s con 70% cold start nel report perf).
  // Lasciamo passare il ping fino al route handler, che ha uno short-circuit
  // su ?warm=1 e ritorna solo {warm:true} (nessun dato, nessun side effect).
  // SICURO: le route senza short-circuit applicano comunque la loro auth.
  if (
    pathname.startsWith("/api/") &&
    request.nextUrl.searchParams.get("warm") === "1" &&
    request.headers.get("x-keep-warm") === "1"
  ) {
    return NextResponse.next({ request: { headers: request.headers } })
  }

  // In dev (v0 sandbox or localhost), cookies don't propagate.
  // Skip auth check entirely to allow dashboard access with demo user.
  // SECURITY: il bypass e' attivo SOLO se NODE_ENV !== "production".
  // Anche se l'host e' un dominio dev-like (vercel.run, vusercontent.net),
  // mai bypassare in produzione: previene esposizione accidentale se
  // domani la stessa build gira dietro un dominio dev-like in prod.
  const host = (request.headers.get("host") || "").toLowerCase()
  const xfwd = (request.headers.get("x-forwarded-host") || "").toLowerCase()
  const effectiveHost = xfwd || host
  const isNodeProduction = process.env.NODE_ENV === "production"
  const isProdHost = effectiveHost.includes("vercel.app") || effectiveHost.includes("santaddeo.com")
  const looksLikeDevHost =
    effectiveHost.includes("vusercontent.net") ||
    effectiveHost.includes("vercel.run") ||
    effectiveHost.includes("localhost") ||
    host.includes("localhost")
  const isDev = looksLikeDevHost && !isProdHost && !isNodeProduction

  if (isDev && isProtectedRoute(pathname)) {
    // Log once per process instead of on every protected request to avoid
    // flooding the server logs in dev/preview.
    if (!middlewareWarned) {
      middlewareWarned = true
      console.info("[dev-auth] middleware bypass active for host:", effectiveHost)
    }
    return NextResponse.next({ request: { headers: request.headers } })
  }

  // Create a response to reuse for adding the set-cookie header
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create a Supabase client for the middleware to refresh the session
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => {
        return request.cookies.getAll()
      },
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // Refresh the session (this will update the cookie if the refresh token is still valid)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Skip auth check for public routes
  if (isPublicRoute(pathname)) {
    return response
  }

  // Protect routes: redirect to login if no valid session
  if (!user && isProtectedRoute(pathname)) {
    // For API routes, return 401 JSON instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      )
    }

    // For page routes, redirect to login
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/auth/login"
    loginUrl.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ─── sales_agent guard ─────────────────────────────────────────────
  // Se un utente SOLO venditore prova ad accedere a una hotel-area
  // (/dashboard, /dati, /settings, /accelerator, ecc.), lo redirigiamo
  // silenziosamente a /sales. Cosi' non vede mai banner tipo
  // "PMS non configurato" (sono inutili per lui) e non puo' giocare con
  // settings degli hotel.
  //
  // ECCEZIONE dual-role: un venditore che ha ANCHE accesso a una struttura
  // (riga in user_property_map OPPURE organization_id assegnato) e' legittimo
  // sulla dashboard struttura: ha scelto "Dashboard Struttura" dal selettore
  // /auth/choose-profile. In quel caso NON lo rimbalziamo.
  //
  // Performance: le query vengono fatte SOLO quando il path matcha hotel-area
  // E l'utente e' loggato. Per /sales*, /superadmin*, /api/*, /auth/*, asset,
  // ecc. saltiamo del tutto.
  if (user && isHotelArea(pathname)) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, organization_id")
        .eq("id", user.id)
        .maybeSingle<{ role: string | null; organization_id: string | null }>()
      if (profile?.role === "sales_agent") {
        // Verifica accesso tenant: organization_id assegnato O almeno una
        // struttura mappata. Solo i venditori PURI (senza tenant) vengono
        // rimbalzati a /sales.
        let hasTenantAccess = profile.organization_id != null
        if (!hasTenantAccess) {
          const { data: propRow } = await supabase
            .from("user_property_map")
            .select("hotel_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle<{ hotel_id: string }>()
          hasTenantAccess = propRow != null
        }
        if (!hasTenantAccess) {
          const salesUrl = request.nextUrl.clone()
          salesUrl.pathname = "/sales"
          salesUrl.search = ""
          return NextResponse.redirect(salesUrl)
        }
      }
    } catch (e) {
      // Soft-fail: se la query fallisce non blocchiamo l'accesso, log e
      // lascia passare. La pagina ha comunque i suoi guard server-side.
      console.error("[session-handler] role lookup failed:", e)
    }
  }

  return response
}
