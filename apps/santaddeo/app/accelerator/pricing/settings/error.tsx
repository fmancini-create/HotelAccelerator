"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, RefreshCcw, Home } from "lucide-react"
import Link from "next/link"

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error("[v0] Settings page error:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            Errore nella pagina Impostazioni
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Si è verificato un errore nel caricamento delle impostazioni pricing.
          </p>
          
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-xs font-mono text-red-700 break-all">
              {error.message || "Errore sconosciuto"}
            </p>
            {error.digest && (
              <p className="text-xs text-red-500 mt-1">Digest: {error.digest}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={reset} variant="default" className="flex-1">
              <RefreshCcw className="h-4 w-4 mr-2" />
              Riprova
            </Button>
            <Link href="/accelerator/pricing" className="flex-1">
              <Button variant="outline" className="w-full">
                <Home className="h-4 w-4 mr-2" />
                Torna a Pricing
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
