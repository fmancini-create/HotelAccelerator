"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { AlertTriangle, Bell, CheckCircle2, X, TrendingUp, CircleAlert, Lightbulb } from "lucide-react"
import { AlertService } from "@/lib/services/alert-service"
import { dedupFetchJson } from "@/lib/dedup-fetch"
import type { Alert as AlertType, AlertSeverity } from "@/lib/types/database"
import Link from "next/link"

interface KpiThreshold {
  metric_key: string
  green_min: number
  green_max: number | null
  orange_min: number
  red_min: number
  is_inverted: boolean
  display_name: string
  description: string
  unit: string
}

interface DbSuggestion {
  metric_key: string
  severity: string
  label: string
  description: string
  suggestion: string
}

interface KpiStatus {
  key: string
  label: string
  value: number
  unit: string
  color: "green" | "orange" | "red"
  suggestion: string
  description: string
}

// Evaluate a KPI against its threshold (same logic as metrics-current.tsx Semaphore)
function evaluateKpi(
  key: string,
  label: string,
  value: number,
  threshold: KpiThreshold,
  suggestionsMap: Record<string, Record<string, DbSuggestion>>,
): KpiStatus {
  let color: "green" | "orange" | "red" = "red"

  if (threshold.green_max !== null && threshold.green_max > 0) {
    // Range model
    if (value >= threshold.green_min && value <= threshold.green_max) {
      color = "green"
    } else if (value >= threshold.orange_min && value <= threshold.green_max + 10) {
      color = "orange"
    } else {
      color = "red"
    }
  } else if (threshold.is_inverted) {
    if (value <= threshold.green_min) color = "green"
    else if (value <= threshold.orange_min) color = "orange"
    else color = "red"
  } else {
    if (value >= threshold.green_min) color = "green"
    else if (value >= threshold.orange_min) color = "orange"
    else color = "red"
  }

  // Get suggestion from DB, fallback to generic message
  const dbSuggestion = suggestionsMap[key]?.[color]
  const suggestion = dbSuggestion?.suggestion
    || (color === "green"
      ? "Nella norma."
      : color === "orange"
        ? `${threshold.display_name} sotto il target. Valore: ${value.toFixed(1)}${threshold.unit}.`
        : `${threshold.display_name} in stato critico. Valore: ${value.toFixed(1)}${threshold.unit}.`)
  const displayLabel = dbSuggestion?.label || label
  const description = dbSuggestion?.description || ""

  return { key, label: displayLabel, value, unit: threshold.unit, color, suggestion, description }
}

interface AlertsPanelProps {
  hotelId: string
  kpiMode?: "system" | "custom"
  subscription?: { is_active: boolean; plan_type?: string } | null
}

export function AlertsPanel({ hotelId, kpiMode = "system", subscription }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<AlertType[]>([])
  const [kpiStatuses, setKpiStatuses] = useState<KpiStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const fetchedRef = useRef(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    try {
      // Fetch alerts, metrics, thresholds and DB suggestions in parallel
      // dedupFetchJson prevents duplicate calls when other components fetch the same URL
      const [alertsData, metricsData, thresholdsData, suggestionsData] = await Promise.all([
        dedupFetchJson(`/api/ui/alerts?hotelId=${hotelId}`),
        dedupFetchJson(`/api/dashboard/metrics?hotel_id=${hotelId}&period=month`),
        dedupFetchJson(`/api/kpi-thresholds?hotel_id=${hotelId}&mode=${kpiMode}`),
        dedupFetchJson("/api/kpi-suggestions"),
      ])

      // Process alerts
      if (alertsData?.alerts) {
        setAlerts(alertsData.alerts)
        setUnreadCount(alertsData.alerts.filter((a: AlertType) => !a.is_read).length)
      }

      // Parse DB suggestions
      let suggestionsMap: Record<string, Record<string, DbSuggestion>> = {}
      suggestionsMap = suggestionsData?.suggestionsMap || {}

      // Process KPI semaphores
      if (metricsData && thresholdsData) {
        const thresholds: Record<string, KpiThreshold> = thresholdsData.thresholds || {}

        const cancellationRate = metricsData.cancellationsCount > 0
          ? (metricsData.cancellationsCount / (metricsData.bookingsCount + metricsData.cancellationsCount)) * 100
          : 0
        const intermediatedPct = metricsData.totalRevenue > 0
          ? (metricsData.intermediatedRevenue / metricsData.totalRevenue) * 100
          : 0

        // Map KPI keys to metric values
        const kpiMap: { key: string; label: string; value: number }[] = [
          { key: "revpar", label: "RevPAR", value: metricsData.revpar || 0 },
          { key: "revpor", label: "RevPOR", value: metricsData.revpor || 0 },
          { key: "cancellation_rate", label: "Tasso Cancellazione", value: cancellationRate },
          { key: "intermediated_revenue_pct", label: "Rev. Intermediato %", value: intermediatedPct },
          { key: "pickup_booking_days", label: "Pick Up Prenotazioni", value: metricsData.avgBookingPickup || 0 },
          { key: "pickup_cancellation_days", label: "Pick Up Cancellazioni", value: metricsData.avgCancellationPickup || 0 },
        ]

        const statuses: KpiStatus[] = []
        for (const kpi of kpiMap) {
          if (thresholds[kpi.key]) {
            statuses.push(evaluateKpi(kpi.key, kpi.label, kpi.value, thresholds[kpi.key], suggestionsMap))
          }
        }
        setKpiStatuses(statuses)
      }
    } catch (error) {
      console.warn("[v0] fetchData error:", error)
      setAlerts([])
      setKpiStatuses([])
      setUnreadCount(0)
    }

    setIsLoading(false)
  }, [hotelId, kpiMode])

  useEffect(() => {
    fetchedRef.current = false
    fetchData()
  }, [fetchData])

  const markAsRead = async (alertId: string) => {
    await fetch("/api/ui/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: alertId, is_read: true }),
    })
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const dismissAlert = async (alertId: string) => {
    await fetch("/api/ui/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: alertId, is_dismissed: true }),
    })
    const dismissed = alerts.find((a) => a.id === alertId)
    setAlerts((prev) => prev.filter((a) => a.id !== alertId))
    if (dismissed && !dismissed.is_read) {
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
  }

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case "green":
        return "bg-green-100 text-green-800 border-green-200"
      case "orange":
        return "bg-orange-100 text-orange-800 border-orange-200"
      case "red":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case "green":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case "orange":
        return <AlertTriangle className="h-5 w-5 text-orange-600" />
      case "red":
        return <AlertTriangle className="h-5 w-5 text-red-600" />
      default:
        return <Bell className="h-5 w-5" />
    }
  }

  // Check if ALL KPI semaphores are green
  const nonGreenKpis = kpiStatuses.filter((k) => k.color !== "green")
  const allKpisGreen = kpiStatuses.length > 0 && nonGreenKpis.length === 0

  // Get worst severity for upgrade recommendation
  const worstKpiColor = kpiStatuses.find((k) => k.color === "red")
    ? "red"
    : kpiStatuses.find((k) => k.color === "orange")
      ? "orange"
      : "green"
  const worstSeverity: AlertSeverity =
    alerts.find((a) => a.severity === "red")?.severity || (worstKpiColor as AlertSeverity) || "green"

  const upgradeRecommendation = AlertService.getUpgradeRecommendation(worstSeverity)

  const totalIssues = nonGreenKpis.length + alerts.length

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notifiche e Alert
                </CardTitle>
                <CardDescription>Monitora lo stato della tua struttura</CardDescription>
              </div>
              {totalIssues > 0 && (
                <Badge variant="destructive" className="h-6 px-2 text-white">
                  {totalIssues} {totalIssues === 1 ? "avviso" : "avvisi"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
                ))}
              </div>
            ) : allKpisGreen && alerts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-3" />
                <p className="text-lg font-semibold">Tutto OK!</p>
                <p className="text-sm text-muted-foreground">
                  Tutti i semafori KPI sono verdi. La struttura sta performando bene.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* KPI Semaphore Alerts */}
                {nonGreenKpis.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Semafori KPI
                    </p>
                    {nonGreenKpis.map((kpi) => (
                      <Tooltip key={kpi.key}>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex items-center gap-3 rounded-lg border p-3 cursor-help transition-colors hover:bg-accent/50 ${
                              kpi.color === "red"
                                ? "border-red-200 bg-red-50"
                                : "border-orange-200 bg-orange-50"
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {kpi.color === "red" ? (
                                <CircleAlert className="h-4 w-4 text-red-600" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-orange-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium ${
                                  kpi.color === "red" ? "text-red-900" : "text-orange-900"
                                }`}
                              >
                                {kpi.label}
                              </p>
                              <p
                                className={`text-xs ${
                                  kpi.color === "red" ? "text-red-700" : "text-orange-700"
                                }`}
                              >
                                Valore attuale: {kpi.value.toFixed(1)}
                                {kpi.unit}
                              </p>
                            </div>
                            <div className="flex gap-0.5 flex-shrink-0">
                              <div
                                className={`w-2.5 h-2.5 rounded-full ${
                                  kpi.color === "red" ? "bg-red-500" : "bg-gray-200"
                                }`}
                              />
                              <div
                                className={`w-2.5 h-2.5 rounded-full ${
                                  kpi.color === "orange" ? "bg-orange-500" : "bg-gray-200"
                                }`}
                              />
                              <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm">{kpi.suggestion}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                )}

                {/* Database Alerts */}
                {alerts.length > 0 && (
                  <div className="space-y-2">
                    {nonGreenKpis.length > 0 && (
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">
                        Alert attivi
                      </p>
                    )}
                    {alerts.map((alert) => (
                      <Alert key={alert.id} className={getSeverityColor(alert.severity)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            {getSeverityIcon(alert.severity)}
                            <div className="flex-1">
                              <AlertTitle className="font-semibold">{alert.title}</AlertTitle>
                              <AlertDescription className="mt-1 text-sm">
                                {alert.message}
                              </AlertDescription>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {new Date(alert.created_at).toLocaleString("it-IT")}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {!alert.is_read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markAsRead(alert.id)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => dismissAlert(alert.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Alert>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upgrade Recommendation Card - only show if no active subscription */}
        {worstSeverity !== "green" && !subscription?.is_active && (
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <TrendingUp className="h-5 w-5" />
                {upgradeRecommendation.title}
              </CardTitle>
              <CardDescription className="text-blue-800">{upgradeRecommendation.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href={upgradeRecommendation.link}>{upgradeRecommendation.action}</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
