import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"

export async function GET() {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
    
    // Get the host from headers to build absolute URL
    const headersList = await headers()
    const host = headersList.get("host") || "www.santaddeo.com"
    const protocol = host.includes("localhost") ? "http" : "https"
    const baseUrl = `${protocol}://${host}`
    
    // Redirect to home page after logout
    return NextResponse.redirect(new URL("/", baseUrl), { status: 302 })
  } catch (error) {
    // Fallback redirect to home
    const headersList = await headers()
    const host = headersList.get("host") || "www.santaddeo.com"
    const protocol = host.includes("localhost") ? "http" : "https"
    return NextResponse.redirect(new URL("/", `${protocol}://${host}`), { status: 302 })
  }
}
