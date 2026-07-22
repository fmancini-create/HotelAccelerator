import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/session-handler"

// Force Turbopack cache invalidation
const CACHE_BUST = Date.now()

export default async function middleware(request: NextRequest) {
  // DEV BYPASS: In sandbox v0, show quick login buttons
  const host = request.headers.get("host") || ""
  const isSandbox = host.includes("vusercontent.net")
  
  if (isSandbox && request.nextUrl.pathname === "/auth/login") {
    // Allow access to login page in sandbox (quick login buttons will be shown)
    return NextResponse.next()
  }
  
  // Redirect per path dati malformati
  if (request.nextUrl.pathname.includes("/dati/settings/")) {
    const correctedPath = request.nextUrl.pathname.replace(/\/dati\/settings\//, "/settings/")
    return NextResponse.redirect(new URL(correctedPath, request.url))
  }
  // Legacy /debug redirect to /dati
  if (request.nextUrl.pathname.startsWith("/debug/")) {
    const correctedPath = request.nextUrl.pathname.replace(/^\/debug\//, "/dati/")
    return NextResponse.redirect(new URL(correctedPath, request.url))
  }

  // Supabase session refresh + auth guard for protected routes
  return await updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
