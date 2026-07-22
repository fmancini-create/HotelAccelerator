"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[v0] Dashboard error boundary caught:", error.message, error.stack)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-lg font-semibold">Errore nel caricamento della dashboard</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={reset}>Riprova</Button>
      </div>
    </div>
  )
}
