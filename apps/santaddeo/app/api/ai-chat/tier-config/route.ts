import { createClient, getAuthUser } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

// Demo user for v0 preview
const V0_DEMO_USER = {
  id: "5de43b7b-e661-4e4e-8177-7943df06470c",
  email: "f.mancini@4bid.it",
}

// GET - Get tier config for a hotel or all hotels
export async function GET(request: NextRequest) {
  try {
    // DEV MODE bypass
    const isV0Preview = await isDevAuthAsync()
    let user: { id: string; email: string } | null = null

    if (isV0Preview) {
      user = V0_DEMO_USER
    } else {
      const authClient = await createClient()
      const authUser = await getAuthUser(authClient)
      user = authUser ? { id: authUser.id, email: authUser.email || "" } : null
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const hotelId = searchParams.get("hotelId")

    if (hotelId) {
      // Check base tier config (manual override by superadmin)
      const { data: config } = await supabase
        .from("chat_tier_config")
        .select("*")
        .eq("hotel_id", hotelId)
        .maybeSingle()

      let tier = config?.tier || "free"

      // If no manual config, check if hotel has active Accelerator subscription -> tier = standard
      if (!config) {
        const { data: subscription } = await supabase
          .from("accelerator_subscriptions")
          .select("id, is_active")
          .eq("hotel_id", hotelId)
          .eq("is_active", true)
          .maybeSingle()

        if (subscription) {
          tier = "standard"
        }
      }

      // Check if hotel has active premium_expert addon - upgrades to advanced
      const { data: addon } = await supabase
        .from("addon_subscriptions")
        .select("id, status")
        .eq("hotel_id", hotelId)
        .eq("addon_type", "premium_expert")
        .eq("status", "active")
        .maybeSingle()

      if (addon) {
        tier = "advanced"
      }

      return NextResponse.json({ 
        tier, 
        config,
        hasPremiumExpert: !!addon,
        hasAccelerator: tier === "standard" || tier === "advanced",
      })
    }

    // Get all configs (for superadmin)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    // FIX: il role canonico in `profiles` e' "super_admin" (con underscore),
    // non "system_admin" (vedi memoria 03/05/2026 e CHECK constraint sulla
    // tabella). Prima il check restituiva sempre 403 al superadmin: il GET
    // ritornava livelli vuoti (UI in fallback "Free") e il POST non salvava
    // mai il livello selezionato.
    const isSuperAdmin = profile?.role === "super_admin"
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get manual overrides
    const { data: configs } = await supabase
      .from("chat_tier_config")
      .select("*, hotels(name)")
      .order("enabled_at", { ascending: false })

    // Get all hotels with active Accelerator subscriptions
    const { data: accSubs } = await supabase
      .from("accelerator_subscriptions")
      .select("hotel_id")
      .eq("is_active", true)

    // Get all hotels with active premium_expert addon
    const { data: addonSubs } = await supabase
      .from("addon_subscriptions")
      .select("hotel_id")
      .eq("addon_type", "premium_expert")
      .eq("status", "active")

    const manualConfigs = configs || []
    const manualHotelIds = new Set(manualConfigs.map((c: any) => c.hotel_id))
    const accHotelIds = new Set((accSubs || []).map((s: any) => s.hotel_id))
    const addonHotelIds = new Set((addonSubs || []).map((s: any) => s.hotel_id))

    // Enrich configs: compute effective tier for each manual config
    const enrichedConfigs = manualConfigs.map((c: any) => ({
      ...c,
      effective_tier: addonHotelIds.has(c.hotel_id) ? "advanced" 
        : c.tier !== "free" ? c.tier 
        : accHotelIds.has(c.hotel_id) ? "standard" 
        : "free",
    }))

    // Add synthetic configs for hotels with subscriptions but no manual override
    for (const sub of (accSubs || [])) {
      if (!manualHotelIds.has(sub.hotel_id)) {
        enrichedConfigs.push({
          hotel_id: sub.hotel_id,
          tier: addonHotelIds.has(sub.hotel_id) ? "advanced" : "standard",
          effective_tier: addonHotelIds.has(sub.hotel_id) ? "advanced" : "standard",
          enabled_at: null,
          source: "subscription",
        })
      }
    }

    return NextResponse.json({ configs: enrichedConfigs })
  } catch (error) {
    console.error("Error fetching tier config:", error)
    return NextResponse.json({ error: "Errore" }, { status: 500 })
  }
}

// POST - Set tier for a hotel (superadmin only)
export async function POST(request: NextRequest) {
  try {
    // DEV MODE bypass
    const isV0Preview = await isDevAuthAsync()
    let user: { id: string; email: string } | null = null

    if (isV0Preview) {
      user = V0_DEMO_USER
    } else {
      const authClient = await createClient()
      const authUser = await getAuthUser(authClient)
      user = authUser ? { id: authUser.id, email: authUser.email || "" } : null
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    // FIX: il role canonico in `profiles` e' "super_admin" (con underscore),
    // non "system_admin" (vedi memoria 03/05/2026 e CHECK constraint sulla
    // tabella). Prima il check restituiva sempre 403 al superadmin: il GET
    // ritornava livelli vuoti (UI in fallback "Free") e il POST non salvava
    // mai il livello selezionato.
    const isSuperAdmin = profile?.role === "super_admin"
    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { hotelId, tier } = await request.json()

    if (!hotelId || !["free", "standard", "advanced"].includes(tier)) {
      return NextResponse.json({ error: "Parametri non validi" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("chat_tier_config")
      .upsert(
        {
          hotel_id: hotelId,
          tier,
          enabled_by: user.id,
          enabled_at: new Date().toISOString(),
        },
        { onConflict: "hotel_id" }
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, config: data })
  } catch (error) {
    console.error("Error setting tier config:", error)
    return NextResponse.json({ error: "Errore" }, { status: 500 })
  }
}
