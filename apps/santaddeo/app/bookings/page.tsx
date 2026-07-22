import { redirect } from "next/navigation"
import { BookingsList } from "@/components/bookings/bookings-list"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase/server"
import { RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { getSettingsData } from "@/lib/settings/get-settings-data"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Prenotazioni | SANTADDEO",
  description: "Lista delle prenotazioni sincronizzate dal PMS",
}

export default async function BookingsPage() {
  const data = await getSettingsData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  const isSuperAdmin = data.isSuperAdmin
  const selectedHotel = data.selectedHotel

  if (!selectedHotel) {
    redirect(isSuperAdmin ? "/superadmin" : "/onboarding")
  }

  // Fetch last sync time from pms_cron_settings using service role client
  const supabase = await createClient()
  const { data: cronSettings } = await supabase
    .from("pms_cron_settings")
    .select("last_run")
    .eq("hotel_id", selectedHotel.id)
    .eq("module", "bookings")
    .maybeSingle()

  const lastSync = cronSettings?.last_run

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Prenotazioni" description="Lista delle prenotazioni sincronizzate dal PMS" />
      
      {/* Last Sync Info */}
      {lastSync && (
        <div className="bg-muted/50 border-b px-6 py-2 flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Ultima sincronizzazione: <strong className="text-foreground">{format(new Date(lastSync), "dd MMM yyyy 'alle' HH:mm", { locale: it })}</strong></span>
        </div>
      )}
      
      <div className="container mx-auto py-6 px-6">
        <BookingsList hotelId={selectedHotel.id} />
      </div>
    </div>
  )
}
