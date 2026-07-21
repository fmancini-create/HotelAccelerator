"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Star,
  CheckCircle,
  Clock,
  AlertTriangle,
  Zap,
  FileText,
  Shield,
  ArrowRight,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { PMS_CATALOG, getFacilityStars, type PmsCatalogEntry } from "@/lib/pms-catalog"

type IntegrationStatus = "not_started" | "in_progress" | "completed" | "blocked"
type ConnectionStatus = "not_configured" | "configured" | "connected" | "error"

interface PmsProvider extends PmsCatalogEntry {
  status: IntegrationStatus
  priority: "high" | "medium" | "low"
  notes?: string
  dbId?: string
  connectionStatus?: ConnectionStatus
}

const STATUS_CONFIG = {
  not_started: { label: "Da iniziare", color: "bg-gray-100 text-gray-800", icon: Clock },
  in_progress: { label: "In corso", color: "bg-blue-100 text-blue-800", icon: Zap },
  completed: { label: "Completato", color: "bg-green-100 text-green-800", icon: CheckCircle },
  blocked: { label: "Bloccato", color: "bg-red-100 text-red-800", icon: AlertTriangle },
}

const PRIORITY_CONFIG = {
  high: { label: "Alta", color: "bg-red-100 text-red-800" },
  medium: { label: "Media", color: "bg-yellow-100 text-yellow-800" },
  low: { label: "Bassa", color: "bg-gray-100 text-gray-800" },
}

function connectionToIntegrationStatus(connectionStatus?: ConnectionStatus): IntegrationStatus {
  switch (connectionStatus) {
    case "connected":
      return "completed"
    case "configured":
      return "in_progress"
    case "error":
      return "blocked"
    default:
      return "not_started"
  }
}

export function PmsRoadmapTable() {
  const [providers, setProviders] = useState<PmsProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const loadProvidersFromDB = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/superadmin/connectors/pms-providers")
      const data = await response.json()

      const dbProviders: PmsProviderFromDB[] = data.providers || []

      // Merge i dati statici con quelli dal DB
      const mergedProviders = PMS_CATALOG.map((basePms) => {
        const dbPms = dbProviders.find(
          (db) =>
            db.code?.toLowerCase() === basePms.code?.toLowerCase() ||
            db.name?.toLowerCase() === basePms.name?.toLowerCase(),
        )

        return {
          ...basePms,
          dbId: dbPms?.id,
          connectionStatus: dbPms?.connection_status,
          status: connectionToIntegrationStatus(dbPms?.connection_status),
        } as PmsProvider
      })

      setProviders(mergedProviders)
    } catch (error) {
      console.error("Error loading PMS providers:", error)
      // Fallback ai dati statici
      setProviders(
        PMS_CATALOG.map((p) => ({
          ...p,
          status: "not_started" as IntegrationStatus,
        })),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProvidersFromDB()
  }, [])

  const filteredProviders = providers.filter((p) => {
    if (priorityFilter !== "all" && p.priority !== priorityFilter) return false
    if (statusFilter !== "all" && p.status !== statusFilter) return false
    return true
  })

  const stats = {
    total: providers.length,
    completed: providers.filter((p) => p.status === "completed").length,
    inProgress: providers.filter((p) => p.status === "in_progress").length,
    notStarted: providers.filter((p) => p.status === "not_started").length,
  }

  const recommendedPms = providers.filter((p) => p.facilityScore === 5 && p.status !== "completed")

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Totale PMS</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completati</CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.completed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In corso</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats.inProgress}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Da iniziare</CardDescription>
            <CardTitle className="text-3xl text-gray-600">{stats.notStarted}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Recommended PMS */}
      {recommendedPms.length > 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <Zap className="h-5 w-5" />
              PMS Raccomandati per l'integrazione
            </CardTitle>
            <CardDescription className="text-green-700">
              API-first, documentazione eccellente, integrazione veloce
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {recommendedPms.map((pms) => (
                <Button
                  key={pms.name}
                  variant="outline"
                  className="border-green-300 bg-white hover:bg-green-100"
                  onClick={() => (window.location.href = `/superadmin/connectors-mapping?pms=${pms.code}`)}
                >
                  {pms.name}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legenda facilità */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Legenda Facilità Integrazione</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <span>API-first, Swagger/GitBook, auth moderna</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
                {[4, 5].map((i) => (
                  <Star key={i} className="h-4 w-4 text-gray-300" />
                ))}
              </div>
              <span>API esistono ma doc vecchia/HTML/PDF</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
                {[3, 4, 5].map((i) => (
                  <Star key={i} className="h-4 w-4 text-gray-300" />
                ))}
              </div>
              <span>API enterprise, complesse</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Priorità" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le priorità</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="low">Bassa</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="not_started">Da iniziare</SelectItem>
              <SelectItem value="in_progress">In corso</SelectItem>
              <SelectItem value="completed">Completato</SelectItem>
              <SelectItem value="blocked">Bloccato</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={loadProvidersFromDB}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Aggiorna
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PMS</TableHead>
                <TableHead>Documentazione</TableHead>
                <TableHead>Autenticazione</TableHead>
                <TableHead>Facilità</TableHead>
                <TableHead>Priorità</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProviders.map((pms) => {
                const StatusIcon = STATUS_CONFIG[pms.status].icon
                return (
                  <TableRow key={pms.name} className={pms.status === "completed" ? "bg-green-50" : ""}>
                    <TableCell className="font-medium">{pms.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {pms.docType}
                        {pms.docUrl && (
                          <a href={pms.docUrl} target="_blank" rel="noopener noreferrer">
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        {pms.auth}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex">{getFacilityStars(pms.facilityScore)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={PRIORITY_CONFIG[pms.priority].color}>
                        {PRIORITY_CONFIG[pms.priority].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${STATUS_CONFIG[pms.status].color} flex w-fit items-center gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {STATUS_CONFIG[pms.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                      {pms.notes || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => (window.location.href = `/superadmin/connectors-mapping?pms=${pms.code}`)}
                      >
                        {pms.status === "completed" ? "Gestisci" : "Inizia"}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

interface PmsProviderFromDB {
  id: string
  name: string
  code: string
  connection_status: ConnectionStatus
  api_base_url?: string
  has_webhook?: boolean
  has_delta_sync?: boolean
  has_last_modified?: boolean
  available_entities?: string[]
}
