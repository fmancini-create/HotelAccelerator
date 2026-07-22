import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")
    const addonType = searchParams.get("addonType")

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })
    }

    let query = supabase
      .from("addon_subscriptions")
      .select("*")
      .eq("hotel_id", hotelId)

    if (addonType) {
      query = query.eq("addon_type", addonType)
    }

    const { data: addons, error } = await query

    if (error) {
      console.error("Error fetching addons:", error)
      return NextResponse.json({ error: "Errore nel recupero degli addon" }, { status: 500 })
    }

    // Check if premium_expert is active
    const premiumExpert = addons?.find(a => a.addon_type === "premium_expert" && a.status === "active")

    return NextResponse.json({
      addons: addons || [],
      hasPremiumExpert: !!premiumExpert,
      premiumExpert: premiumExpert || null,
    })
  } catch (error) {
    console.error("Status error:", error)
    return NextResponse.json(
      { error: "Errore interno" },
      { status: 500 }
    )
  }
}
