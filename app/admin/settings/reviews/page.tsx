import Link from "next/link"
import { ArrowRight, Wrench } from "lucide-react"

import { requireAdminPage } from "@/lib/auth/require-admin-page"
import { ReviewsSettingsForm } from "@/components/reviews/reviews-settings-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function ReviewsSettingsPage() {
  await requireAdminPage()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recensioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configura una sola volta le fonti recensioni della struttura. La stessa configurazione viene riutilizzata da HotelAccelerator, ManuBot e Santaddeo.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-medium"><Wrench className="h-4 w-4" /> Gestisci le recensioni operative</div>
            <p className="mt-1 text-sm text-muted-foreground">Apri l&apos;elenco condiviso e crea un ticket ManuBot direttamente da qualsiasi recensione.</p>
          </div>
          <Button asChild className="shrink-0 gap-2">
            <Link href="/admin/reviews">Apri recensioni <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </CardContent>
      </Card>

      <ReviewsSettingsForm />
    </div>
  )
}
