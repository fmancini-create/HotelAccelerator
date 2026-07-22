import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { getSellerRevmanHotels } from "@/lib/sales/revman-access"

export const dynamic = "force-dynamic"

// Elenca gli hotel a cui il venditore corrente ha accesso RevMan (sola lettura).
export async function GET() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createServiceRoleClient()
  if (isV0Preview) return NextResponse.json({ hotels: [] })

  const authClient = await createClient()
  const user = await getAuthUser(authClient)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Consenti l'accesso ai sales_agent "puri" e ai dual-role (property_admin che
  // e' anche venditore): se non e' sales_agent ma ha una riga sales_agents,
  // l'unione in getSellerRevmanHotels restituira' comunque le sue associazioni.
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (!profile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    // Unione grant espliciti + strutture associate (vedi lib/sales/revman-access).
    const hotels = await getSellerRevmanHotels(supabase, user.id)
    return NextResponse.json({
      hotels: hotels.map((h) => ({
        hotel_id: h.hotel_id,
        hotel_name: h.hotel_name,
        granted_at: h.granted_at,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "db_error" }, { status: 500 })
  }
}
