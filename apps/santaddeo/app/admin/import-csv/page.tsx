"use client"
import { useState } from "react"

export default function ImportCsvPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function runImport() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/import-csv-production", { method: "POST" })
      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      setResult({ error: err.message })
    }
    setLoading(false)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Import CSV Production Data</h1>
      <button
        onClick={runImport}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {loading ? "Importing..." : "Run Import (2024 + 2025)"}
      </button>
      {result && (
        <pre className="mt-4 p-4 bg-gray-100 rounded overflow-auto text-sm">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}
