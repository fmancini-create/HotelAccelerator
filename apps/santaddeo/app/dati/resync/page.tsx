"use client"

import { useState } from "react"

export default function ResyncPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleResync = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch("/api/dati/resync", {
        method: "POST",
      })

      const data = await response.json()
      setResult(data)
    } catch (error: any) {
      setResult({ success: false, error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Pulizia e Risincronizzazione Completa</h1>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h2 className="font-semibold text-yellow-900 mb-2">Attenzione</h2>
        <p className="text-yellow-800">
          Questa operazione eliminerà TUTTI i dati di disponibilità esistenti e li riscaricherà da Scidoo. Assicurati di
          aver scaricato e attivato le tipologie di camere prima di procedere.
        </p>
      </div>

      <div className="space-y-4">
        <button
          onClick={handleResync}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Elaborazione..." : "Pulisci e Risincronizza"}
        </button>

        {result && (
          <div
            className={`p-4 rounded-lg ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
          >
            <h3 className="font-semibold mb-2">{result.success ? "Operazione Completata" : "Errore"}</h3>
            <pre className="text-sm overflow-auto">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
