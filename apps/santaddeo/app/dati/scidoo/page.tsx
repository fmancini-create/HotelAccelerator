"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ScidooDebugPage() {
  const [loading, setLoading] = useState(false)
  const [apiCall, setApiCall] = useState<any>(null)
  const [rawData, setRawData] = useState<any>(null)
  const [mappedData, setMappedData] = useState<any>(null)
  const [savedData, setSavedData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const testScidooCall = async () => {
    setLoading(true)
    setError(null)
    setApiCall(null)
    setRawData(null)
    setMappedData(null)
    setSavedData(null)

    try {
      const response = await fetch("/api/dati/scidoo-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-01-07",
          endDate: "2026-01-14",
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      setApiCall(data.apiCall)
      setRawData(data.rawData)
      setMappedData(data.mappedData)
      setSavedData(data.savedData)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Scidoo Debug Test</h1>
        <Button onClick={testScidooCall} disabled={loading}>
          {loading ? "Testing..." : "Test Scidoo API"}
        </Button>
      </div>

      {error && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm overflow-auto">{error}</pre>
          </CardContent>
        </Card>
      )}

      {apiCall && (
        <Card>
          <CardHeader>
            <CardTitle>1. API Call to Scidoo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <strong>URL:</strong> {apiCall.url}
              </div>
              <div>
                <strong>Method:</strong> {apiCall.method}
              </div>
              <div>
                <strong>Headers:</strong>
                <pre className="text-sm bg-muted p-2 rounded mt-1 overflow-auto">
                  {JSON.stringify(apiCall.headers, null, 2)}
                </pre>
              </div>
              <div>
                <strong>Body:</strong>
                <pre className="text-sm bg-muted p-2 rounded mt-1 overflow-auto">
                  {JSON.stringify(apiCall.body, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {rawData && (
        <Card>
          <CardHeader>
            <CardTitle>2. Raw Data from Scidoo ({rawData.count} records)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm bg-muted p-4 rounded overflow-auto max-h-96">
              {JSON.stringify(rawData.sample, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {mappedData && (
        <Card>
          <CardHeader>
            <CardTitle>3. Mapped Data (ETL Processing)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <strong>Room Type Mappings:</strong>
                <pre className="text-sm bg-muted p-2 rounded mt-1 overflow-auto">
                  {JSON.stringify(mappedData.roomTypeMappings, null, 2)}
                </pre>
              </div>
              <div>
                <strong>Mapped Records ({mappedData.count} total):</strong>
                <pre className="text-sm bg-muted p-2 rounded mt-1 overflow-auto max-h-96">
                  {JSON.stringify(mappedData.sample, null, 2)}
                </pre>
              </div>
              <div>
                <strong>Failed Mappings:</strong>
                <pre className="text-sm bg-muted p-2 rounded mt-1 overflow-auto">
                  {JSON.stringify(mappedData.failed, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {savedData && (
        <Card>
          <CardHeader>
            <CardTitle>4. Saved to Database</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <strong>Inserted:</strong> {savedData.inserted}
              </div>
              <div>
                <strong>Updated:</strong> {savedData.updated}
              </div>
              <div>
                <strong>Failed:</strong> {savedData.failed}
              </div>
              <div>
                <strong>Sample Saved Records:</strong>
                <pre className="text-sm bg-muted p-2 rounded mt-1 overflow-auto max-h-96">
                  {JSON.stringify(savedData.sample, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
