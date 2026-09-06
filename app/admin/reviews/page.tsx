import { ReviewsOperationsV3 } from "@/components/reviews/reviews-operations-v3"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

export const dynamic = "force-dynamic"

export default async function ReviewsPage() {
  await requireAdminPage()

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recensioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Analizza, traduci e rispondi alle recensioni condivise; trasforma una criticità in un ticket ManuBot già arricchito con camera, asset e dettagli operativi.
        </p>
      </div>
      <ReviewsOperationsV3 />
    </div>
  )
}