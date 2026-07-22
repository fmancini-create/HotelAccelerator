import { redirect } from "next/navigation"
import { getSettingsData } from "@/lib/settings/get-settings-data"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ApiKeysPanel } from "@/components/settings/api-keys-panel"

export const dynamic = "force-dynamic"

export default async function ApiSettingsPage() {
  const data = await getSettingsData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  if (!data.organization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nessuna organizzazione</CardTitle>
          <CardDescription>Completa la configurazione iniziale per accedere alle API</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API e Integrazioni</CardTitle>
        <CardDescription>
          Gestisci le chiavi API per connettere i tuoi applicativi esterni (CRM, Contabilita', ecc.) con Santaddeo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ApiKeysPanel hotelId={data.selectedHotel?.id} />
      </CardContent>
    </Card>
  )
}
