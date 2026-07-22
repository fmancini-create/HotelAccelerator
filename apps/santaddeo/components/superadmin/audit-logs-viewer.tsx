"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RefreshCw, Search, Eye, Download, Filter, Calendar } from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"

interface AuditLog {
  id: string
  user_id: string
  user_email: string
  user_role: string
  action: string
  resource_type: string
  resource_id: string
  organization_id: string
  hotel_id: string
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
  metadata: Record<string, any> | null
  created_at: string
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
  LOGIN: "bg-purple-100 text-purple-800",
  LOGOUT: "bg-gray-100 text-gray-800",
  SYNC_START: "bg-yellow-100 text-yellow-800",
  SYNC_COMPLETE: "bg-green-100 text-green-800",
  SYNC_ERROR: "bg-red-100 text-red-800",
  PERMISSION_CHANGE: "bg-orange-100 text-orange-800",
  IMPERSONATE_START: "bg-pink-100 text-pink-800",
  IMPERSONATE_END: "bg-pink-100 text-pink-800",
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creazione",
  UPDATE: "Modifica",
  DELETE: "Eliminazione",
  LOGIN: "Login",
  LOGOUT: "Logout",
  SYNC_START: "Sync Avviato",
  SYNC_COMPLETE: "Sync Completato",
  SYNC_ERROR: "Errore Sync",
  PERMISSION_CHANGE: "Cambio Permessi",
  INVITE_SENT: "Invito Inviato",
  INVITE_ACCEPTED: "Invito Accettato",
  IMPERSONATE_START: "Impersonazione",
  IMPERSONATE_END: "Fine Impersonazione",
  SETTING_CHANGE: "Cambio Impostazioni",
  ALERT_TRIGGERED: "Alert Attivato",
  EXPORT_DATA: "Export Dati",
}

export function AuditLogsViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [actionFilter, setActionFilter] = useState<string>("all")
  const [resourceFilter, setResourceFilter] = useState<string>("all")
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 50

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
      })

      if (actionFilter !== "all") params.append("action", actionFilter)
      if (resourceFilter !== "all") params.append("resource_type", resourceFilter)
      if (searchTerm) params.append("search", searchTerm)

      const response = await fetch(`/api/superadmin/audit-logs?${params}`)
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs || [])
        setTotalCount(data.total || 0)
      }
    } catch (error) {
      console.error("Error fetching audit logs:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [page, actionFilter, resourceFilter])

  const handleSearch = () => {
    setPage(1)
    fetchLogs()
  }

  const exportLogs = async () => {
    try {
      const response = await fetch("/api/superadmin/audit-logs/export")
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error("Error exporting logs:", error)
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Audit Logs</CardTitle>
            <CardDescription>
              Registro completo delle operazioni di sistema ({totalCount} eventi totali)
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
            <Button variant="outline" size="sm" onClick={exportLogs}>
              <Download className="h-4 w-4 mr-2" />
              Esporta CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per email, risorsa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10"
              />
            </div>
          </div>

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Azione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le azioni</SelectItem>
              <SelectItem value="CREATE">Creazione</SelectItem>
              <SelectItem value="UPDATE">Modifica</SelectItem>
              <SelectItem value="DELETE">Eliminazione</SelectItem>
              <SelectItem value="LOGIN">Login</SelectItem>
              <SelectItem value="PERMISSION_CHANGE">Cambio Permessi</SelectItem>
              <SelectItem value="SYNC_START">Sync</SelectItem>
              <SelectItem value="IMPERSONATE_START">Impersonazione</SelectItem>
            </SelectContent>
          </Select>

          <Select value={resourceFilter} onValueChange={setResourceFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Risorsa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le risorse</SelectItem>
              <SelectItem value="hotels">Hotel</SelectItem>
              <SelectItem value="organizations">Organizzazioni</SelectItem>
              <SelectItem value="profiles">Utenti</SelectItem>
              <SelectItem value="user_property_map">Permessi</SelectItem>
              <SelectItem value="pms_integrations">Integrazioni PMS</SelectItem>
              <SelectItem value="system_settings">Impostazioni</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={handleSearch}>
            <Search className="h-4 w-4 mr-2" />
            Cerca
          </Button>
        </div>

        {/* Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Data/Ora</TableHead>
                <TableHead>Utente</TableHead>
                <TableHead>Azione</TableHead>
                <TableHead>Risorsa</TableHead>
                <TableHead className="text-right">Dettagli</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Caricamento...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nessun log trovato
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: it })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{log.user_email || "Sistema"}</div>
                        <div className="text-xs text-muted-foreground">{log.user_role || "-"}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={ACTION_COLORS[log.action] || "bg-gray-100"}>
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium capitalize">{log.resource_type}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {log.resource_id?.substring(0, 8)}...
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Dettaglio Audit Log</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">ID</label>
                                <p className="font-mono text-sm">{log.id}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Data/Ora</label>
                                <p>{format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: it })}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Utente</label>
                                <p>{log.user_email || "Sistema"}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Ruolo</label>
                                <p>{log.user_role || "-"}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Azione</label>
                                <Badge className={ACTION_COLORS[log.action] || "bg-gray-100"}>
                                  {ACTION_LABELS[log.action] || log.action}
                                </Badge>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Risorsa</label>
                                <p className="capitalize">{log.resource_type}</p>
                              </div>
                            </div>

                            {log.old_values && (
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Valori Precedenti</label>
                                <ScrollArea className="h-[150px] mt-1">
                                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto">
                                    {JSON.stringify(log.old_values, null, 2)}
                                  </pre>
                                </ScrollArea>
                              </div>
                            )}

                            {log.new_values && (
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Nuovi Valori</label>
                                <ScrollArea className="h-[150px] mt-1">
                                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto">
                                    {JSON.stringify(log.new_values, null, 2)}
                                  </pre>
                                </ScrollArea>
                              </div>
                            )}

                            {log.metadata && (
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Metadata</label>
                                <pre className="text-xs bg-muted p-3 rounded-lg mt-1">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Pagina {page} di {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Precedente
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Successiva
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
