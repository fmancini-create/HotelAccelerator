"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function FixMappingPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const runFix = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch("/api/dati/fix-mapping", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setResult(data)
    } catch (err: any) {
      console.error("[v0] Error fixing mapping:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fix Availability Mapping</h1>
        <p className="text-muted-foreground">Risolve il problema della disponibilità a zero nel calendario</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Problema Identificato</CardTitle>
          <CardDescription>
            I record con rooms_available &gt; 0 hanno room_type_id = null perché mancano i mapping tra Scidoo e
            SANTADDEO
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">Cosa fa questo script:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Identifica quali scidoo_room_type_id hanno disponibilità &gt; 0</li>
              <li>Verifica quali mapping esistono in room_types</li>
              <li>Crea automaticamente i room types mancanti per i codici Scidoo con disponibilità</li>
              <li>Attiva i room types inattivi che hanno disponibilità</li>
              <li>Elimina i vecchi record con rooms_available = 0</li>
              <li>Ti dice di risincronizzare la disponibilità da Impostazioni PMS</li>
            </ol>
          </div>

          <Button onClick={runFix} disabled={loading} size="lg" className="w-full">
            {loading ? "Esecuzione in corso..." : "Analizza e Correggi Mapping"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-4">
          {result.success && result.message && (
            <Alert>
              <AlertDescription className="font-semibold">{result.message}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Risultati</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Scidoo Room Types con disponibilità:</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
                  {JSON.stringify(result.scidooRoomTypes, null, 2)}
                </pre>
              </div>

              {result.createdMappings && result.createdMappings.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-green-600">✓ Mapping Creati:</h3>
                  <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
                    {JSON.stringify(result.createdMappings, null, 2)}
                  </pre>
                </div>
              )}

              {result.activatedRoomTypes && result.activatedRoomTypes.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-green-600">✓ Room Types Attivati:</h3>
                  <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
                    {JSON.stringify(result.activatedRoomTypes, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-2">Room Types SANTADDEO:</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
                  {JSON.stringify(result.santaddeoRoomTypes, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
