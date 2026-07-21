import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { AvailabilityCalendar } from "@/components/calendar/availability-calendar"
import { SyncStatus } from "@/components/calendar/sync-status"
import { ImpersonationBanner } from "@/components/superadmin/impersonation-banner"
import { PageHeader } from "@/components/layout/page-header"
import { safeFetch } from "@/lib/utils/safe-fetch"

export const dynamic = "force-dynamic"

async function getCalendarPageData() {
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

export default async function CalendarPage() {
  const data = await getCalendarPageData()

  if (data.error || !data.profile) {
    redirect("/auth/login")
  }

  const profile = data.profile
  const isSuperAdmin = data.isSuperAdmin
  const impersonatedHotelId = data.impersonatedHotelId
  const isImpersonating = data.isImpersonating

  // Fetch hotels using allowed table
  const supabase = await createClient()
  let selectedHotel = null

  if (isImpersonating && impersonatedHotelId) {
    const { data: hotelData } = await supabase.from("hotels").select("*").eq("id", impersonatedHotelId).single()

    if (hotelData) {
      selectedHotel = hotelData
    }
  } else if (isSuperAdmin) {
    const { data: hotelsData } = await supabase.from("hotels").select("*").order("created_at", { ascending: true })

    selectedHotel = hotelsData && hotelsData.length > 0 ? hotelsData[0] : null
  } else if (profile?.organization_id) {
    const { data: hotelsData } = await supabase
      .from("hotels")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: true })

    selectedHotel = hotelsData && hotelsData.length > 0 ? hotelsData[0] : null
  }

  if (!selectedHotel) {
    redirect("/dashboard")
  }

  // Fetch organization name for impersonation banner
  let organizationName = null
  if (isImpersonating && selectedHotel?.organization_id) {
    const { data: org } = await supabase.from("hotels").select("organization_id").eq("id", selectedHotel.id).single()
    // We'll just show hotel name since org query is restricted
    organizationName = null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Calendario Disponibilità"
        description="Visualizza la disponibilità delle camere per tipologia e data"
      />

      {isImpersonating && selectedHotel && (
        <ImpersonationBanner hotelName={selectedHotel.name} organizationName={organizationName} />
      )}

      <main className="p-6">
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-6">
            <SyncStatus hotelId={selectedHotel.id} />
          </div>

          <AvailabilityCalendar hotelId={selectedHotel.id} />
        </div>
      </main>
    </div>
  )
}
