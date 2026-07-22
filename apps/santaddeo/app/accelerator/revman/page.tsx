"use client"

import { useHotel } from "@/lib/contexts/hotel-context"
import { RevmanArea } from "@/components/revman/revman-area"
import { PageHeader } from "@/components/layout/page-header"

export default function AcceleratorRevmanPage() {
  const { selectedHotel } = useHotel()

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="Area Revenue Manager"
        description="Conversazioni con il consulente, attività in corso, file condivisi e storico chat Taddeo."
      />
      {!selectedHotel && (
        <div className="text-sm text-muted-foreground">Seleziona un hotel per visualizzare l&apos;area Revenue Manager.</div>
      )}
      {selectedHotel && <RevmanArea hotelId={selectedHotel.id} isStaff={false} />}
    </div>
  )
}
