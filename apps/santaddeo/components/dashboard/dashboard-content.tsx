import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { DashboardShellClient } from "@/components/dashboard/dashboard-shell-client"
import { AppLayout } from "@/components/layout/app-layout"
import { checkDashboardAllowed } from "@/lib/guards/dashboard-guard"
import { DashboardBlock } from "@/components/guards/dashboard-block"
import { getCapabilities } from "@/lib/capabilities/get-capabilities"

export async function DashboardContent({ searchParams }: { searchParams?: { hotel?: string } } = {}) {
  const t0 = Date.now()

  // Inline dev detection — more reliable than isDevAuthAsync() in SSR context
  // because headers() is already available here without dynamic import.
  const { headers } = await import("next/headers")
  const headersList = await headers()
  const _host = (headersList.get("host") || "").toLowerCase()
  const isV0Preview =
    process.env.NODE_ENV === "development" ||
    _host.includes("localhost") ||
    _host.includes("vusercontent.net")

  // Step 1: createClient + getUser + cookies in parallel
  // In v0 preview, use service role client to bypass RLS (demo user has no real auth session)
  const [supabase, cookieStore] = await Promise.all([
    isV0Preview ? createServiceRoleClient() : createClient(),
    cookies(),
  ])

  // Priority: URL searchParams > cookie
  const impersonatedHotelId = searchParams?.hotel || cookieStore.get("impersonated_hotel_id")?.value

  // Retrieve user from session (no network call).
  let user: any = null
  if (isV0Preview) {
    // In v0 preview, no real Supabase session exists.
    // Use a demo user to render the dashboard.
    user = {
      id: "5de43b7b-e661-4e4e-8177-7943df06470c",
      email: "f.mancini@4bid.it",
      user_metadata: { full_name: "Demo User", role: "super_admin", organization_id: null },
      app_metadata: {},
    }
  } else {
    // Use getUser() instead of getSession() for security (validates against Supabase Auth server)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    user = authUser
    if (!user) redirect("/auth/login")
  }



  // Step 2: Profile + Hotels in PARALLEL
  // For superadmin: hotels don't depend on profile (fetch ALL hotels).
  // For non-superadmin: we optimistically fetch profile + org hotels together
  // using org_id from the JWT metadata (available without a DB query).
  const t2 = Date.now()
  const jwtOrgId = user.user_metadata?.organization_id as string | undefined
  const jwtRole = user.user_metadata?.role as string | undefined
  const isSuperAdminHint = jwtRole === "super_admin"

  // Fire profile + hotels queries simultaneously -- single Supabase client, no service role needed
  const profilePromise = supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()

  let hotelsPromise: Promise<any>
  if (isSuperAdminHint) {
    // Superadmin: ALWAYS fetch all hotels (for selector), then we'll pick the impersonated one
    hotelsPromise = supabase.from("hotels").select("*").order("created_at", { ascending: true })
      .then(r => ({ 
        mode: impersonatedHotelId ? "impersonate" as const : "superadmin" as const, 
        data: r.data || [],
        impersonatedHotelId 
      }))
  } else if (jwtOrgId) {
    // Non-superadmin with org: fetch org hotels + property map + invitations
    hotelsPromise = Promise.all([
      supabase.from("hotels").select("*").eq("organization_id", jwtOrgId).order("created_at", { ascending: true }),
      supabase.from("user_property_map").select("hotel_id").eq("user_id", user.id),
      supabase.from("user_invitations").select("hotel_id").eq("email", user.email || "").not("accepted_at", "is", null),
    ]).then(([orgR, mapR, invR]) => ({ mode: "org" as const, orgData: orgR.data || [], mapData: mapR.data || [], invData: invR.data || [] }))
  } else {
    // Fallback: No org in JWT, but user might have hotels via user_property_map
    // This happens when JWT metadata is not updated after profile changes
    hotelsPromise = supabase.from("user_property_map").select("hotel_id").eq("user_id", user.id)
      .then(async (mapR) => {
        if (mapR.data && mapR.data.length > 0) {
          const hotelIds = mapR.data.map(m => m.hotel_id)
          const { data: hotels } = await supabase.from("hotels").select("*").in("id", hotelIds).order("created_at", { ascending: true })
          // Includiamo anche le righe grezze (mapRows) cosi' il resolver puo'
          // ri-fetchare via service-role se la RLS ha filtrato hotel cross-org.
          return { mode: "mapped" as const, data: hotels || [], mapRows: mapR.data }
        }
        return { mode: "none" as const, data: [] }
      })
  }

  const [profileResult, hotelsResult] = await Promise.all([profilePromise, hotelsPromise])



  let profile = profileResult.data
  if (!profile) {
    try {
      const { data: newProfile } = await supabase
        .from("profiles")
        .insert({ id: user.id, email: user.email || "", role: "user" })
        .select().single()
      profile = newProfile
    } catch {
      // insert may fail in dev if user id doesn't exist in auth.users
    }
  }
  if (!profile) {
    if (isV0Preview) {
      // In dev, create a synthetic profile instead of redirecting
      profile = { id: user.id, email: user.email, role: "super_admin", full_name: "Demo User", organization_id: null }
    } else {
      redirect("/onboarding")
    }
  }

  const isSuperAdmin = profile.role === "super_admin"
  const isDeveloper = user.email === "f.mancini@4bid.it" || user.email === "f.mancini@ibarronci.com"
  const isImpersonating = isSuperAdmin && !!impersonatedHotelId

  // Self-heal: if this user has an accepted invitation for a hotel but no
  // matching user_property_map row, the signup-time upsert must have failed
  // and RLS will block them from reading their own hotel's PMS binding and
  // mapping. Create the missing rows now (one-shot, silently) so the user
  // doesn't see the misleading "Configurazione in Corso" screen.
  if (!isSuperAdmin && profile.organization_id && user.email) {
    try {
      const adminClient = await createServiceRoleClient()
      const { data: acceptedInvites } = await adminClient
        .from("user_invitations")
        .select("hotel_id, role, invited_by")
        .eq("email", user.email.toLowerCase())
        .not("accepted_at", "is", null)
        .not("hotel_id", "is", null)

      if (acceptedInvites && acceptedInvites.length > 0) {
        const { data: existingMaps } = await adminClient
          .from("user_property_map")
          .select("hotel_id")
          .eq("user_id", user.id)
        const mappedIds = new Set((existingMaps || []).map((m: any) => m.hotel_id))
        const missing = acceptedInvites.filter((inv: any) => inv.hotel_id && !mappedIds.has(inv.hotel_id))
        for (const inv of missing) {
          await adminClient.from("user_property_map").upsert({
            user_id: user.id,
            hotel_id: inv.hotel_id,
            can_manage: inv.role === "property_admin",
            can_view_financials: true,
            can_sync_data: inv.role === "property_admin",
            can_manage_team: inv.role === "property_admin",
            assigned_by: inv.invited_by,
            assigned_at: new Date().toISOString(),
          }, { onConflict: "user_id,hotel_id" })
        }
        if (missing.length > 0) {
          console.log("[v0] self-heal user_property_map: added", missing.length, "missing rows for", user.email)
        }
      }
    } catch (healErr) {
      // Non-critical: log and move on. Worst case the user sees the block and we retry next load.
      console.warn("[v0] self-heal user_property_map failed:", healErr instanceof Error ? healErr.message : String(healErr))
    }
  }

  // Resolve hotels from the parallel result
  let hotels: any[] = []
  let selectedHotel: any = null

  const hr = hotelsResult as any
  
  // If profile says superadmin but JWT didn't (so we fetched wrong hotels), re-fetch all hotels
  console.log("[v0] Dashboard - hr.mode:", hr.mode, "isSuperAdmin:", isSuperAdmin, "profile.role:", profile.role)
  if (isSuperAdmin && hr.mode !== "impersonate" && hr.mode !== "superadmin") {
    const { data: allHotels, error: hotelsError } = await supabase.from("hotels").select("*").order("created_at", { ascending: true })
    console.log("[v0] Dashboard - allHotels count:", allHotels?.length, "error:", hotelsError?.message)
    hotels = allHotels || []
    selectedHotel = impersonatedHotelId 
      ? hotels.find((h: any) => h.id === impersonatedHotelId) ?? hotels[0] ?? null
      : hotels[0] ?? null
  } else if (hr.mode === "impersonate") {
    // Superadmin impersonating: all hotels available, but select the impersonated one
    hotels = hr.data
    selectedHotel = hotels.find((h: any) => h.id === hr.impersonatedHotelId) ?? hotels[0] ?? null
  } else if (hr.mode === "superadmin") {
    hotels = hr.data
    selectedHotel = hotels[0] ?? null
  } else if (hr.mode === "mapped") {
    // User has hotels via user_property_map (no org in JWT).
    // IMPORTANTE: hr.data e' stato letto con il client RLS, che filtra gli
    // hotel alla sola organization dell'utente -> per le strutture mappate
    // CROSS-ORG tornerebbe 0 righe (sintomo: vede solo il proprio hotel).
    // Rifacciamo il fetch con il service-role client: le righe sono gia'
    // autorizzate da user_property_map, quindi bypassare la RLS e' corretto.
    const mappedIds = (hr.mapRows || []).map((m: any) => m.hotel_id).filter(Boolean)
    if (mappedIds.length > 0) {
      const adminClient = await createServiceRoleClient()
      const { data: mappedHotels } = await adminClient
        .from("hotels").select("*").in("id", [...new Set(mappedIds)])
        .order("created_at", { ascending: true })
      hotels = mappedHotels || hr.data
    } else {
      hotels = hr.data
    }
    selectedHotel = hotels[0] ?? null
  } else if (hr.mode === "org") {
    hotels = hr.orgData
    const existingIds = new Set(hotels.map((h: any) => h.id))
    const extraIds = [
      ...(hr.mapData || []).map((m: any) => m.hotel_id),
      ...(hr.invData || []).map((inv: any) => inv.hotel_id),
    ].filter((id: string) => id && !existingIds.has(id))

    if (extraIds.length > 0) {
      // Service-role client per gli hotel CROSS-ORG (mappati o invitati): il
      // client RLS li filtrerebbe perche' fuori dalla propria organization.
      const adminClient = await createServiceRoleClient()
      const { data: extraHotels } = await adminClient
        .from("hotels").select("*").in("id", [...new Set(extraIds)])
        .order("created_at", { ascending: true })
      if (extraHotels) hotels = [...hotels, ...extraHotels]
    }
    selectedHotel = hotels[0] ?? null
  }

  // If superadmin JWT hint was wrong (profile says otherwise), re-fetch
  if (!isSuperAdminHint && isSuperAdmin && hotels.length === 0) {
    const { data } = await supabase.from("hotels").select("*").order("created_at", { ascending: true })
    hotels = data || []
    selectedHotel = hotels[0] ?? null
  }

  // FIX 12/05/2026: fallback curativo per utenti che hanno completato il
  // signup+onboarding ma il cui JWT non e' ancora stato aggiornato con
  // `organization_id` (succede prima del prossimo refresh del token).
  // Il fix preventivo lo facciamo in `completeOnboarding` (updateUserById
  // su user_metadata), ma per gli utenti gia' registrati come "Nunia in
  // Rome" il JWT vecchio non ha organization_id e il fallback su
  // user_property_map e' vuoto (popolato solo per inviti accettati).
  // Risultato pre-fix: vedevano "Il database DEV non contiene hotel..."
  // anche se il proprio hotel esisteva nel DB.
  if (!isSuperAdmin && hotels.length === 0 && profile.organization_id) {
    console.log(
      "[v0] dashboard fallback: JWT org missing, retry via profile.organization_id",
      profile.organization_id,
    )
    const adminClient = await createServiceRoleClient()
    const { data: orgHotels } = await adminClient
      .from("hotels")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: true })
    if (orgHotels && orgHotels.length > 0) {
      hotels = orgHotels
      selectedHotel = hotels[0]
    }
  }

  // FIX 12/05/2026: se l'utente normale non ha alcun hotel associato
  // (organization_id null, nessun invito, nessun property map), e' un
  // signup incompleto. Lo rimandiamo all'onboarding invece di mostrargli
  // l'empty state DEV con il pulsante di sync PROD→DEV (che e' destinato
  // ai soli super admin/v0 preview).
  if (!isSuperAdmin && hotels.length === 0 && !isV0Preview) {
    if (!profile.setup_completed) {
      redirect("/onboarding")
    }
    // setup_completed=true ma 0 hotel = stato corrotto: probabilmente
    // l'utente e' stato disassociato da un superadmin. Lascia che il
    // dashboard mostri il messaggio "nessun hotel disponibile" sotto.
  }

  // For superadmin: always fetch ALL hotels for the dropdown selector
  // (even when impersonating, we need full list to switch between hotels)
  let allHotels: any[] | undefined = undefined
  if (isSuperAdmin) {
    if (hr.mode === "superadmin") {
      // Already have all hotels from initial fetch
      allHotels = hotels
    } else {
      // Impersonating or other mode - fetch all hotels separately
      const { data } = await supabase.from("hotels").select("*, organizations(name)").order("created_at", { ascending: true })
      allHotels = data || []
    }
  }

  console.log("[v0] Dashboard - selectedHotel:", selectedHotel?.id, selectedHotel?.name, "hotels count:", hotels.length)
  if (isSuperAdmin && !selectedHotel && !isImpersonating && !isV0Preview) redirect("/superadmin")

  // Step 3: Hotel-specific queries -- all 5 in parallel
  let pmsIntegration: any = null
  let subscription: any = null
  let roomTypes: any[] = []
  let hasMappings = false
  let guardResult: any = { allowed: true }
  let etlStatus: any = null

  let kpiConfigs: any[] = []
  let hasCustomThresholds = false

  const t3 = Date.now()
  if (selectedHotel) {
    console.log("[v0] dashboard querying for hotel:", selectedHotel.id, selectedHotel.name)
    // 7 queries in parallel -- kpi_configs + kpi_thresholds prefetched server-side
    // to eliminate 3 redundant client-side API calls (kpi-configs x2 + kpi-thresholds x1)
    const [pmsResult, bindingResult, subResult, roomTypesResult, kpiConfigsResult, kpiThresholdsResult] = await Promise.all([
      supabase.from("pms_integrations").select("*").eq("hotel_id", selectedHotel.id).eq("is_active", true).maybeSingle(),
      // Include mapping_version_id so we can look up the exact version tied to this hotel's binding
      supabase.from("hotel_bindings").select("id, pms_provider_id, status, mapping_version_id").eq("hotel_id", selectedHotel.id).in("status", ["COMPLETE", "ACTIVE"]).order("status", { ascending: true }).limit(1).maybeSingle(),
      supabase.from("accelerator_subscriptions").select("*").eq("hotel_id", selectedHotel.id).eq("is_active", true).maybeSingle(),
      supabase.from("room_types").select("id, name, pms_room_type_id, total_rooms, is_active, display_order").eq("hotel_id", selectedHotel.id).eq("is_active", true).order("display_order", { ascending: true }),
      // KPI visibility configs -- eliminates 2 client-side /api/dashboard/kpi-configs calls
      supabase.from("dashboard_kpi_configs").select("kpi_key, is_enabled").eq("hotel_id", selectedHotel.id),
      // KPI custom thresholds check -- eliminates 1 client-side /api/kpi-thresholds call
      supabase.from("kpi_thresholds").select("id").eq("hotel_id", selectedHotel.id).limit(1),
    ])

  pmsIntegration = pmsResult.data ?? null
  const binding = bindingResult.data ?? null
  hasMappings = !!(pmsIntegration?.is_active && pmsIntegration?.integration_mode)

    // Look up the mapping version directly via the binding's mapping_version_id
    // (avoids false negatives from cross-hotel pms_provider_id collisions)
    let mappingVersion: any = null
    if (binding?.mapping_version_id) {
      const { data: mvData } = await supabase
        .from("pms_mapping_versions")
        .select("id, version_number, status, pms_provider_id")
        .eq("id", binding.mapping_version_id)
        .in("status", ["VALIDATED", "LOCKED"])
        .maybeSingle()
      mappingVersion = mvData ?? null
      if (mappingVersion) hasMappings = true
    } else if (binding?.pms_provider_id) {
      // Fallback: search by provider but scoped correctly
      const { data: mvData } = await supabase
        .from("pms_mapping_versions")
        .select("id, version_number, status, pms_provider_id")
        .eq("pms_provider_id", binding.pms_provider_id)
        .in("status", ["VALIDATED", "LOCKED"])
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle()
      mappingVersion = mvData ?? null
      if (mappingVersion) hasMappings = true
    }

    etlStatus = binding
      ? { can_run: binding.status === "ACTIVE" && !!mappingVersion, binding_status: binding.status, mapping_status: mappingVersion?.status ?? null, pms_provider_id: binding.pms_provider_id, mapping_version_id: mappingVersion?.id ?? null }
      : null

    if (!isSuperAdmin) {
      if (!binding) guardResult = { allowed: false, blockCode: "NO_MAPPING", reason: "Nessun PMS configurato" }
      else if (binding.status !== "ACTIVE") guardResult = { allowed: false, blockCode: "BINDING_INCOMPLETE", reason: "Binding non attivo" }
      else if (!mappingVersion) guardResult = { allowed: false, blockCode: "MAPPING_NOT_VALIDATED", reason: "Mappatura PMS non validata" }
      else guardResult = { allowed: true, mappingVersion: { id: mappingVersion.id, version: mappingVersion.version_number, status: mappingVersion.status } }
    }

    console.log("[v0] dashboard subResult:", JSON.stringify(subResult))
    if (!subResult.error) subscription = subResult.data ?? null
    console.log("[v0] dashboard subscription for hotel", selectedHotel?.id, ":", subscription, "is_active:", subscription?.is_active)
    roomTypes = roomTypesResult.data || []
    kpiConfigs = kpiConfigsResult.data || []
    hasCustomThresholds = (kpiThresholdsResult.data?.length || 0) > 0
  }

  // In v0 preview, bypass the guard to allow dashboard access even without full binding
  if (!isSuperAdmin && selectedHotel && !guardResult.allowed && !isV0Preview) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <DashboardBlock result={guardResult} />
      </div>
    )
  }

  const capabilities = getCapabilities(pmsIntegration)
  console.log("[v0] TOTAL DashboardContent:", Date.now() - t0, "ms")

  return (
    <AppLayout
      initialData={{
        profile,
        hotels,
        selectedHotel,
        pmsIntegration,
        subscription,
        isSuperAdmin,
        isDeveloper,
        isImpersonating,
        roomTypes,
        hasMappings,
        etlStatus,
        capabilities,
        kpiConfigs,
        hasCustomThresholds,
        allHotels,
      }}
    >
      <DashboardShellClient
        userId={user.id}
        userEmail={user.email || ""}
        impersonatedHotelId={impersonatedHotelId}
        initialData={{
          profile,
          hotels,
          selectedHotel,
          pmsIntegration,
          subscription,
          isSuperAdmin,
          isDeveloper,
          isImpersonating,
          roomTypes,
          hasMappings,
          etlStatus,
          capabilities,
          kpiConfigs,
          hasCustomThresholds,
          allHotels,
        }}
      />
    </AppLayout>
  )
}
