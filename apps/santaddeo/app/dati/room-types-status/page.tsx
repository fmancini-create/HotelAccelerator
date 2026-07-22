"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { useHotel } from "@/lib/contexts/hotel-context"

export default function RoomTypesStatusPage() {
  const { selectedHotel } = useHotel()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function checkStatus() {
    if (!selectedHotel) {
      setResult({ error: "Nessun hotel selezionato" })
      return
    }
    
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch("/api/dati/room-types-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: selectedHotel }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        setResult({ error: data.error || "Errore durante la verifica dei room types" })
        return
      }

      setResult(data)
    } catch (error) {
      setResult({ error: "Errore di connessione al server. Riprova piu' tardi." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-4">Verifica Stato Room Types</h1>
        <p className="text-muted-foreground mb-6">
          Verifica quali room types sono attivi e quali hanno dati di availability nel calendario.
        </p>

        <Button onClick={checkStatus} disabled={loading} className="mb-6">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verifica Stato
        </Button>

        {result && !result.error && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Totale Room Types</div>
                <div className="text-2xl font-bold">{result.totalRoomTypes}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Room Types Attivi</div>
                <div className="text-2xl font-bold text-green-600">{result.activeRoomTypes}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Room Types Inattivi</div>
                <div className="text-2xl font-bold text-red-600">{result.inactiveRoomTypes}</div>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Room Types Attivi (visualizzati nel calendario)</h3>
              <div className="space-y-2">
                {result.activeRoomTypesList.map((rt: any) => (
                  <Card key={rt.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="font-medium">{rt.name}</span>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          <div>Totale camere: {rt.total_rooms}</div>
                          <div>Codice Scidoo: {rt.scidoo_room_type_id || "N/A"}</div>
                          <div>Display order: {rt.display_order || "N/A"}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Record availability</div>
                        <div className="text-2xl font-bold">{rt.availabilityCount}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Con disponibilità &gt; 0: {rt.nonZeroCount}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {result.inactiveRoomTypesList.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Room Types Inattivi (NON visualizzati nel calendario)</h3>
                <div className="space-y-2">
                  {result.inactiveRoomTypesList.map((rt: any) => (
                    <Card key={rt.id} className="p-4 bg-muted/50">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <span className="font-medium">{rt.name}</span>
                        <span className="text-sm text-muted-foreground ml-auto">
                          Codice Scidoo: {rt.scidoo_room_type_id || "N/A"}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {result?.error && (
          <Card className="p-4 bg-destructive/10 border-destructive">
            <p className="text-destructive font-medium">Errore: {result.error}</p>
          </Card>
        )}
      </Card>
    </div>
  )
}
