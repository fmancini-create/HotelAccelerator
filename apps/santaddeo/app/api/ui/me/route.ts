import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

export const dynamic = "force-dynamic"

// Check if we're in v0 preview environment
async function isV0Preview(host: string): Promise<boolean> {
  return (
    host.includes("vusercontent.net") || 
    host.includes("v0.dev") || 
    host.includes("vercel.run") ||
    host.includes("vercel.app") ||
    await isDevAuthAsync()
  )
}

// Mock data for v0 preview - allows testing UI without real auth
const V0_MOCK_USER = {
  id: "dev-user-123",
  email: "dev@santaddeo.com",
  app_metadata: {},
  user_metadata: { full_name: "Dev User" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
}

const V0_MOCK_PROFILE = {
  id: "dev-user-123",
  email: "dev@santaddeo.com",
  role: "super_admin",
  full_name: "Dev User (Preview)",
  hotel_id: "8dd3f8c1-284a-43f1-b24f-e6a9d428edca", // Villa I Barronci
  organization_id: null,
}

export async function GET() {
  // In v0 preview, return mock data to allow UI testing
  const headersList = await headers()
  const host = headersList.get("host") || ""
  
  // CRITICAL: Only use mock data for v0 preview - NEVER for production or localhost
  // This prevents security issues where regular users get super_admin access
  const isPreview = await isV0Preview(host)
  
  if (isPreview) {
    // Even in v0 preview, read cookies to support impersonation testing
    const cookieStore = await cookies()
    const impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value || null
    const impersonatedUserId = cookieStore.get("impersonated_user_id")?.value || null
    
    return NextResponse.json({
      user: V0_MOCK_USER,
      profile: V0_MOCK_PROFILE,
      organization: null,
      isSuperAdmin: true,
      isDeveloper: true,
      isImpersonatingUser: !!impersonatedUserId,
      isImpersonatingHotel: !!impersonatedHotelId && !impersonatedUserId,
      impersonatedHotelId,
      impersonatedUserId,
      _isDevPreview: true,
      // Also include role at top level for backwards compatibility with pages that check meData.role
      role: V0_MOCK_PROFILE.role,
    })
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cookieStore = await cookies()
  const impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value
  const impersonatedUserId = cookieStore.get("impersonated_user_id")?.value

  // Fetch profile
  let profile = null
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (profileData) {
    profile = profileData
  } else if (!profileError) {
    const { data: newProfile } = await supabase
      .from("profiles")
      .insert({ id: user.id, email: user.email || "", role: "user" })
      .select()
      .single()
    profile = newProfile
  }

  // Fetch organization separately if profile has one
  let organization = null
  if (profile?.organization_id) {
    const { data: org } = await supabase.from("organizations").select("*").eq("id", profile.organization_id).single()
    organization = org
  }

  const isSuperAdmin = profile?.role === "super_admin"
  const isDeveloper = user.email === "f.mancini@4bid.it" || user.email === "f.mancini@ibarronci.com"
  
  // IMPORTANT: When impersonating a user, the SuperAdmin should retain full permissions
  // Only restrict permissions if impersonating a hotel WITHOUT impersonating a user
  const isImpersonatingUser = isSuperAdmin && !!impersonatedUserId
  const isImpersonatingHotel = isSuperAdmin && !!impersonatedHotelId && !impersonatedUserId

  return NextResponse.json({
    user,
    profile: profile ? { ...profile, organizations: organization } : null,
    organization,
    isSuperAdmin,
    isDeveloper,
    isImpersonatingUser,
    isImpersonatingHotel,
    impersonatedHotelId,
    impersonatedUserId,
    // Include role at top level for consistency with preview and easier access
    role: profile?.role || null,
  })
}
