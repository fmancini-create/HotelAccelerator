import { cache } from "react"
import { cookies } from "next/headers"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

// Demo user for v0 preview (same as DashboardContent)
const V0_DEMO_USER = {
  id: "5de43b7b-e661-4e4e-8177-7943df06470c",
  email: "f.mancini@4bid.it",
  user_metadata: { full_name: "Demo User", role: "super_admin", organization_id: null },
  app_metadata: {},
}

/**
 * Server-side function to resolve the current user's settings context.
 * Wrapped in React.cache() to deduplicate across layout + page in the same request.
 * Reads the impersonation cookie directly instead of using a fetch() call,
 * ensuring the correct hotel is always resolved for superadmin users.
 */
export const getSettingsData = cache(async () => {
  const cookieStore = await cookies()
  
  // Check if user just logged out (v0 preview logout marker)
  const loggedOutMarker = cookieStore.get("v0_logged_out")?.value
  
  if (loggedOutMarker === "true") {
    // Clear the logout marker after using it
    cookieStore.delete("v0_logged_out")
    return { redirect: "/auth/login" }
  }
  
  const isV0Preview = await isDevAuthAsync()
  const supabase = isV0Preview ? await createServiceRoleClient() : await createClient()
  const supabaseAdmin = await createServiceRoleClient()

  // In v0 preview, use demo user ID; otherwise get from authenticated user
  let user: any = null
  if (isV0Preview) {
    user = V0_DEMO_USER
  } else {
    // Use getUser() instead of getSession() for security (validates against Supabase Auth server)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    user = authUser
  }

  if (!user) {
    return { redirect: "/auth/login" }
  }

  // Always fetch the REAL profile from database to get actual role (not the hardcoded demo one)
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  // Use the REAL role from database, not the hardcoded one in V0_DEMO_USER
  const isSuperAdmin = profile?.role === "super_admin"

  if (!isSuperAdmin && !profile?.organization_id && !isV0Preview) {
    return { redirect: "/onboarding" }
  }

  // Read the impersonation cookie directly (cookieStore already defined above)
  const impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value

  let organization = null
  let hotels: any[] = []
  let selectedHotel = null

  if (isSuperAdmin) {
    const { data: hotelsData } = await supabaseAdmin
      .from("hotels")
      .select("*")
      .order("created_at", { ascending: true })

    hotels = hotelsData || []

    // Priority: use impersonated hotel from cookie
    if (impersonatedHotelId) {
      selectedHotel = hotels.find((h: any) => h.id === impersonatedHotelId) || null
    }
    // Fallback to first hotel
    if (!selectedHotel && hotels.length > 0) {
      selectedHotel = hotels[0]
    }

    if (selectedHotel) {
      const { data: orgData } = await supabaseAdmin
        .from("organizations")
        .select("*")
        .eq("id", selectedHotel.organization_id)
        .single()
      organization = orgData
    }
  } else {
    const { data: orgData } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .eq("id", profile.organization_id)
      .single()
    organization = orgData

    // NON-SUPERADMIN: hotels della propria organizzazione...
    const { data: hotelsData } = await supabaseAdmin
      .from("hotels")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: true })

    hotels = hotelsData || []

    // ...PIU' gli hotel assegnati esplicitamente via `user_property_map`
    // (assegnazione multi-struttura fatta dal super admin nel dialog
    // "Gestisci strutture"). Senza questa unione, un utente con piu' strutture
    // associate vedrebbe nel selettore solo quelle della propria organization.
    const { data: mappedRows } = await supabaseAdmin
      .from("user_property_map")
      .select("hotel_id")
      .eq("user_id", user.id)

    const mappedIds = (mappedRows || []).map((r: any) => r.hotel_id).filter(Boolean)
    const existingIds = new Set(hotels.map((h: any) => h.id))
    const missingIds = mappedIds.filter((id: string) => !existingIds.has(id))

    if (missingIds.length > 0) {
      const { data: extraHotels } = await supabaseAdmin
        .from("hotels")
        .select("*")
        .in("id", missingIds)
        .order("created_at", { ascending: true })
      if (extraHotels && extraHotels.length > 0) {
        hotels = [...hotels, ...extraHotels]
      }
    }

    // NON-SUPERADMIN: Only show first hotel or impersonated if allowed
    if (impersonatedHotelId && hotels.some((h: any) => h.id === impersonatedHotelId)) {
      selectedHotel = hotels.find((h: any) => h.id === impersonatedHotelId) || null
    } else {
      selectedHotel = hotels.length > 0 ? hotels[0] : null
    }
  }

  // Fetch accelerator subscription for the selected hotel
  let subscription: any = null
  let roomTypes: { id: string; name: string }[] = []
  
  if (selectedHotel) {
    // Fetch subscription
    const { data: subData } = await supabaseAdmin
      .from("accelerator_subscriptions")
      .select("*")
      .eq("hotel_id", selectedHotel.id)
      .eq("is_active", true)
      .single()
    if (subData) {
      subscription = {
        ...subData,
        status: subData.payment_status, // map payment_status to status for header compatibility
      }
    }
    
    // Fetch room types for the selected hotel
    const { data: roomTypesData } = await supabaseAdmin
      .from("room_types")
      .select("id, name")
      .eq("hotel_id", selectedHotel.id)
      .order("name", { ascending: true })
    
    roomTypes = roomTypesData || []
  }

  return {
    profile,
    organization,
    hotels,
    selectedHotel,
    isSuperAdmin,
    isDeveloper: false,
    // True quando un super_admin sta impersonando un hotel: serve al gating
    // del menu "Dati" per mostrare i lucchetti come li vedrebbe il tenant
    // quando l'hotel impersonato non ha Accelerator attivo. Senza questo
    // flag il check `!hasAccelerator && !isSuperAdmin` sblocca SEMPRE tutto
    // anche per hotel non Accelerator.
    isImpersonating: Boolean(isSuperAdmin && impersonatedHotelId),
    pmsIntegration: null,
    subscription,
    hasMappings: false,
    roomTypes,
    allHotels: hotels,
  }
})
