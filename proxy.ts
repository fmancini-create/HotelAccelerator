/**
 * MIDDLEWARE - Tenant Resolution & Routing
 * Risolve il tenant dal hostname e gestisce il routing multi-tenant
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") || ""
  const pathname = request.nextUrl.pathname

  // Skip per risorse statiche e API interne
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname.startsWith("/admin")
  ) {
    return NextResponse.next()
  }

  // Estrai subdomain
  const subdomain = extractSubdomain(hostname)

  // Se c'è un subdomain valido, aggiungi header per il tenant
  if (subdomain) {
    const response = NextResponse.next()
    response.headers.set("x-tenant-subdomain", subdomain)
    return response
  }

  // Verifica custom domain (non localhost, non piattaforma base)
  if (!isBaseDomain(hostname)) {
    const response = NextResponse.next()
    response.headers.set("x-tenant-domain", hostname.split(":")[0])
    return response
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
 * Verifica se è un dominio base della piattaforma
 */
function isBaseDomain(hostname: string): boolean {
  const host = hostname.split(":")[0]
  return (
    host === "hotelaccelerator.com" ||
    host === "www.hotelaccelerator.com" ||
    host === "app.hotelaccelerator.com" ||
    host === "admin.hotelaccelerator.com" ||
    host === "localhost" ||
    host.endsWith(".vercel.app")
  )
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
