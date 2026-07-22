import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardV2Client } from "@/components/dashboard-v2/dashboard-v2-client"

export const metadata = {
  title: "Dashboard V2 | SANTADDEO",
  description: "Dashboard premium - solo superadmin",
}

export default async function DashboardV2Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") redirect("/dashboard")

  // Get all hotels for superadmin
  const { data: hotels } = await supabase
    .from("hotels")
    .select("id, name")
    .order("created_at", { ascending: true })

  // Get room types for first hotel
  const firstHotel = hotels?.[0]
  let roomTypes: any[] = []
  if (firstHotel) {
    const { data: rt } = await supabase
      .from("room_types")
      .select("id, name, pms_room_type_id, total_rooms, is_active, display_order")
      .eq("hotel_id", firstHotel.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
    roomTypes = rt || []
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-zinc-500 text-lg">Caricamento...</div></div>}>
      <DashboardV2Client
        hotels={hotels || []}
        initialHotelId={firstHotel?.id || ""}
        initialRoomTypes={roomTypes}
        userEmail={user.email || ""}
      />
    </Suspense>
  )
}
