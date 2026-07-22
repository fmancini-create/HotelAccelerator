"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Play } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { useRouter } from "next/navigation"

interface CronLogsProps {
  syncLogs: any[]
  etlJobs: any[]
}

export function AdminCronLogs({ syncLogs, etlJobs }: CronLogsProps) {
  const router = useRouter()
  const [isRunningETL, setIsRunningETL] = useState(false)

  const handleRunETL = async () => {
    if (!confirm("Vuoi eseguire l'ETL manualmente per tutte le strutture?")) return

    setIsRunningETL(true)
    try {
      // Get all hotels
      const response = await fetch("/api/superadmin/hotels")
      const { hotels } = await response.json()

      // Run ETL for each hotel
      for (const hotel of hotels) {
        await fetch("/api/admin/run-etl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotel_id: hotel.id }),
        })
      }

      alert("ETL eseguito con successo per tutte le strutture!")
      router.refresh()
    } catch (error) {
      console.error("Error running ETL:", error)
      alert("Errore durante l'esecuzione dell'ETL")
    } finally {
      setIsRunningETL(false)
    }
  }

  // Prepare chart data (jobs per day)
  const dailyJobs = etlJobs.reduce(
    (acc, job) => {
      const day = new Date(job.created_at).toLocaleDateString("it-IT", { month: "short", day: "numeric" })
      const existing = acc.find((d) => d.day === day)
      if (existing) {
        existing.completed += job.status === "completed" ? 1 : 0
        existing.failed += job.status === "failed" ? 1 : 0
      } else {
        acc.push({
          day,
          completed: job.status === "completed" ? 1 : 0,
          failed: job.status === "failed" ? 1 : 0,
        })
      }
      return acc
    },
    [] as Array<{ day: string; completed: number; failed: number }>,
  )

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Job ETL Completati</CardTitle>
              <CardDescription>Statistiche giornaliere dei job ETL</CardDescription>
            </div>
            <Button onClick={handleRunETL} disabled={isRunningETL}>
              <Play className="h-4 w-4 mr-2" />
              {isRunningETL ? "Esecuzione..." : "Esegui ETL Ora"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyJobs.slice(-7)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="completed" fill="#10b981" name="Completati" />
              <Bar dataKey="failed" fill="#ef4444" name="Falliti" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ETL Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ultimi Job ETL</CardTitle>
          <CardDescription>Cronologia delle esecuzioni ETL</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Ora</TableHead>
                <TableHead>Tipo Job</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Record Processati</TableHead>
                <TableHead>Durata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {etlJobs.slice(0, 10).map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-sm">{new Date(job.created_at).toLocaleString("it-IT")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{job.job_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"
                      }
                    >
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{job.records_processed || 0}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(1)}s` : "N/A"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sync Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Log Sincronizzazioni</CardTitle>
          <CardDescription>Cronologia delle sincronizzazioni PMS</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Ora</TableHead>
                <TableHead>Job Name</TableHead>
                <TableHead>Record Caricati</TableHead>
                <TableHead>Durata</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncLogs.slice(0, 10).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{new Date(log.created_at).toLocaleString("it-IT")}</TableCell>
                  <TableCell className="font-medium">{log.job_name || "N/A"}</TableCell>
                  <TableCell>{log.records_loaded || 0}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.status === "success" ? "default" : "destructive"}>
                      {log.status || "unknown"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
