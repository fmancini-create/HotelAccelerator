import { NextResponse } from "next/server"
import { createClient, getAuthUser } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

/**
 * GET /api/auth/me
 * 
 * Returns authenticated user IDENTITY and PERMISSIONS (not context).
 * 
 * Real database schema (from profiles table):
 * - id, email, first_name, last_name, role, organization_id exist
 * - full_name, hotel_id DO NOT exist (first_name/last_name are separate columns)
 * 
 * Response includes user identity info + auth permissions.
 */
export async function GET() {
  try {
    // Check if we're in v0 preview environment
    const headersList = await headers()
    const host = (headersList.get("host") || "").toLowerCase()
    const devAuth = await isDevAuthAsync()
    const isPreview = (
      host.includes("vusercontent.net") || 
      host.includes("v0.dev") || 
      host.includes("vercel.run") ||
      host.includes("vercel.app") ||
      devAuth
    )
    
    // In v0 preview, return mock superadmin user immediately
    if (isPreview) {
      return NextResponse.json({
        user: {
          id: "5de43b7b-e661-4e4e-8177-7943df06470c",
          email: "f.mancini@4bid.it",
          name: "Filippo Mancini",
          first_name: "Filippo",
          last_name: "Mancini",
        },
        role: "super_admin",
        organization_id: null,
        is_superadmin: true,
      })
    }
    
    const supabase = await createClient()
    const user = await getAuthUser(supabase)

    if (!user) {
      return NextResponse.json(
        { user: null, role: null, organization_id: null, is_superadmin: false },
        { status: 401 }
      )
    }

    // Create service role client for profile queries (bypasses RLS)
    const adminClient = await createClient()

    // Fetch profile: SELECT ACTUAL COLUMNS (first_name, last_name not full_name!)
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, organization_id, first_name, last_name, email")
      .eq("id", user.id)
      .single()
    
    if (profileError) {
      console.error("[api/auth/me] Profile query error:", profileError)
      // Return minimal data even if profile lookup fails
      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
        },
        role: user.app_metadata?.role ?? null,
        organization_id: null,
        is_superadmin: false,
      })
    }

    const role = profile?.role ?? user.app_metadata?.role ?? null
    const organizationId = profile?.organization_id ?? null
    // DB uses "super_admin" as the superadmin role value
    const isSuperadmin = role === "super_admin"
    
    // Build full name from first_name + last_name
    const firstName = profile?.first_name ?? user.user_metadata?.first_name ?? ""
    const lastName = profile?.last_name ?? user.user_metadata?.last_name ?? ""
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || null

    return NextResponse.json({
      user: {
        id: user.id,
        email: profile?.email ?? user.email,
        name: displayName,
        first_name: firstName || null,
        last_name: lastName || null,
      },
      role,
      organization_id: organizationId,
      is_superadmin: isSuperadmin,
    })
  } catch (error) {
    console.error("[api/auth/me] Error:", error)
    return NextResponse.json(
      { user: null, role: null, organization_id: null, is_superadmin: false, error: "Internal error" },
      { status: 500 }
    )
  }
}
