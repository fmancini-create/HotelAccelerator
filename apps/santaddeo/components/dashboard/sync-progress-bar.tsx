"use client"

import { useState, useEffect } from "react"
import { Progress } from "@/components/ui/progress"
import { X, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SyncProgressBarProps {
  hotelId: string
}

export function SyncProgressBar({ hotelId }: SyncProgressBarProps) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<"syncing" | "completed" | "failed">("syncing")
  const [stats, setStats] = useState<any>(null)
  const [retryCount, setRetryCount] = useState(0)
  // Guard to prevent multiple reloads
  const reloadScheduled = useState(false)

  // Check for active sync job on mount - verify job timestamp to avoid stale jobs
  useEffect(() => {
    const storedJobId = localStorage.getItem("activeSyncJobId")
    const storedHotelId = localStorage.getItem("activeSyncHotelId")
    const storedTimestamp = localStorage.getItem("activeSyncTimestamp")

    // Only restore job if it was started less than 2 hours ago
    const isRecent = storedTimestamp && (Date.now() - parseInt(storedTimestamp)) < 2 * 60 * 60 * 1000

    if (storedJobId && storedHotelId === hotelId && isRecent) {
      setJobId(storedJobId)
      setIsVisible(true)
    } else if (storedJobId) {
      // Clear stale job data
      localStorage.removeItem("activeSyncJobId")
      localStorage.removeItem("activeSyncHotelId")
      localStorage.removeItem("activeSyncTimestamp")
    }
  }, [hotelId])

  // Poll sync status
  useEffect(() => {
    if (!jobId || !isVisible) return

    const baseInterval = 10000 // 10 seconds base (was 5 seconds)
    const pollInterval = baseInterval * Math.pow(1.5, Math.min(retryCount, 5))

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/scidoo/sync/${jobId}`, {
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
        })

        if (response.status === 429 || response.status === 503) {
          setRetryCount((prev) => prev + 1)
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const contentType = response.headers.get("content-type")
        if (!contentType || !contentType.includes("application/json")) {
          console.warn(`[v0] sync status response is not JSON: ${contentType}`)
          setRetryCount((prev) => prev + 1)
          return
        }

        const result = await response.json()

        // Calculate progress based on stats
        if (result.success && result.job) {
          const job = result.job
          setRetryCount(0)

          // Calculate progress based on stats
          if (job.stats) {
            const total = job.stats.total_bookings || 0
            const imported = job.stats.bookings_imported || 0
            const calculatedProgress = total > 0 ? Math.round((imported / total) * 100) : 0
            setProgress(calculatedProgress)
            setStats(job.stats)
          }

          if (job.status === "completed") {
            setStatus("completed")
            setProgress(100)
            clearInterval(interval)
            localStorage.removeItem("activeSyncJobId")
            localStorage.removeItem("activeSyncHotelId")
            localStorage.removeItem("activeSyncTimestamp")

            // Auto-hide after 5 seconds - use router.refresh() not window.location.reload()
            // to avoid breaking client-side navigation
            setTimeout(() => {
              setIsVisible(false)
              // Do NOT call window.location.reload() here - it causes infinite loops
              // The page data will update naturally via Next.js revalidation
            }, 5000)
          } else if (job.status === "failed") {
            setStatus("failed")
            clearInterval(interval)
            localStorage.removeItem("activeSyncJobId")
            localStorage.removeItem("activeSyncHotelId")
          }
        }
      } catch (error) {
        if (error instanceof Error && !error.message.includes("503")) {
          console.warn("[v0] Error polling sync status:", error)
        }
        setRetryCount((prev) => prev + 1)

        if (retryCount >= 15) {
          setRetryCount(8)
        }
      }
    }, pollInterval)

    return () => clearInterval(interval)
  }, [jobId, isVisible, retryCount])

  const handleClose = () => {
    setIsVisible(false)
    localStorage.removeItem("activeSyncJobId")
    localStorage.removeItem("activeSyncHotelId")
  }

  if (!isVisible) return null

  return (
    <div
      className={cn(
        "fixed top-16 left-0 right-0 z-40 bg-white border-b shadow-sm",
        "animate-in slide-in-from-top duration-300",
      )}
    >
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            {status === "syncing" && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
            {status === "completed" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {status === "failed" && <AlertCircle className="h-5 w-5 text-red-500" />}
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {status === "syncing" && "Sincronizzazione in corso..."}
                {status === "completed" && "Sincronizzazione completata!"}
                {status === "failed" && "Sincronizzazione fallita"}
              </div>
              <div className="text-sm text-muted-foreground">
                {status === "syncing" && stats && (
                  <span>
                    {stats.bookings_imported || 0} / {stats.total_bookings || 0} prenotazioni
                  </span>
                )}
                {status === "syncing" && !stats && <span>Inizializzazione...</span>}
                {status === "completed" && <span>Ricaricamento in corso...</span>}
              </div>
            </div>

            <Progress value={progress} className="h-2" />

            {status === "syncing" && retryCount > 3 && (
              <div className="text-xs text-amber-600">
                Il server è occupato. La sincronizzazione continua in background.
              </div>
            )}
          </div>

          <Button variant="ghost" size="icon" onClick={handleClose} className="flex-shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
