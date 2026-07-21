"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (error) {
      console.error("[v0] Global error:", error.message || error)
      console.error("[v0] Error stack:", error.stack)
    }
  }, [error])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl border shadow-sm p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="h-14 w-14 rounded-full bg-orange-50 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-orange-500" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Qualcosa e' andato storto</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Si e' verificato un errore imprevisto. Prova a ricaricare la pagina.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            <Home className="h-4 w-4 mr-2" />
            Home
          </Button>
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Riprova
          </Button>
        </div>
        {error?.digest && (
          <p className="text-xs text-muted-foreground mt-4">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
