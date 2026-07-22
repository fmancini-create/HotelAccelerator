"use client"

import { useHotel } from "@/lib/contexts/hotel-context"
import { PageHeader } from "@/components/layout/page-header"
import { ReviewsClient } from "@/components/reviews/reviews-client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export default function ReviewsPage() {
  const { selectedHotel } = useHotel()

  if (!selectedHotel) {
    return (
      <div>
        <PageHeader
          title="Recensioni"
          description="Reputazione e insight AI dalle OTA"
        />
        <div className="p-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Seleziona un hotel per continuare.</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Recensioni"
        description={`Reputazione e insight AI per ${selectedHotel.name}`}
      />
      <ReviewsClient hotelId={selectedHotel.id} />
    </div>
  )
}
