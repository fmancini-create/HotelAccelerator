/**
 * PROXY - Tenant Resolution & Routing (Next.js 16)
 * Risolve il tenant dal hostname e gestisce il routing multi-tenant
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { securityHeaders } from "@/lib/security-headers"

export default function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") || ""
  const pathname = request.nextUrl.pathname

  console.log("[v0] Proxy - hostname:", hostname, "pathname:", pathname)

  // Skip per risorse statiche e API interne
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) {
    return NextResponse.next()
  }

  const isPlatformDomain = isBaseDomain(hostname)
  console.log("[v0] Proxy - isPlatformDomain:", isPlatformDomain)

  // Se è dominio piattaforma, aggiungi header e lascia passare
  if (isPlatformDomain) {
    const response = NextResponse.next()
    response.headers.set("x-is-platform-domain", "true")
    // Add security headers
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    return response
  }

  // Estrai subdomain per tenant
  const subdomain = extractSubdomain(hostname)

  // Se c'è un subdomain valido, aggiungi header per il tenant
  if (subdomain) {
    // Validate subdomain format (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/i.test(subdomain)) {
      console.error("[SECURITY] Invalid subdomain format:", subdomain)
      return new NextResponse("Invalid subdomain", { status: 400 })
    }

    const response = NextResponse.next()
    response.headers.set("x-tenant-identifier", subdomain)
    response.headers.set("x-tenant-type", "subdomain")
    // Add security headers
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    return response
  }

  // Verifica custom domain (non localhost, non piattaforma base)
  const customDomain = hostname.split(":")[0]
  if (customDomain) {
    const response = NextResponse.next()
    response.headers.set("x-tenant-identifier", customDomain)
    response.headers.set("x-tenant-type", "custom_domain")
    // Add security headers
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
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
 * Verifica se è un dominio base della piattaforma (senza subdomain tenant)
 */
function isBaseDomain(hostname: string): boolean {
  const host = hostname.split(":")[0]

  if (host.includes("vusercontent.net")) {
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
