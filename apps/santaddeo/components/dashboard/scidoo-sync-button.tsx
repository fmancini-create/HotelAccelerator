"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Download, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface ScidooSyncButtonProps {
  hotelId: string
  variant?: "default" | "outline" | "ghost"
  className?: string
  compact?: boolean
}

async function safeJsonParse(response: Response): Promise<any | null> {
  try {
    if (!response.ok) {
      console.warn(`[v0] Response not OK: ${response.status}`)
      return null
    }
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      console.warn(`[v0] Response not JSON: ${contentType}`)
      return null
    }
    return await response.json()
  } catch (error) {
    console.warn(`[v0] JSON parse error:`, error)
    return null
  }
}

export function ScidooSyncButton({ hotelId, variant = "outline", className, compact = false }: ScidooSyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle")
  const [syncResult, setSyncResult] = useState<any>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const { toast } = useToast()

  const isDevMode = hotelId.startsWith("00000000-")

  useEffect(() => {
    if (syncStatus === "syncing" && showDialog) {
      const timer = setTimeout(() => {
        setShowDialog(false)
        toast({
          title: "Sincronizzazione in corso",
          description: "Puoi seguire il progresso dalla barra in alto nella dashboard",
        })
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [syncStatus, showDialog, toast])

  useEffect(() => {
    if (!jobId || syncStatus !== "syncing") return

    const baseInterval = 5000
    const pollInterval = baseInterval * Math.pow(1.5, Math.min(retryCount, 5))

    const interval = setInterval(async () => {
      try {
        console.log(`[v0] Polling job status: ${jobId} (attempt ${retryCount + 1})`)

        const response = await fetch(`/api/scidoo/sync/${jobId}`, {
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
        })

        if (response.status === 429) {
          console.warn("[v0] Rate limit hit, backing off...")
          setLastError("Rate limit - backing off")
          setRetryCount((prev) => prev + 1)
          return
        }

        const result = await safeJsonParse(response)
        if (!result) {
          console.warn("[v0] Failed to parse job status response")
          setRetryCount((prev) => prev + 1)
          return
        }

        if (result.success && result.job) {
          const job = result.job

          setRetryCount(0)
          setLastError(null)

          if (job.status === "completed") {
            console.log("[v0] Sync completed successfully:", job.stats)
            setSyncStatus("success")
            setSyncResult(job.stats)
            setIsSyncing(false)
            clearInterval(interval)

            localStorage.removeItem("activeSyncJobId")
            localStorage.removeItem("activeSyncHotelId")
            localStorage.removeItem("activeSyncTimestamp")

            setTimeout(() => {
              setShowDialog(false)
              // Do NOT use window.location.reload() - causes infinite loops
              // Use router.refresh() for a soft refresh instead
            }, 3000)
          } else if (job.status === "failed") {
            console.error("[v0] Sync failed:", job.error_message)
            setSyncStatus("error")
            setSyncResult({ error: job.error_message })
            setIsSyncing(false)
            clearInterval(interval)

            localStorage.removeItem("activeSyncJobId")
          } else if (job.status === "in_progress" || job.status === "pending") {
            console.log(`[v0] Sync in progress: ${job.status}`, job.stats)
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error("[v0] Error polling job status:", errorMessage)

        setLastError(errorMessage)
        setRetryCount((prev) => prev + 1)

        if (retryCount >= 15) {
          console.warn("[v0] Too many polling failures, but sync may still be running in background")
          setRetryCount(8) // Reset to high retry level for very slow polling
        }
      }
    }, pollInterval)

    return () => clearInterval(interval)
  }, [jobId, syncStatus, retryCount])

  const handleSyncAvailabilityOnly = async () => {
    if (isDevMode) {
      toast({
        title: "Modalità Sviluppo",
        description: "La sincronizzazione non è disponibile in modalità sviluppo",
        variant: "default",
      })
      return
    }

    const activeJobId = localStorage.getItem("activeSyncJobId")
    if (activeJobId) {
      console.log("[v0] Cancelling active job before starting simplified sync:", activeJobId)
      try {
        await fetch(`/api/scidoo/sync/${activeJobId}`, {
          method: "DELETE",
        })
        localStorage.removeItem("activeSyncJobId")
        localStorage.removeItem("activeSyncHotelId")
      } catch (error) {
        console.error("[v0] Failed to cancel active job:", error)
      }
    }

    setShowDialog(true)
    setIsSyncing(true)
    setSyncStatus("syncing")
    setRetryCount(0)
    setLastError(null)
    setJobId(null)

    try {
      const today = new Date()

      const startDate = new Date(today)
      startDate.setDate(today.getDate() - 30) // 30 giorni fa

      const endDate = new Date(today)
      endDate.setDate(today.getDate() + 365) // Oggi + 365 giorni (1 anno)

      console.log("[v0] Starting simplified availability-only sync:", {
        hotelId,
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      })

      const response = await fetch("/api/scidoo/sync-availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hotelId,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
        }),
      })

      const result = await safeJsonParse(response)
      if (!result) {
        throw new Error("Invalid response from server")
      }

      if (!response.ok) {
        throw new Error(result.error || "Sync failed")
      }

      console.log("[v0] Availability sync completed:", result)
      setSyncStatus("success")
      setSyncResult(result.availability || result)
      setIsSyncing(false)

      toast({
        title: "Sincronizzazione completata",
        description: `Importati ${result.availability?.imported || 0} record di disponibilità`,
      })

  setTimeout(() => {
  setShowDialog(false)
  }, 2000)
    } catch (error) {
      console.error("[v0] Sync error:", error)
      setSyncStatus("error")
      setSyncResult({ error: error instanceof Error ? error.message : "Si è verificato un errore" })
      setIsSyncing(false)
    }
  }

  const handleSync = async () => {
    if (isDevMode) {
      toast({
        title: "Modalità Sviluppo",
        description: "La sincronizzazione non è disponibile in modalità sviluppo",
        variant: "default",
      })
      return
    }

    setShowDialog(true)
    setIsSyncing(true)
    setSyncStatus("syncing")
    setRetryCount(0)
    setLastError(null)

    try {
      const today = new Date()

      const startDate = new Date(today)
      startDate.setDate(today.getDate() - 30) // 30 giorni fa

      const endDate = new Date(today)
      endDate.setDate(today.getDate() + 30) // Oggi + 30 giorni

      console.log("[v0] Starting Scidoo sync (TEST MODE - 60 days total):", {
        hotelId,
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      })

      const response = await fetch("/api/scidoo/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hotelId,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
        }),
      })

      const result = await safeJsonParse(response)
      if (!result) {
        throw new Error("Invalid response from server")
      }

      if (!response.ok) {
        throw new Error(result.error || "Sync failed")
      }

      if (result.jobId) {
        console.log("[v0] Sync job created:", result.jobId)
        setJobId(result.jobId)

        localStorage.setItem("activeSyncJobId", result.jobId)
        localStorage.setItem("activeSyncHotelId", hotelId)

        if (result.isResumed && result.checkpoint) {
          toast({
            title: "Ripresa sincronizzazione",
            description: `Ripresa da ${result.checkpoint.bookings_processed || 0} prenotazioni già importate`,
          })
        }

        // Status will be updated by polling
      } else {
        console.log("[v0] Direct sync completed:", result)
        setSyncStatus("success")
        setSyncResult(result.stats || result)
        setIsSyncing(false)

  setTimeout(() => {
  setShowDialog(false)
  }, 3000)
      }
    } catch (error) {
      console.error("[v0] Sync error:", error)
      setSyncStatus("error")
      setSyncResult({ error: error instanceof Error ? error.message : "Si è verificato un errore" })
      setIsSyncing(false)
    }
  }

  const handleCancelSync = async () => {
    console.log("[v0] handleCancelSync called, jobId:", jobId)

    if (!jobId) {
      console.log("[v0] No jobId, cannot cancel")
      return
    }

    try {
      console.log("[v0] Cancelling sync job:", jobId)

      const response = await fetch(`/api/scidoo/sync/${jobId}`, {
        method: "DELETE",
      })

      console.log("[v0] Cancel response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] Cancel failed:", errorText)
        throw new Error("Failed to cancel sync")
      }

      const result = await safeJsonParse(response)
      if (!result) {
        console.warn("[v0] Cancel response was not JSON, but request succeeded")
      }
      console.log("[v0] Cancel result:", result)

      setSyncStatus("idle")
      setIsSyncing(false)
      setJobId(null)
      setShowDialog(false)

      localStorage.removeItem("activeSyncJobId")
      localStorage.removeItem("activeSyncHotelId")

      toast({
        title: "Sincronizzazione interrotta",
        description: "La sincronizzazione è stata annullata con successo",
      })
    } catch (error) {
      console.error("[v0] Error cancelling sync:", error)
      toast({
        title: "Errore",
        description: "Impossibile interrompere la sincronizzazione",
        variant: "destructive",
      })
    }
  }

  const handleResetSync = () => {
    console.log("[v0] Resetting sync state")

    // Clear all sync-related state
    setSyncStatus("idle")
    setIsSyncing(false)
    setJobId(null)
    setSyncResult(null)
    setRetryCount(0)
    setLastError(null)
    setShowDialog(false)

    // Clear localStorage
    localStorage.removeItem("activeSyncJobId")
    localStorage.removeItem("activeSyncHotelId")

    toast({
      title: "Stato ripristinato",
      description: "Lo stato della sincronizzazione è stato azzerato. Ricarico la pagina...",
    })

  // Data will refresh naturally via Next.js revalidation
  }

  if (compact) {
    return (
      <>
        <Button
          onClick={handleSyncAvailabilityOnly}
          disabled={isSyncing || isDevMode}
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          title="Sincronizza"
        >
          {isSyncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
        </Button>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="w-[90vw] max-w-md mx-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                {syncStatus === "syncing" && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                {syncStatus === "success" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                {syncStatus === "error" && <AlertCircle className="h-5 w-5 text-red-500" />}
                {syncStatus === "syncing" && "Sincronizzazione..."}
                {syncStatus === "success" && "Completata"}
                {syncStatus === "error" && "Errore"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Stato sincronizzazione PMS
              </DialogDescription>
              <div className="text-sm text-muted-foreground">
                {syncStatus === "syncing" && (
                  <div className="space-y-2">
                    <div>Stiamo scaricando i dati dal tuo PMS.</div>
                    {retryCount > 0 && (
                      <div className="text-xs text-amber-600">Connessione instabile ({retryCount}/15)</div>
                    )}
                  </div>
                )}
                {syncStatus === "success" && <div>Dati importati con successo!</div>}
                {syncStatus === "error" && (
                  <div className="text-red-500">{syncResult?.error || "Errore sconosciuto"}</div>
                )}
              </div>
            </DialogHeader>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>
                Chiudi
              </Button>
              {syncStatus === "syncing" && jobId && (
                <Button variant="destructive" size="sm" onClick={handleCancelSync}>
                  Interrompi
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <>
      <div className="flex gap-1 md:gap-2">
        <Button
          onClick={handleSync}
          disabled={isSyncing || isDevMode}
          variant={variant}
          size="sm"
          className={cn("px-2 md:px-3", className)}
          title={isDevMode ? "Non disponibile in modalità sviluppo" : "Sincronizza dati dal PMS"}
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin md:mr-2" />
              <span className="hidden md:inline">Sync...</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4 md:mr-2" />
              <span className="hidden lg:inline">Sincronizza</span>
            </>
          )}
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="w-[90vw] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {syncStatus === "syncing" && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
              {syncStatus === "success" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              {syncStatus === "error" && <AlertCircle className="h-5 w-5 text-red-500" />}
              {syncStatus === "syncing" && "Sincronizzazione in corso"}
              {syncStatus === "success" && "Sincronizzazione completata"}
              {syncStatus === "error" && "Errore sincronizzazione"}
            </DialogTitle>
            <DialogDescription>
              {syncStatus === "syncing" && (
                <div className="space-y-2">
                  <div>Stiamo scaricando i dati dal tuo PMS.</div>
                  <div className="text-sm text-muted-foreground">
                    {jobId
                      ? "Occorreranno diversi minuti per importare tutte le prenotazioni..."
                      : "Sincronizzazione veloce in corso..."}
                  </div>
                  {retryCount > 0 && (
                    <div className="text-xs text-amber-600 mt-2">
                      Connessione instabile (tentativo {retryCount}/15). La sincronizzazione continua in background.
                    </div>
                  )}
                  {lastError && retryCount > 3 && (
                    <div className="text-xs text-muted-foreground mt-1">Ultimo errore: {lastError}</div>
                  )}
                  {jobId && (
                    <div className="text-xs text-muted-foreground mt-4 p-3 bg-muted rounded-md">
                      💡 Puoi chiudere questa finestra. La sincronizzazione continuerà in background.
                    </div>
                  )}
                </div>
              )}
              {syncStatus === "success" && (
                <div className="space-y-2">
                  <div>I dati sono stati importati con successo!</div>
                  {syncResult && (
                    <div className="text-sm text-muted-foreground space-y-1">
                      {syncResult.bookings !== undefined && <div>Prenotazioni: {syncResult.bookings || 0}</div>}
                      {syncResult.room_types !== undefined && <div>Categorie: {syncResult.room_types || 0}</div>}
                      {syncResult.availability !== undefined && (
                        <div>Disponibilità: {syncResult.availability || 0}</div>
                      )}
                      {syncResult.imported !== undefined && <div>Record importati: {syncResult.imported || 0}</div>}
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground mt-2">
                    La pagina verrà ricaricata automaticamente...
                  </div>
                </div>
              )}
              {syncStatus === "error" && (
                <div className="space-y-2">
                  <div>Si è verificato un errore durante la sincronizzazione.</div>
                  {syncResult?.error && <div className="text-sm text-red-500">{syncResult.error}</div>}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          {syncStatus === "syncing" && (
            <div className="flex flex-wrap justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>
                Chiudi
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500 text-amber-600 hover:bg-amber-50 bg-transparent"
                onClick={handleResetSync}
              >
                Reset
              </Button>
              {jobId && (
                <Button variant="destructive" size="sm" onClick={handleCancelSync}>
                  Interrompi
                </Button>
              )}
            </div>
          )}

          {(syncStatus === "error" || syncStatus === "success") && (
            <div className="flex flex-wrap justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>
                Chiudi
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500 text-amber-600 hover:bg-amber-50 bg-transparent"
                onClick={handleResetSync}
              >
                Reset
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
