import { redirect } from "next/navigation"
import { getSettingsData } from "@/lib/settings/get-settings-data"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AdvancedIntegrationsForm } from "@/components/settings/advanced-integrations-form"

export const dynamic = "force-dynamic"

export default async function AdvancedSettingsPage() {
  const data = await getSettingsData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  const hotel = data.selectedHotel

  if (!hotel) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nessuna struttura trovata</CardTitle>
          <CardDescription>Completa la configurazione iniziale per accedere alle impostazioni avanzate</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrazioni Avanzate</CardTitle>
        <CardDescription>
          Configura le integrazioni con Google Analytics, API meteo e Booking.com per ottenere insights avanzati
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AdvancedIntegrationsForm hotel={hotel} />
      </CardContent>
    </Card>
  )
}
