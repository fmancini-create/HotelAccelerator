import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from "date-fns"
import { it } from "date-fns/locale"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import { safeFetch } from "@/lib/utils/safe-fetch"

export const dynamic = "force-dynamic"

async function getPageData() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const baseUrl = appUrl
    ? appUrl.startsWith("http") ? appUrl : `https://${appUrl}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"

  const { data, error } = await safeFetch<any>(`${baseUrl}/api/ui/me`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })

  if (error || !data) {
    return { error: error || "Failed to fetch" }
  }
  return data
}

export default async function DebugOccupancyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const data = await getPageData()

  if (data.error || !data.profile) {
    redirect("/auth/login")
  }

  const profile = data.profile
  const isSuperAdmin = data.isSuperAdmin
  const impersonatedHotelId = data.impersonatedHotelId
  const isImpersonating = data.isImpersonating

  const supabase = await createClient()
  const supabaseService = await createClient()
  
  let hotelId: string | null = null
  let hotelName: string | null = null

  if (isImpersonating && impersonatedHotelId) {
    hotelId = impersonatedHotelId
    const { data: hotelData } = await supabase.from("hotels").select("name").eq("id", impersonatedHotelId).maybeSingle()
    hotelName = hotelData?.name || null
  } else if (profile?.current_hotel_id) {
    hotelId = profile.current_hotel_id
    const { data: hotelData } = await supabase.from("hotels").select("name").eq("id", hotelId).maybeSingle()
    hotelName = hotelData?.name || null
  } else if (isSuperAdmin) {
    const { data: hotelsData } = await supabase.from("hotels").select("id, name").order("created_at").limit(1)
    hotelId = hotelsData?.[0]?.id || null
    hotelName = hotelsData?.[0]?.name || null
  } else if (profile?.organization_id) {
    const { data: hotelsData } = await supabase
      .from("hotels")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("created_at")
      .limit(1)
    hotelId = hotelsData?.[0]?.id || null
    hotelName = hotelsData?.[0]?.name || null
  }

  if (!hotelId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600">Nessun hotel selezionato</h1>
        <p className="mt-2">Vai al dashboard e seleziona un hotel.</p>
      </div>
    )
  }

  // Parse month from query or use current
  const currentDate = params.month ? new Date(params.month + "-01") : new Date()
  const startDate = startOfMonth(currentDate)
  const endDate = endOfMonth(currentDate)
  const prevMonth = format(subMonths(currentDate, 1), "yyyy-MM")
  const nextMonth = format(addMonths(currentDate, 1), "yyyy-MM")

  // Get room types
  const { data: roomTypes } = await supabaseService
    .from("room_types")
    .select("id, name, total_rooms, is_active")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("name")

  const startDateStr = format(startDate, "yyyy-MM-dd")
  const endDateStr = format(endDate, "yyyy-MM-dd")

  // Read from canonical daily_availability (populated by ETL)
  const { data: availability } = await supabaseService
    .from("daily_availability")
    .select("date, room_type_id, rooms_available, total_rooms, rooms_out_of_service")
    .eq("hotel_id", hotelId)
    .gte("date", startDateStr)
    .lte("date", endDateStr)
    .order("date")

  // Create a map of date -> room_type_id -> data
  const dataMap = new Map<string, Map<string, { available: number; total: number; oos: number }>>()
  for (const row of availability || []) {
    if (!dataMap.has(row.date)) {
      dataMap.set(row.date, new Map())
    }
    dataMap.get(row.date)?.set(row.room_type_id, {
      available: row.rooms_available || 0,
      total: row.total_rooms || 0,
      oos: row.rooms_out_of_service || 0,
    })
  }

  const days = eachDayOfInterval({ start: startDate, end: endDate })

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Occupazione Camere"
        description={`${hotelName} - Visualizzazione occupazione per tipologia e giorno`}
      />
      
      <main className="p-6">
        <div className="mx-auto max-w-[1800px]">
          <div className="flex items-center justify-between mb-4">
            <p className="text-muted-foreground">
              Room Types: {roomTypes?.length || 0} | Records: {availability?.length || 0}
            </p>
            <div className="flex gap-2">
              <Link href={`/occupancy?month=${prevMonth}`} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                Mese Prec.
              </Link>
              <span className="px-4 py-2 font-bold">{format(currentDate, "MMMM yyyy", { locale: it })}</span>
              <Link href={`/occupancy?month=${nextMonth}`} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                Mese Succ.
              </Link>
            </div>
          </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="border p-2 text-left sticky left-0 bg-muted z-10">Room Type</th>
              <th className="border p-2 text-center sticky left-[150px] bg-muted z-10">Tot</th>
              {days.map((day) => (
                <th key={day.toISOString()} className="border p-1 text-center min-w-[50px]">
                  <div className="text-xs">{format(day, "EEE", { locale: it })}</div>
                  <div className="font-bold">{format(day, "d")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roomTypes?.map((rt) => (
              <tr key={rt.id} className="hover:bg-muted/50">
                <td className="border p-2 font-medium sticky left-0 bg-background z-10 min-w-[150px]">
                  {rt.name}
                </td>
                <td className="border p-2 text-center sticky left-[150px] bg-background z-10">
                  {rt.total_rooms}
                </td>
                {days.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd")
                  const data = dataMap.get(dateStr)?.get(rt.id)
                  const occupied = data ? data.total - data.available : 0
                  const total = data?.total || rt.total_rooms || 0
                  const occupancyPct = total > 0 ? (occupied / total) * 100 : 0
                  
                  // Color based on occupancy
                  let bgColor = "bg-green-100"
                  if (occupancyPct >= 90) bgColor = "bg-red-200"
                  else if (occupancyPct >= 70) bgColor = "bg-orange-200"
                  else if (occupancyPct >= 50) bgColor = "bg-yellow-100"
                  else if (occupancyPct > 0) bgColor = "bg-green-100"
                  else bgColor = "bg-gray-50"
                  
                  return (
                    <td key={dateStr} className={`border p-1 text-center ${bgColor}`}>
                      <div className="font-bold">{occupied}</div>
                      <div className="text-xs text-muted-foreground">/{total}</div>
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Total row */}
            <tr className="bg-muted font-bold">
              <td className="border p-2 sticky left-0 bg-muted z-10">TOTALE</td>
              <td className="border p-2 text-center sticky left-[150px] bg-muted z-10">
                {roomTypes?.reduce((sum, rt) => sum + (rt.total_rooms || 0), 0)}
              </td>
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd")
                let totalOccupied = 0
                let totalRooms = 0
                roomTypes?.forEach((rt) => {
                  const data = dataMap.get(dateStr)?.get(rt.id)
                  if (data) {
                    totalOccupied += data.total - data.available
                    totalRooms += data.total
                  }
                })
                const occupancyPct = totalRooms > 0 ? (totalOccupied / totalRooms) * 100 : 0
                
                return (
                  <td key={dateStr} className="border p-1 text-center bg-muted">
                    <div className="font-bold">{totalOccupied}</div>
                    <div className="text-xs">{occupancyPct.toFixed(0)}%</div>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
      
      <div className="mt-4 flex gap-4 text-sm">
            <div className="flex items-center gap-2"><span className="w-4 h-4 bg-gray-50 border"></span> 0%</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-100 border"></span> 1-49%</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 bg-yellow-100 border"></span> 50-69%</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 bg-orange-200 border"></span> 70-89%</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 bg-red-200 border"></span> 90-100%</div>
          </div>
        </div>
      </main>
    </div>
  )
}
