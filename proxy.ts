import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Domini base della piattaforma
const PLATFORM_DOMAINS = ["hotelaccelerator.com", "www.hotelaccelerator.com", "app.hotelaccelerator.com"]

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "localhost"
  const { pathname } = request.nextUrl
  const host = hostname.split(":")[0] // Rimuovi porta

  // Static files - passa sempre
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
    return NextResponse.next()
  }

  // API routes - passa sempre
  if (pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  // Admin routes - passa sempre (gestito da auth)
  if (pathname.startsWith("/admin")) {
    return NextResponse.next()
  }

  // Bypass completo - Next.js servirà app/(platform)/page.tsx automaticamente
  if (isPlatformDomain(host)) {
    return NextResponse.next()
  }

  const tenantInfo = extractTenantInfo(host)
  if (tenantInfo) {
    // Costruisci il path per il rewrite
    const rewritePath = pathname === "/" ? "/" : pathname
    const url = request.nextUrl.clone()
    url.pathname = rewritePath

    const response = NextResponse.rewrite(url)
    response.headers.set("x-tenant-identifier", tenantInfo.identifier)
    response.headers.set("x-tenant-type", tenantInfo.type)
    return response
  }

  // Fallback - passa la richiesta
  return NextResponse.next()
}

/**
 * Verifica se l'hostname è il dominio della piattaforma
 */
function isPlatformDomain(host: string): boolean {
  // Development
  if (host === "localhost" || host === "127.0.0.1") {
    return true
  }

  // Vercel preview deployments
  if (host.endsWith(".vercel.app")) {
    return true
  }

  // Domini piattaforma espliciti
  return PLATFORM_DOMAINS.some((d) => host === d)
}

/**
 * Estrae informazioni tenant dall'hostname
 */
function extractTenantInfo(host: string): { identifier: string; type: "subdomain" | "custom_domain" } | null {
  // 1. Check subdomain su hotelaccelerator.com
  const subdomainPatterns = ["hotelaccelerator.com", "hotelaccelerator.app"]
  for (const base of subdomainPatterns) {
    if (host.endsWith(`.${base}`)) {
      const subdomain = host.replace(`.${base}`, "")
      // Ignora subdomain riservati
      if (!["www", "app", "admin", "api", "mail"].includes(subdomain)) {
        return { identifier: subdomain, type: "subdomain" }
      }
    }
  }

  // 2. Custom domain - qualsiasi dominio non riconosciuto come piattaforma
  if (!isPlatformDomain(host)) {
    return { identifier: host, type: "custom_domain" }
  }

  return null
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}

export default middleware
