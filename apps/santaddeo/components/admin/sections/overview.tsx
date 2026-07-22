"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Database, Activity, CheckCircle2, XCircle, Clock } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface OverviewProps {
  hotels: any[]
  organizations: any[]
  pmsIntegrations: any[]
  syncLogs: any[]
  etlJobs: any[]
}

export function AdminDashboardOverview({ hotels, organizations, pmsIntegrations, syncLogs, etlJobs }: OverviewProps) {
  // Calculate KPIs
  const activeHotels = hotels.filter((h) => h.pms_integrations?.some((p: any) => p.is_active)).length
  const totalHotels = hotels.length
  const inactiveHotels = totalHotels - activeHotels

  const pmsTypes = pmsIntegrations.reduce(
    (acc, pms) => {
      acc[pms.pms_name] = (acc[pms.pms_name] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const recentSyncs = syncLogs.slice(0, 10)
  const successfulSyncs = recentSyncs.filter((log) => log.status === "success").length
  const failedSyncs = recentSyncs.filter((log) => log.status === "error").length

  const lastEtlJob = etlJobs[0]
  const etlStatus = lastEtlJob?.status || "unknown"

  // Prepare chart data (structures per month)
  const monthlyData = hotels.reduce(
    (acc, hotel) => {
      const month = new Date(hotel.created_at).toLocaleDateString("it-IT", { year: "numeric", month: "short" })
      const existing = acc.find((d) => d.month === month)
      if (existing) {
        existing.count += 1
      } else {
        acc.push({ month, count: 1 })
      }
      return acc
    },
    [] as Array<{ month: string; count: number }>,
  )

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Strutture Totali</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHotels}</div>
            <p className="text-xs text-muted-foreground">
              {activeHotels} attive / {inactiveHotels} inattive
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PMS Collegati</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(pmsTypes).length}</div>
            <p className="text-xs text-muted-foreground">
              {Object.entries(pmsTypes)
                .slice(0, 2)
                .map(([name, count]) => `${name}: ${count}`)
                .join(", ")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sincronizzazioni</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentSyncs.length}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">{successfulSyncs} OK</span> /{" "}
              <span className="text-red-600">{failedSyncs} Errori</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ETL Status</CardTitle>
            {etlStatus === "completed" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
            {etlStatus === "failed" && <XCircle className="h-4 w-4 text-red-600" />}
            {etlStatus === "running" && <Clock className="h-4 w-4 text-blue-600" />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {lastEtlJob ? (
                <Badge
                  variant={etlStatus === "completed" ? "default" : etlStatus === "failed" ? "destructive" : "secondary"}
                >
                  {etlStatus}
                </Badge>
              ) : (
                "N/A"
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {lastEtlJob ? `${lastEtlJob.records_inserted || 0} record aggiornati` : "Nessun job ETL eseguito"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Evoluzione Strutture Collegate</CardTitle>
          <CardDescription>Numero di strutture aggiunte per mese</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
