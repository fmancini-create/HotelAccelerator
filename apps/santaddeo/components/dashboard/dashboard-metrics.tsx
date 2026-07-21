"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { MetricsComparison } from "./metrics-comparison"
import { MetricsCurrent } from "./metrics-current"
import { MetricsDateSelector } from "./metrics-date-selector"

interface DashboardMetricsProps {
  hotelId: string
  kpiMode?: "system" | "custom"
  accommodationType?: string
}

export function DashboardMetrics({ hotelId, kpiMode = "system", accommodationType }: DashboardMetricsProps) {
  const [period, setPeriod] = useState<"day" | "month" | "year">("month")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [kpiConfigs, setKpiConfigs] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    async function loadKpiConfigs() {
      try {
        const res = await fetch(`/api/dashboard/kpi-configs?hotel_id=${hotelId}`)
        if (res.ok) {
          const json = await res.json()
          setKpiConfigs(json.kpiConfigs)
        }
      } catch {
        // If KPI configs fail to load, all KPIs stay visible
      }
    }
    loadKpiConfigs()
  }, [hotelId])

  return (
    <div className="mt-6 space-y-6">
      <Tabs defaultValue="current" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="comparison">Confronto Anno</TabsTrigger>
          <TabsTrigger value="current">Dati Correnti</TabsTrigger>
          <TabsTrigger value="date">Per Data</TabsTrigger>
        </TabsList>

        {/* BOX 1 - Year Comparison */}
        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Variazione rispetto all'anno precedente</CardTitle>
              <CardDescription>Confronto delle performance anno su anno</CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsComparison hotelId={hotelId} period={period} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOX 2 - Current Year Data */}
        <TabsContent value="current" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Dati Anno in Corso</h3>
              <p className="text-sm text-muted-foreground">Visualizza le metriche per periodo</p>
            </div>
            <Select value={period} onValueChange={(value: "day" | "month" | "year") => setPeriod(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Giorno</SelectItem>
                <SelectItem value="month">Mese</SelectItem>
                <SelectItem value="year">Anno</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <MetricsCurrent hotelId={hotelId} period={period} kpiConfigs={kpiConfigs} kpiMode={kpiMode} accommodationType={accommodationType} />
        </TabsContent>

        {/* BOX 3 - Date Selector */}
        <TabsContent value="date" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dati per Data Specifica</CardTitle>
              <CardDescription>Visualizza prenotazioni e cancellazioni entrate in una data specifica</CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsDateSelector hotelId={hotelId} selectedDate={selectedDate} onDateChange={setSelectedDate} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
