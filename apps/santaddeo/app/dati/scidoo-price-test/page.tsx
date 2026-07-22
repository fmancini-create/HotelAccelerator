"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react"

export default function ScidooPriceTestPage() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  
  const [testPrice, setTestPrice] = useState("999")
  const [testDate, setTestDate] = useState(new Date().toISOString().split("T")[0])
  const [dryRun, setDryRun] = useState(true)

  const runTest = async () => {
    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await fetch("/api/dati/scidoo-price-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testPrice: parseFloat(testPrice),
          testDate,
          dryRun
        }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP error ${response.status}`)
      }

      setResults(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const StepIcon = ({ success }: { success: boolean }) => {
    if (success) {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />
    }
    return <XCircle className="h-5 w-5 text-red-500" />
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Test Push Prezzi Scidoo</h1>
        <p className="text-muted-foreground mt-1">
          Verifica se il sistema può scrivere correttamente i prezzi sul PMS Scidoo
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parametri Test</CardTitle>
          <CardDescription>
            Configura i parametri per il test. In modalità "Dry Run" il sistema testa 
            solo la connessione senza inviare effettivamente i prezzi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="testPrice">Prezzo di Test (€)</Label>
              <Input
                id="testPrice"
                type="number"
                value={testPrice}
                onChange={(e) => setTestPrice(e.target.value)}
                placeholder="999"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="testDate">Data di Test</Label>
              <Input
                id="testDate"
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <Label htmlFor="dryRun" className="font-medium">Modalità Dry Run</Label>
              <p className="text-sm text-muted-foreground">
                {dryRun 
                  ? "Il test NON invierà prezzi a Scidoo (solo verifica connessione)"
                  : "Il test INVIERÀ il prezzo a Scidoo (operazione LIVE!)"}
              </p>
            </div>
            <Switch
              id="dryRun"
              checked={dryRun}
              onCheckedChange={setDryRun}
            />
          </div>

          {!dryRun && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm font-medium">
                Attenzione: il prezzo verrà effettivamente inviato a Scidoo!
              </span>
            </div>
          )}

          <Button onClick={runTest} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Test in corso...
              </>
            ) : (
              `Esegui Test ${dryRun ? "(Dry Run)" : "(LIVE)"}`
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Errore
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-red-800 whitespace-pre-wrap">{error}</pre>
          </CardContent>
        </Card>
      )}

      {results && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {results.summary?.allStepsSuccessful ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                Risultati Test
              </CardTitle>
              <CardDescription>
                {results.timestamp} - {results.dryRun ? "Dry Run" : "LIVE"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {results.steps?.map((step: any, idx: number) => (
                  <div 
                    key={idx} 
                    className={`p-4 rounded-lg border ${
                      step.success 
                        ? "bg-green-50 border-green-200" 
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <StepIcon success={step.success} />
                      <span className="font-medium">
                        Step {step.step}: {step.name}
                      </span>
                    </div>
                    
                    {step.error && (
                      <p className="text-sm text-red-700 mb-2">{step.error}</p>
                    )}
                    
                    {step.data && (
                      <pre className="text-xs bg-white/50 p-2 rounded overflow-auto max-h-48">
                        {JSON.stringify(step.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risposta Completa</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
                {JSON.stringify(results, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
