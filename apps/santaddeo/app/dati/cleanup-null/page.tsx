"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function CleanupNullPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleCleanup = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/dati/cleanup-null", {
        method: "POST",
      })
      const data = await response.json()
      setResult(data)
    } catch (error) {
      console.error("Error:", error)
      setResult({ error: String(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Pulizia Record Corrotti</CardTitle>
          <CardDescription>
            Elimina tutti i record di availability con room_type_id null (dati corrotti/vecchi)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleCleanup} disabled={loading} size="lg">
            {loading ? "Pulizia in corso..." : "Elimina Record Corrotti"}
          </Button>

          {result && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-2">Risultato:</h3>
              <pre className="text-sm overflow-auto">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
