import Link from "next/link"
import { ArrowRight, Settings2, Wrench } from "lucide-react"

import { requireAdminPage } from "@/lib/auth/require-admin-page"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
import { ReviewsOperations } from "@/components/reviews/reviews-operations"
import { ReviewsSettingsForm } from "@/components/reviews/reviews-settings-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function ReviewsSettingsPage() {
  await requireAdminPage()
  const identity = await getCallerIdentity()
  const reviewsActive = Boolean(
    identity?.propertyId && await isModuleActive(createServiceClient(), identity.propertyId, "reviews")
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recensioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestisci le recensioni della struttura, crea ticket ManuBot e configura le fonti condivise della suite 4BID.
        </p>
      </div>

      {reviewsActive ? (
        <>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-medium"><Wrench className="h-4 w-4" /> Azioni operative</div>
                <p className="mt-1 text-sm text-muted-foreground">Il pulsante <strong>Crea ticket</strong> è disponibile direttamente su ogni recensione.</p>
              </div>
              <Button asChild variant="outline" className="shrink-0 gap-2">
                <Link href="/admin/reviews">Apri a pagina intera <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
          <ReviewsOperations />
        </>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4" /> Impostazioni fonti</CardTitle></CardHeader>
        <CardContent>
          <ReviewsSettingsForm />
        </CardContent>
      </Card>
    </div>
  )
}
