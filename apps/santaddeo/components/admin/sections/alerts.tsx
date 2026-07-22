"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Eye, X, AlertTriangle, Info, AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"

interface AlertsSectionProps {
  alerts: any[]
}

export function AdminAlertsSection({ alerts }: AlertsSectionProps) {
  const router = useRouter()
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filteredAlerts = alerts.filter((alert) => {
    if (severityFilter !== "all" && alert.severity !== severityFilter) return false
    if (statusFilter !== "all" && alert.status !== statusFilter) return false
    return true
  })

  const handleAcknowledge = async (alertId: string) => {
    try {
      await fetch(`/api/admin/alerts/${alertId}/ack`, {
        method: "PATCH",
      })
      router.refresh()
    } catch (error) {
      console.error("Error acknowledging alert:", error)
      alert("Errore durante l'aggiornamento dell'alert")
    }
  }

  const handleClose = async (alertId: string) => {
    if (!confirm("Vuoi chiudere questo alert?")) return

    try {
      await fetch(`/api/admin/alerts/${alertId}/close`, {
        method: "PATCH",
      })
      router.refresh()
    } catch (error) {
      console.error("Error closing alert:", error)
      alert("Errore durante la chiusura dell'alert")
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertCircle className="h-4 w-4 text-red-600" />
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case "info":
        return <Info className="h-4 w-4 text-blue-600" />
      default:
        return <Info className="h-4 w-4" />
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Alert di Sistema</CardTitle>
            <CardDescription>Gestisci gli alert attivi nel sistema</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Gravità" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="open">Aperti</SelectItem>
                <SelectItem value="acknowledged">Visti</SelectItem>
                <SelectItem value="closed">Chiusi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nessun alert disponibile</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Ora</TableHead>
                <TableHead>Struttura</TableHead>
                <TableHead>PMS</TableHead>
                <TableHead>Messaggio</TableHead>
                <TableHead>Gravità</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAlerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="text-sm">{new Date(alert.created_at).toLocaleString("it-IT")}</TableCell>
                  <TableCell className="font-medium">{alert.hotel?.name || "N/A"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{alert.pms_name || "Sistema"}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{alert.message}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getSeverityIcon(alert.severity)}
                      <Badge
                        variant={
                          alert.severity === "critical"
                            ? "destructive"
                            : alert.severity === "warning"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        alert.status === "open"
                          ? "destructive"
                          : alert.status === "acknowledged"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {alert.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {alert.status === "open" && (
                      <Button size="sm" variant="outline" onClick={() => handleAcknowledge(alert.id)}>
                        <Eye className="h-4 w-4 mr-1" />
                        Visto
                      </Button>
                    )}
                    {alert.status !== "closed" && (
                      <Button size="sm" variant="outline" onClick={() => handleClose(alert.id)}>
                        <X className="h-4 w-4 mr-1" />
                        Chiudi
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
