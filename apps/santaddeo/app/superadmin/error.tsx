"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react"

export default function SuperAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[SuperAdmin] Client error:", error.message, error.stack)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl border shadow-sm p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Errore nel Pannello SuperAdmin</h1>
        <p className="text-sm text-muted-foreground mb-1">Si e' verificato un errore imprevisto.</p>
        {error.message && (
          <code className="block text-xs bg-slate-100 rounded p-2 mb-6 text-left break-all text-red-700">
            {error.message}
          </code>
        )}
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.location.href = "/dashboard"}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Riprova
          </Button>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground mt-4">Codice: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
