"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function CheckDataPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const checkData = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/dati/check-data", {
        method: "POST",
      })
      const data = await response.json()
      setResult(data)
    } catch (error) {
      console.error("[v0] Error checking data:", error)
      setResult({ error: String(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Verifica Dati Database</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Questa pagina verifica lo stato dei dati nel database per capire perché il calendario mostra disponibilità a
            zero.
          </p>

          <Button onClick={checkData} disabled={loading}>
            {loading ? "Verifica in corso..." : "Verifica Dati"}
          </Button>

          {result && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <h3 className="font-semibold mb-2">Room Types:</h3>
                <pre className="text-xs overflow-auto">{JSON.stringify(result.roomTypes, null, 2)}</pre>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <h3 className="font-semibold mb-2">Availability con room_type_id valido:</h3>
                <pre className="text-xs overflow-auto">{JSON.stringify(result.availabilityWithRoomType, null, 2)}</pre>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <h3 className="font-semibold mb-2">Availability con room_type_id null:</h3>
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(result.availabilityWithoutRoomType, null, 2)}
                </pre>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <h3 className="font-semibold mb-2">Statistiche:</h3>
                <pre className="text-xs overflow-auto">{JSON.stringify(result.stats, null, 2)}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
