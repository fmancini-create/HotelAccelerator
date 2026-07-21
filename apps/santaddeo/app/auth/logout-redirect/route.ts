import { NextResponse } from "next/server"
import { cookies } from "next/headers"

/**
 * Intermediate redirect handler that sets logout cookie and redirects to login
 * This ensures the cookie is included in the redirect request
 */
export async function GET() {
  const cookieStore = await cookies()
  
  // Set logout marker cookie
  cookieStore.set("v0_logged_out", "true", {
    path: "/",
    maxAge: 60 * 5,
    httpOnly: true,
    sameSite: "lax",
  })
  
  console.log("[v0] Logout redirect - cookie set, redirecting to login")
  
  // Redirect to login with Set-Cookie header
  const response = NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"))
  return response
}
