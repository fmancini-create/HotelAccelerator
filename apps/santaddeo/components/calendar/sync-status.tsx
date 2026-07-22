"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, RefreshCw, Database, AlertCircle, CheckCircle2 } from "lucide-react"

interface SyncStatusProps {
  hotelId: string
}

export function SyncStatus({ hotelId }: SyncStatusProps) {
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const router = useRouter()

  async function handleSync() {
    setSyncing(true)
    setStatus("idle")
    setMessage("")

    try {
      console.log("[v0] Starting Scidoo sync...")

      const today = new Date()
      const startDate = new Date(today)
      startDate.setDate(today.getDate() - 30)
      const endDate = new Date(today)
      endDate.setDate(today.getDate() + 365)

      const startDateStr = startDate.toISOString().split("T")[0]
      const endDateStr = endDate.toISOString().split("T")[0]

      const syncResponse = await fetch("/api/scidoo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          startDate: startDateStr,
          endDate: endDateStr,
        }),
      })

      if (!syncResponse.ok) {
        const errorData = await syncResponse.json()
        throw new Error(errorData.error || "Errore durante la sincronizzazione da Scidoo")
      }

      const syncResult = await syncResponse.json()
      console.log("[v0] Scidoo sync response:", syncResult)

      if (syncResult.jobId) {
        console.log("[v0] Sync job started:", syncResult.jobId)
        setMessage("Sincronizzazione avviata in background...")

        // Poll job status every 3 seconds
        let attempts = 0
        const maxAttempts = 30 // 90 seconds max

        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 3000))

          const statusResponse = await fetch(`/api/scidoo/sync/${syncResult.jobId}`)
          if (!statusResponse.ok) {
            console.warn("[v0] Failed to fetch job status, continuing...")
            attempts++
            continue
          }

          const statusData = await statusResponse.json()
          console.log("[v0] Job status response:", statusData)

          const jobStatus = statusData.job?.status

          if (jobStatus === "completed") {
            console.log("[v0] Sync job completed:", statusData.job)
            setStatus("success")
            const stats = statusData.job.stats || {}
            setMessage(`Sincronizzazione completata! Importate ${stats.bookings_imported || 0} prenotazioni.`)
            break
          } else if (jobStatus === "failed") {
            throw new Error(statusData.job.error_message || "Sincronizzazione fallita")
          } else if (!jobStatus) {
            console.warn("[v0] Job not found, may have been processed already")
            break
          }

          attempts++
          setMessage(`Sincronizzazione in corso... (${attempts}/${maxAttempts})`)
        }

        if (attempts >= maxAttempts) {
          setMessage("Sincronizzazione in corso... Ricarica la pagina tra qualche minuto per vedere i dati.")
        }
      } else if (syncResult.stats) {
        // Direct sync completed
        console.log("[v0] Direct sync completed:", syncResult.stats)
        setStatus("success")
        setMessage(
          `Sincronizzazione completata! Importate ${syncResult.stats.bookings?.imported || 0} prenotazioni e ${syncResult.stats.availability?.imported || 0} disponibilità.`,
        )
      }

      // Step 2: Run ETL process
      console.log("[v0] Starting ETL process...")
      const etlResponse = await fetch("/api/etl/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
      })

      if (!etlResponse.ok) {
        console.warn("[v0] ETL process failed, but sync completed")
      } else {
        const etlResult = await etlResponse.json()
        console.log("[v0] ETL process completed:", etlResult)
      }

      // Only use router.refresh() which is safer
      setTimeout(() => {
        router.refresh()
      }, 1500)
    } catch (error) {
      console.error("[v0] Sync error:", error)
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "Errore durante la sincronizzazione")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Sincronizzazione Dati</h3>
            <p className="text-xs text-muted-foreground">Importa disponibilità e prenotazioni da Scidoo</p>
          </div>
        </div>
        <Button onClick={handleSync} disabled={syncing} size="sm">
          {syncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sincronizzazione...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sincronizza Ora
            </>
          )}
        </Button>
      </div>

      {status === "success" && (
        <Alert className="mt-4 border-green-500 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{message}</AlertDescription>
        </Alert>
      )}

      {status === "error" && (
        <Alert className="mt-4 border-red-500 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{message}</AlertDescription>
        </Alert>
      )}

      {message && status === "idle" && (
        <Alert className="mt-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </Card>
  )
}
