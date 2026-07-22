"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface DatabaseStats {
  rawAvailabilityCount: number
  dailyAvailabilityCount: number
  rawSamples: any[]
  dailySamples: any[]
  roomTypeMappings: any[]
}

export default function DatabaseDebugPage() {
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDatabaseStats = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/dati/database-stats")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Errore nel caricamento dei dati")
      }

      setStats(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDatabaseStats()
  }, [])

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Verifica Database</h1>
          <p className="text-muted-foreground">Controlla i dati effettivamente presenti nel database</p>
        </div>
        <Button onClick={loadDatabaseStats} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Ricarica
        </Button>
      </div>

      {error && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">Errore</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {stats && (
        <>
          {/* Statistiche generali */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Dati Raw (PMS)</CardTitle>
                <CardDescription>Tabella: scidoo_raw_availability</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{stats.rawAvailabilityCount}</div>
                <p className="text-sm text-muted-foreground">record totali</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dati Processati (SANTADDEO)</CardTitle>
                <CardDescription>Tabella: daily_availability</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{stats.dailyAvailabilityCount}</div>
                <p className="text-sm text-muted-foreground">record totali</p>
              </CardContent>
            </Card>
          </div>

          {/* Room Type Mappings */}
          <Card>
            <CardHeader>
              <CardTitle>Mappature Room Types</CardTitle>
              <CardDescription>Mappature tra PMS e SANTADDEO</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.roomTypeMappings.length === 0 ? (
                  <p className="text-yellow-600">Nessuna mappatura trovata!</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Nome</th>
                          <th className="text-left p-2">ID PMS</th>
                          <th className="text-left p-2">SANTADDEO ID</th>
                          <th className="text-left p-2">Attivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.roomTypeMappings.map((mapping, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="p-2">{mapping.name}</td>
                            <td className="p-2 font-mono text-xs">{mapping.scidoo_room_type_id || "N/A"}</td>
                            <td className="p-2 font-mono text-xs">{mapping.id}</td>
                            <td className="p-2">
                              <span className={mapping.is_active ? "text-green-600" : "text-red-600"}>
                                {mapping.is_active ? "✓" : "✗"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Campioni dati raw */}
          <Card>
            <CardHeader>
              <CardTitle>Campioni Dati Raw (ultimi 10)</CardTitle>
              <CardDescription>Dati come arrivano da Scidoo</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.rawSamples.length === 0 ? (
                <p className="text-yellow-600">Nessun dato raw trovato!</p>
              ) : (
                <div className="overflow-x-auto">
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
                    {JSON.stringify(stats.rawSamples, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Campioni dati processati */}
          <Card>
            <CardHeader>
              <CardTitle>Campioni Dati Processati (ultimi 10)</CardTitle>
              <CardDescription>Dati dopo l'ETL in SANTADDEO</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.dailySamples.length === 0 ? (
                <p className="text-yellow-600">Nessun dato processato trovato!</p>
              ) : (
                <div className="overflow-x-auto">
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
                    {JSON.stringify(stats.dailySamples, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
