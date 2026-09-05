import { ReviewsOperations } from "@/components/reviews/reviews-operations"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

export const dynamic = "force-dynamic"

export default async function ReviewsPage() {
  await requireAdminPage()

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recensioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Leggi le recensioni condivise della struttura e trasforma subito una criticità in un ticket ManuBot assegnato.
        </p>
      </div>
      <ReviewsOperations />
    </div>
  )
}
