import { redirect } from "next/navigation"
import { getSettingsData } from "@/lib/settings/get-settings-data"
import { HotelSettingsForm } from "@/components/settings/hotel-settings-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function HotelSettingsPage() {
  const data = await getSettingsData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  if (!data.selectedHotel) {
    redirect("/onboarding")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informazioni Struttura</CardTitle>
        <CardDescription>Modifica i dati della tua struttura</CardDescription>
      </CardHeader>
      <CardContent>
        <HotelSettingsForm
          hotel={data.selectedHotel}
          organization={data.organization}
          isSuperAdmin={data.isSuperAdmin ?? false}
        />
      </CardContent>
    </Card>
  )
}
