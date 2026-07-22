"use client"

import { useEffect, useState } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

interface SyncStatus {
  lastSync: string | null
  status: string | null
  minutesSinceSync: number | null
  freshness: "fresh" | "stale" | "critical"
  circuitBreakerOpen: boolean
}

function formatTimeAgo(minutes: number | null): string {
  if (minutes === null) return "Mai sincronizzato"
  if (minutes < 1) return "Adesso"
  if (minutes < 60) return `${minutes}m fa`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h fa`
  const days = Math.floor(hours / 24)
  return `${days}g fa`
}

export function SyncStatusIndicator({ hotelId }: { hotelId: string | null }) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)

  useEffect(() => {
    if (!hotelId) return

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/pms/last-sync?hotel_id=${hotelId}`)
        if (res.ok) {
          setSyncStatus(await res.json())
        }
      } catch {
        // Silent fail
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 60_000)
    return () => clearInterval(interval)
  }, [hotelId])

  if (!hotelId || !syncStatus) return null

  const { freshness, minutesSinceSync, circuitBreakerOpen } = syncStatus

  const config = {
    fresh: {
      icon: CheckCircle2,
      color: "text-emerald-500",
      pulseColor: "bg-emerald-500",
      label: "Sync attivo",
    },
    stale: {
      icon: AlertTriangle,
      color: "text-amber-500",
      pulseColor: "bg-amber-500",
      label: "Dati non recenti",
    },
    critical: {
      icon: circuitBreakerOpen ? XCircle : AlertTriangle,
      color: "text-red-500",
      pulseColor: "bg-red-500",
      label: circuitBreakerOpen ? "PMS non raggiungibile" : "Sync bloccato",
    },
  }[freshness]

  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="relative flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-default">
            <span className="relative flex h-2 w-2">
              {freshness !== "fresh" && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.pulseColor} opacity-75`}
                />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${config.pulseColor}`} />
            </span>
            <Icon className={`h-3.5 w-3.5 ${config.color}`} />
            <span className={`text-xs font-medium ${config.color} hidden sm:inline`}>
              {formatTimeAgo(minutesSinceSync)}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">
              {"Ultimo sync: "}
              {syncStatus.lastSync
                ? new Date(syncStatus.lastSync).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Mai"}
            </p>
            {circuitBreakerOpen && (
              <p className="text-xs text-red-500">
                {"Circuit breaker attivo: il PMS non risponde. Il sistema riprova ogni 5 minuti."}
              </p>
            )}
            {freshness === "stale" && (
              <p className="text-xs text-amber-500">
                {"I dati potrebbero non essere aggiornati. Il sync riprende automaticamente."}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
