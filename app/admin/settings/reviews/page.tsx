import { requireAdminPage } from "@/lib/auth/require-admin-page"
import { ReviewsSettingsForm } from "@/components/reviews/reviews-settings-form"

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
      <ReviewsSettingsForm />
    </div>
  )
}
