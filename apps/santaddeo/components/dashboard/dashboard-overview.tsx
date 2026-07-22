import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { AlertTriangle, Bed, BedDouble, Calendar, CheckCircle2, DollarSign, TrendingUp } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"

interface DashboardOverviewProps {
  hotelId: string
  hotelName: string
}

interface RoomTypeOccupancy {
  name: string
  totalRooms: number
  available: number
  occupied: number
}

interface RoomTypeAvailability {
  name: string
  totalRooms: number
  available: number
}

export async function DashboardOverview({ hotelId, hotelName }: DashboardOverviewProps) {
  const supabase = await createClient()

  // Calculate date range for dashboard (last 3 months rolling)
  // This ensures we show data across multiple billing periods
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(endDate.getMonth() - 3) // Last 3 months
  
  // Use UTC dates to avoid timezone issues (toLocaleDateString can shift dates based on server timezone)
  const today = endDate.toISOString().split("T")[0] // YYYY-MM-DD in UTC
  const firstDayStr = startDate.toISOString().split("T")[0] // YYYY-MM-DD in UTC

  console.log("[v0] Dashboard Overview - hotelId:", hotelId, "date range:", firstDayStr, "to", today, "today JS:", endDate, "today UTC:", today)

  // Fetch room types
  const { data: activeRoomTypes, error: roomTypesError } = await supabase
    .from("room_types")
    .select("id, name, total_rooms")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)

  // Calculate total rooms from ACTIVE room types only
  const totalRooms = activeRoomTypes?.reduce((sum, rt) => sum + (rt.total_rooms || 0), 0) || 0

  // Get today's availability for each room type
  const occupiedRoomsByType = new Map<string, number>()
  const availableRoomsByType = new Map<string, number>()

  for (const rt of activeRoomTypes || []) {
    availableRoomsByType.set(rt.id, rt.total_rooms || 0)
    occupiedRoomsByType.set(rt.id, 0)
  }

  // Get bookings for today to calculate occupancy
  // Use .gt("check_out_date", today) because checkout day = room is NOT occupied
  try {
    const { data: todayBookingsByRoom } = await supabase
      .from("bookings")
      .select("room_type_id, number_of_rooms")
      .eq("hotel_id", hotelId)
      .lte("check_in_date", today)
      .gt("check_out_date", today)
      .eq("is_cancelled", false)

    for (const booking of todayBookingsByRoom || []) {
      const roomTypeId = booking.room_type_id
      const numRooms = booking.number_of_rooms || 1
      occupiedRoomsByType.set(roomTypeId, (occupiedRoomsByType.get(roomTypeId) || 0) + numRooms)
      availableRoomsByType.set(roomTypeId, Math.max(0, (availableRoomsByType.get(roomTypeId) || 0) - numRooms))
    }
  } catch (error) {
    console.log("[v0] Error fetching occupancy:", error)
  }

  // Format room types with occupancy
  const roomTypesWithOccupancy: RoomTypeOccupancy[] =
    activeRoomTypes
      ?.map((rt) => ({
        name: rt.name,
        totalRooms: rt.total_rooms || 0,
        available: availableRoomsByType.get(rt.id) || 0,
        occupied: occupiedRoomsByType.get(rt.id) || 0,
      }))
      .filter((rt) => rt.totalRooms > 0) || []

  // Get available room types (those with rooms available today)
  const availableRoomTypesToday: RoomTypeAvailability[] =
    activeRoomTypes
      ?.map((rt) => {
        const available = availableRoomsByType.get(rt.id) || 0
        return {
          name: rt.name,
          totalRooms: rt.total_rooms || 0,
          available,
        }
      })
      .filter((rt) => rt.available > 0) || []

  // Fetch room revenue from normalized table rms_daily_room_revenue
  let roomRevenueData: { room_revenue: number; date: string }[] | null = null
  try {
    const { data, error } = await supabase
      .from("rms_daily_room_revenue")
      .select("room_revenue, date")
      .eq("hotel_id", hotelId)
      .gte("date", firstDayStr)
      .lte("date", today)

    if (error) {
      console.log("[v0] Error fetching room revenue:", error)
    }
    roomRevenueData = data
  } catch (error) {
    console.log("[v0] Error fetching room revenue:", error)
    roomRevenueData = []
  }

  // Fetch document type breakdown from rms_department_revenue (normalized from Scidoo)
  let departmentRevenueData: { document_type: string; revenue: number; date: string }[] | null = null
  try {
    const { data, error } = await supabase
      .from("rms_department_revenue")
      .select("document_type, revenue, date")
      .eq("hotel_id", hotelId)
      .gte("date", firstDayStr)
      .lte("date", today)
      .eq("source", "scidoo")

    console.log("[v0] Department revenue query params:", { hotelId, firstDayStr, today })
    console.log("[v0] Department revenue response:", { data_count: data?.length, error })

    if (error) {
      console.log("[v0] Error fetching department revenue:", error)
    }
    departmentRevenueData = data
  } catch (error) {
    console.log("[v0] Error fetching department revenue:", error)
    departmentRevenueData = []
  }

  // Calculate production totals from rms_daily_room_revenue (CORRECT source with complete data)
  // rms_daily_room_revenue has 8,978 records = €1.5M/year vs bookings has only 200 records = €86K
  const totalProduction =
    roomRevenueData?.reduce((sum, r) => sum + Number(r.room_revenue || 0), 0) || 0

  // Calculate today's production from rms_daily_room_revenue (same source for consistency)
  const todayProduction =
    roomRevenueData?.filter((r) => r.date === today).reduce((sum, r) => sum + Number(r.room_revenue || 0), 0) || 0

  console.log("[v0] Room revenue data - total records:", roomRevenueData?.length, "filtering for date:", today)
  console.log("[v0] Room revenue data - sample first 5:", roomRevenueData?.slice(0, 5))
  console.log("[v0] Room revenue data - sample today matches:", roomRevenueData?.filter((r) => r.date === today)?.slice(0, 3))

  // Calculate document type breakdown from department revenue (Scidoo provides: invoice, fee, etc)
  const invoicesTotal =
    departmentRevenueData?.filter((d) => d.document_type === "invoice").reduce((sum, d) => sum + Number(d.revenue || 0), 0) || 0

  const feesTotal =
    departmentRevenueData?.filter((d) => d.document_type === "fee").reduce((sum, d) => sum + Number(d.revenue || 0), 0) || 0

  const depositsTotal =
    departmentRevenueData?.filter((d) => d.document_type === "deposit").reduce((sum, d) => sum + Number(d.revenue || 0), 0) || 0

  // Note: If no data from Scidoo, these will be 0. Display "Dati non forniti dal PMS" in the UI.
  const hasScidooBreakdown = (departmentRevenueData?.length || 0) > 0

  console.log("[v0] Dashboard Overview - production data:", {
    totalProduction,
    todayProduction,
    invoicesTotal,
    feesTotal,
    depositsTotal,
    hasScidooBreakdown,
  })

  // Get today's bookings for booking stats
  let todayBookings = null
  let recentBookings = null
  let recentCancellations = null

  try {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("hotel_id", hotelId)
      .lte("check_in_date", today)
      .gte("check_out_date", today)
      .eq("is_cancelled", false)
    todayBookings = data
  } catch (error) {
    console.log("[v0] Error fetching bookings:", error)
    todayBookings = []
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE")

  try {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("hotel_id", hotelId)
      .gte("created_at", yesterday)
      .eq("is_cancelled", false)
    recentBookings = data
  } catch (error) {
    console.log("[v0] Error fetching recent bookings:", error)
    recentBookings = []
  }

  try {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("hotel_id", hotelId)
      .gte("updated_at", yesterday)
      .eq("is_cancelled", true)
    recentCancellations = data
  } catch (error) {
    console.log("[v0] Error fetching cancellations:", error)
    recentCancellations = []
  }

  const last24hBookings = recentBookings?.length || 0

  const last24hRoomNights =
  recentBookings?.reduce((sum: number, b: any) => {
  const nights = Number(b.number_of_nights || 0)
  if (nights > 0) return sum + nights
  const checkIn = new Date(b.check_in_date)
  const checkOut = new Date(b.check_out_date)
  const calcNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
  return sum + (calcNights > 0 ? calcNights : 0)
  }, 0) || 0
  
  const last24hRevenue = recentBookings?.reduce((sum: number, b: any) => sum + Number(b.total_price || 0), 0) || 0
  const last24hRevpor = last24hRoomNights > 0 ? last24hRevenue / last24hRoomNights : 0

  const last24hAvgPickup =
  recentBookings && recentBookings.length > 0
  ? recentBookings.reduce((sum: number, b: any) => {
  const createdAt = new Date(b.created_at)
  const checkIn = new Date(b.check_in_date)
  const pickupDays = Math.ceil((checkIn.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
  return sum + pickupDays
  }, 0) / recentBookings.length
  : 0

  const last24hCancellations = recentCancellations?.length || 0

  const last24hCancelledRoomNights =
    recentCancellations?.reduce((sum: number, c: any) => {
      const nights = Number(c.number_of_nights || 0)
      if (nights > 0) return sum + nights
      const checkIn = new Date(c.check_in_date)
      const checkOut = new Date(c.check_out_date)
      const calcNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
      return sum + (calcNights > 0 ? calcNights : 0)
    }, 0) || 0

  const last24hLostRevenue = recentCancellations?.reduce((sum: number, c: any) => sum + Number(c.total_price || 0), 0) || 0
  const last24hCancelRevpor = last24hCancelledRoomNights > 0 ? last24hLostRevenue / last24hCancelledRoomNights : 0

  const last24hCancelAvgPickup =
    recentCancellations && recentCancellations.length > 0
      ? recentCancellations.reduce((sum: number, c: any) => {
          const updatedAt = new Date(c.updated_at)
          const checkIn = new Date(c.check_in_date)
          const pickupDays = Math.ceil((checkIn.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
          return sum + pickupDays
        }, 0) / recentCancellations.length
      : 0

  let alertStatus: "green" | "orange" | "red" = "green"
  let alertMessage = "La struttura sembra performare al meglio! Complimenti"

  if (occupancyRate < 50) {
    alertStatus = "red"
    alertMessage = "Ci sono enormi problemi! Urge un intervento importante"
  } else if (occupancyRate < 70) {
    alertStatus = "orange"
    alertMessage = "Ci sono dei parametri che potresti migliorare"
  }

  return (
    <div className="space-y-6">
      {/* BOX A - Today's Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data & Performance</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Data</p>
              <div className="text-2xl font-bold">{new Date().toLocaleDateString("it-IT")}</div>
            </div>
            <div className="border-t pt-2 space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Occupazione</span>
                <span className="text-sm font-semibold">{occupancyRate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Camere Occupate</span>
                <span className="text-sm font-semibold">{occupiedRooms} / {totalRooms}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">RevPAR</span>
                <span className="text-sm font-semibold">
                  €{totalRooms > 0 ? (todayProduction / totalRooms).toFixed(2) : "0.00"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Camere Disponibili</CardTitle>
                <Bed className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{availableRooms}</div>
                <p className="text-xs text-muted-foreground mt-1">Vendibili oggi</p>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-80">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Dettaglio per Tipologia</h4>
              <div className="space-y-1.5">
                {roomTypeAvailability.length > 0 ? (
                  roomTypeAvailability.map((rt, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[200px]">{rt.name}</span>
                      <span className="font-medium">
                        {rt.available} / {rt.totalRooms}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nessuna camera disponibile</p>
                )}
              </div>
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Totale</span>
                  <span>
                    {availableRooms} / {totalRooms}
                  </span>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Camere Occupate</CardTitle>
                <BedDouble className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{occupiedRooms}</div>
                <p className="text-xs text-muted-foreground mt-1">{occupancyRate.toFixed(1)}% occupazione</p>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-80">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Dettaglio per Tipologia</h4>
              <div className="space-y-1.5">
                {roomTypeOccupancy.length > 0 ? (
                  roomTypeOccupancy.map((rt, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[200px]">{rt.name}</span>
                      <span className="font-medium">
                        {rt.occupied} / {rt.totalRooms}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nessuna camera occupata</p>
                )}
              </div>
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Totale</span>
                  <span>
                    {occupiedRooms} / {totalRooms}
                  </span>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fuori Servizio</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">Non vendibili</p>
          </CardContent>
        </Card>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Produzione Mese</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  €{totalProduction.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date().toLocaleString("it-IT", { month: "long", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-80">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Dettaglio Produzione</h4>
              {hasScidooBreakdown ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fatture</span>
                    <span className="font-medium">
                      €{invoicesTotal.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Corrispettivi</span>
                    <span className="font-medium">
                      €{feesTotal.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Depositi</span>
                    <span className="font-medium">
                      €{depositsTotal.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic py-2">
                  Dati non forniti dal PMS
                </div>
              )}
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Totale</span>
                  <span>€{totalProduction.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produzione Oggi</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              €{todayProduction.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Fatturato odierno</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ADR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€0.00</div>
            <p className="text-xs text-muted-foreground mt-1">Tariffa media giornaliera</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">RevPAR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€0.00</div>
            <p className="text-xs text-muted-foreground mt-1">Ricavo per camera disponibile</p>
          </CardContent>
        </Card>
      </div>

      {/* BOX B & C - Last 24h Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Ultime Prenotazioni (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Numero prenotazioni</span>
              <span className="font-semibold">{last24hBookings}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Room/Nights</span>
              <span className="font-semibold">{last24hRoomNights}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">RevPOR</span>
              <span className="font-semibold">€{last24hRevpor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Pick-up time medio</span>
              <span className="font-semibold">{last24hAvgPickup.toFixed(0)} giorni</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Ultime Cancellazioni (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Numero cancellazioni</span>
              <span className="font-semibold">{last24hCancellations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Room/Nights perse</span>
              <span className="font-semibold">{last24hCancelledRoomNights}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">RevPOR perso</span>
              <span className="font-semibold">€{last24hCancelRevpor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Pick-up time medio</span>
              <span className="font-semibold">{last24hCancelAvgPickup.toFixed(0)} giorni</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BOX D - Alert Status */}
      <Alert
        variant={alertStatus === "red" ? "destructive" : "default"}
        className={
          alertStatus === "green"
            ? "border-green-200 bg-green-50 text-green-900"
            : alertStatus === "orange"
              ? "border-orange-200 bg-orange-50 text-orange-900"
              : ""
        }
      >
        {alertStatus === "green" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        {alertStatus === "orange" && <AlertTriangle className="h-4 w-4 text-orange-600" />}
        {alertStatus === "red" && <AlertTriangle className="h-4 w-4" />}
        <AlertTitle className="font-semibold">
          {alertStatus === "green" && "Tutto OK"}
          {alertStatus === "orange" && "Attenzione"}
          {alertStatus === "red" && "Urgente"}
        </AlertTitle>
        <AlertDescription>{alertMessage}</AlertDescription>
      </Alert>
    </div>
  )
}
