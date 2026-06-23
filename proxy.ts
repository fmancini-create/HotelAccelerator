/**
 * PROXY - Auth guard + Tenant Resolution & Routing (Next.js 16)
 * 1. Protegge le rotte /admin/* e /super-admin/* lato server (redirect al login
 *    se non c'è sessione). In dev/preview il guard è disattivato.
 * 2. Risolve il tenant dal hostname e gestisce il routing multi-tenant.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { readMiddlewareUser } from "@/lib/supabase/middleware"

/**
 * SECURITY: l'auth-guard può essere saltato SOLO in sviluppo locale, cioè
 * NODE_ENV=development su host localhost/127.0.0.1. Mai su preview pubbliche
 * o produzione (host raggiungibili da terzi).
 */
function isLocalDevBypass(hostname: string): boolean {
  if (process.env.NODE_ENV !== "development") return false
  const h = hostname.split(":")[0].trim().toLowerCase()
  return h === "localhost" || h === "127.0.0.1"
}

/** Rotte che richiedono una sessione autenticata. */
function isProtectedPath(pathname: string): boolean {
  // Pubbliche: login gate, reset password, pagina "non autorizzato", callback OAuth.
  if (pathname === "/admin" || pathname.startsWith("/admin/reset-password") || pathname === "/admin/unauthorized") {
    return false
  }
  if (pathname.startsWith("/auth")) return false
  if (pathname === "/super-admin/login") return false

  if (pathname.startsWith("/admin/")) return true
  if (pathname.startsWith("/super-admin")) return true
  return false
}

/** Pagina di login appropriata per la sezione richiesta. */
function loginGateFor(pathname: string): string {
  return pathname.startsWith("/super-admin") ? "/super-admin/login" : "/admin"
}

export default async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") || ""
  const pathname = request.nextUrl.pathname

  // Skip per risorse statiche e API interne
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) {
    return NextResponse.next()
  }

  const devOrPreview = isLocalDevBypass(hostname)

  // AUTH GUARD (solo in produzione): verifica la presenza di una sessione per le
  // rotte protette. L'autorizzazione di ruolo resta nei layout/API.
  if (!devOrPreview && isProtectedPath(pathname)) {
    const { user, applyCookies } = await readMiddlewareUser(request)

    if (!user) {
      const redirect = NextResponse.redirect(new URL(loginGateFor(pathname), request.url))
      applyCookies(redirect)
      return redirect
    }

    const response = resolveTenant(request, hostname, pathname, devOrPreview)
    applyCookies(response)
    return response
  }

  return resolveTenant(request, hostname, pathname, devOrPreview)
}

/**
 * Logica di risoluzione tenant (invariata): determina dominio piattaforma,
 * subdomain o custom domain e inoltra gli header appropriati.
 */
function resolveTenant(
  request: NextRequest,
  hostname: string,
  pathname: string,
  devOrPreview: boolean,
): NextResponse {
  const isPlatformDomain = isBaseDomain(hostname)

  // In dev/preview, lascia passare le rotte admin senza blocchi
  if (devOrPreview && (pathname.startsWith("/admin") || pathname.startsWith("/super-admin"))) {
    const response = NextResponse.next()
    response.headers.set("x-is-dev-mode", "true")
    return response
  }

  const requestHeaders = new Headers(request.headers)

  // Se è dominio piattaforma, aggiungi header e lascia passare
  if (isPlatformDomain) {
    requestHeaders.set("x-is-platform-domain", "true")
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  // Estrai subdomain per tenant
  const subdomain = extractSubdomain(hostname)

  // Se c'è un subdomain valido, aggiungi header per il tenant
  if (subdomain) {
    requestHeaders.set("x-tenant-identifier", subdomain)
    requestHeaders.set("x-tenant-type", "subdomain")
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  // Verifica custom domain (non localhost, non piattaforma base)
  const customDomain = hostname.split(":")[0]
  if (customDomain) {
    requestHeaders.set("x-tenant-identifier", customDomain)
    requestHeaders.set("x-tenant-type", "custom_domain")
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  return NextResponse.next()
}

/**
 * Estrae il subdomain dal hostname
 */
function extractSubdomain(hostname: string): string | null {
  const host = hostname.split(":")[0]

  // Domini base della piattaforma
  const baseDomains = ["hotelaccelerator.com", "hotelaccelerator.app", "vercel.app"]

  for (const base of baseDomains) {
    if (host.endsWith(`.${base}`)) {
      const subdomain = host.replace(`.${base}`, "")
      // Ignora www, app, admin
      if (subdomain !== "www" && subdomain !== "app" && subdomain !== "admin") {
        return subdomain
      }
    }
  }

  return null
}

/**
 * Verifica se è un dominio base della piattaforma (senza subdomain tenant)
 */
function isBaseDomain(hostname: string): boolean {
  const host = hostname.split(":")[0]

  if (host.includes("vusercontent.net") || host.includes("vercel.run")) {
    return true
  }

  // Domini che mostrano la landing page piattaforma
  const platformDomains = [
    "hotelaccelerator.com",
    "www.hotelaccelerator.com",
    "app.hotelaccelerator.com",
    "admin.hotelaccelerator.com",
    "localhost",
  ]

  // Check esatto
  if (platformDomains.includes(host)) {
    return true
  }

  // Check per vercel.app senza subdomain tenant
  // es: hotelaccelerator.vercel.app è piattaforma
  // ma: barronci.hotelaccelerator.vercel.app è tenant
  if (host.endsWith(".vercel.app")) {
    // Se ha solo un punto prima di vercel.app, è il dominio base
    const beforeVercel = host.replace(".vercel.app", "")
    if (!beforeVercel.includes(".")) {
      return true
    }
  }

  return false
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
