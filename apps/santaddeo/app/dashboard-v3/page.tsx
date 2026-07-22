import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardV3Client } from "@/components/dashboard-v3/dashboard-v3-client"

export const metadata = {
  title: "Dashboard V3 | SANTADDEO",
  description: "Dashboard light theme - solo superadmin",
}

export default async function DashboardV3Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") redirect("/dashboard")

  const { data: hotels } = await supabase
    .from("hotels")
    .select("id, name, accommodation_type, total_rooms")
    .order("created_at", { ascending: true })

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
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><div className="text-gray-400 text-lg">Caricamento...</div></div>}>
      <DashboardV3Client
        hotels={hotels || []}
        initialHotelId={firstHotel?.id || ""}
        initialRoomTypes={roomTypes}
        userEmail={user.email || ""}
      />
    </Suspense>
  )
}
