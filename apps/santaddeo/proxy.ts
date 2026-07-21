import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/session-handler"

export default async function middleware(request: NextRequest) {
  // DEV: Redirect path malformati
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
