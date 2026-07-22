"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"

// MapSelector e' caricato dinamicamente perche' Leaflet richiede `window`
// e non e' SSR-friendly. Il dialog stesso e' sempre montato ma la mappa
// si carica solo all'apertura.
const ProspectMapSelector = dynamic(
  () => import("@/components/superadmin/prospect-map-selector"),
  { ssr: false, loading: () => <div className="h-[500px] rounded-md border bg-muted/30" /> },
)
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ExpiryBadge } from "@/components/sales/expiry-badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Search,
  Upload,
  Users,
  Building2,
  MapPin,
  Star,
  Phone,
  Mail,
  Globe,
  Map as MapIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  UserPlus,
  X,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Fetcher per la lista prospects: usa POST con i filtri/ids nel BODY per non
// sforare il limite di lunghezza della URL quando ci sono molti ID selezionati.
const listFetcher = async ([url, payload]: [string, Record<string, unknown>]) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Errore ${res.status}`)
  }
  return res.json()
}

type Prospect = {
  id: string
  name: string
  category: string
  stars: number | null
  city: string | null
  province: string | null
  region: string | null
  phone: string | null
  email: string | null
  website: string | null
  status: string
  assigned_agent_id: string | null
  assignment_expires_at?: string | null
  assigned_agent?: {
    id: string
    display_name: string
    email: string
  } | null
}

type Agent = {
  id: string
  display_name: string
  email: string
}

const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"
]

const CATEGORIES = [
  { value: "hotel", label: "Hotel" },
  { value: "b&b", label: "B&B" },
  { value: "agriturismo", label: "Agriturismo" },
  { value: "residence", label: "Residence" },
  { value: "camping", label: "Camping" },
  { value: "ostello", label: "Ostello" },
  { value: "casa_vacanze", label: "Casa Vacanze" },
  { value: "villaggio_turistico", label: "Villaggio Turistico" },
  { value: "altro", label: "Altro" },
]

const STATUSES = [
  { value: "unassigned", label: "Non assegnato", color: "bg-gray-100 text-gray-700" },
  { value: "assigned", label: "Assegnato", color: "bg-blue-100 text-blue-700" },
  { value: "contacted", label: "Contattato", color: "bg-yellow-100 text-yellow-700" },
  { value: "meeting_scheduled", label: "Demo fissata", color: "bg-purple-100 text-purple-700" },
  { value: "proposal_sent", label: "Proposta inviata", color: "bg-orange-100 text-orange-700" },
  { value: "converted", label: "Convertito", color: "bg-green-100 text-green-700" },
  { value: "not_interested", label: "Non interessato", color: "bg-red-100 text-red-700" },
]

export function ProspectsManager() {
  // Filtri
  const [search, setSearch] = useState("")
  const [region, setRegion] = useState<string>("all")
  const [city, setCity] = useState<string>("")
  const [postalCode, setPostalCode] = useState<string>("")
  const [category, setCategory] = useState<string>("all")
  const [stars, setStars] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const pageSize = 50
  
  // Selezione
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [openDataDialogOpen, setOpenDataDialogOpen] = useState(false)
  const [mapDialogOpen, setMapDialogOpen] = useState(false)
  // Selezione provvisoria fatta dentro la mappa. Confermando, viene
  // riversata in selectedIds del manager (l'assegnazione poi parte dal
  // flusso normale "Assegna a venditore").
  const [mapSelection, setMapSelection] = useState<string[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>("")
  const [isAssigning, setIsAssigning] = useState(false)
  // Durata assegnazione: default 60 giorni. "no_expiry" = nessuna scadenza.
  const [durationDays, setDurationDays] = useState<string>("60")
  // Sovrascrittura di prospect gia' assegnati: motivo obbligatorio.
  const [forceReason, setForceReason] = useState<string>("")
  // Modalita' "mostra solo selezionati": quando attiva, l'API ritorna solo
  // i prospect attualmente in selectedIds (limite 1000 per limite URL).
  // Si attiva automaticamente dopo una selezione dalla mappa cosi' l'utente
  // li vede subito nella tabella sotto.
  const [showOnlySelected, setShowOnlySelected] = useState(false)

  // Build request payload (filtri + ids nel body, niente limiti di URL)
  const buildPayload = useCallback((): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      page,
      page_size: pageSize,
    }
    if (search) payload.search = search
    if (region && region !== "all") payload.region = region
    if (city.trim()) payload.city = city.trim()
    if (postalCode.trim()) payload.postal_code = postalCode.trim()
    if (category && category !== "all") payload.category = category
    if (stars && stars !== "all") payload.stars = stars
    if (status && status !== "all") payload.status = status
    if (agentFilter && agentFilter !== "all") payload.agent_id = agentFilter
    if (showOnlySelected && selectedIds.size > 0) {
      // Nessun cap: gli ID viaggiano nel body della POST.
      payload.ids = Array.from(selectedIds)
    }
    return payload
  }, [page, search, region, city, postalCode, category, stars, status, agentFilter, showOnlySelected, selectedIds])

  const { data, error, isLoading, mutate } = useSWR<{
    prospects: Prospect[]
    pagination: { page: number; pageSize: number; total: number; totalPages: number }
    stats: { total: number; byStatus: Record<string, number> }
  }>(["/api/superadmin/prospects/list", buildPayload()], listFetcher)
  
  // Carica agenti
  const { data: agentsData } = useSWR<{ agents: Agent[] }>(
    "/api/sales/agents",
    fetcher
  )
  
  // Handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked && data?.prospects) {
      setSelectedIds(new Set(data.prospects.map((p) => p.id)))
    } else {
      setSelectedIds(new Set())
    }
  }
  
  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds)
    if (checked) {
      newSet.add(id)
    } else {
      newSet.delete(id)
    }
    setSelectedIds(newSet)
  }
  
  const handleBulkAssign = async () => {
    if (!selectedAgentId || selectedIds.size === 0) return
    
    setIsAssigning(true)
    try {
      const body: Record<string, unknown> = {
        prospect_ids: Array.from(selectedIds),
        agent_id: selectedAgentId,
      }
      if (durationDays !== "no_expiry") {
        body.duration_days = Number.parseInt(durationDays, 10)
      }
      // Se almeno un prospect selezionato e' gia' assegnato, attiva force con motivo.
      const anyAlreadyAssigned = (data?.prospects ?? []).some(
        (p) => selectedIds.has(p.id) && p.assigned_agent_id != null,
      )
      if (anyAlreadyAssigned) {
        if (!forceReason.trim()) {
          toast.error("Almeno un prospect e' gia' assegnato: indica il motivo della sovrascrittura.")
          setIsAssigning(false)
          return
        }
        body.force = true
        body.force_reason = forceReason.trim()
      }

      const res = await fetch("/api/superadmin/prospects/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || "Errore durante l'assegnazione")
      }

      toast.success(`${result.assigned_count} prospect assegnati a ${result.agent.display_name}`)
      setSelectedIds(new Set())
      setAssignDialogOpen(false)
      setSelectedAgentId("")
      setForceReason("")
      setDurationDays("60")
      mutate()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsAssigning(false)
    }
  }
  
  const getStatusBadge = (status: string) => {
    const found = STATUSES.find((s) => s.value === status)
    return (
      <Badge className={found?.color || "bg-gray-100"}>
        {found?.label || status}
      </Badge>
    )
  }
  
  const getCategoryLabel = (cat: string) => {
    return CATEGORIES.find((c) => c.value === cat)?.label || cat
  }
  
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale Prospect
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Non Assegnati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {data?.stats?.byStatus?.unassigned || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In Lavorazione
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {(data?.stats?.byStatus?.assigned || 0) +
                (data?.stats?.byStatus?.contacted || 0) +
                (data?.stats?.byStatus?.meeting_scheduled || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Convertiti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data?.stats?.byStatus?.converted || 0}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca nome, citta, email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        
        <Select value={region} onValueChange={(v) => { setRegion(v); setPage(1) }}>
          <SelectTrigger className="w-[160px]">
            <MapPin className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Regione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le regioni</SelectItem>
            {REGIONS.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Citta'"
          value={city}
          onChange={(e) => { setCity(e.target.value); setPage(1) }}
          className="w-[140px]"
        />

        <Input
          placeholder="CAP"
          value={postalCode}
          onChange={(e) => {
            // Solo cifre, max 5 (CAP italiano)
            const v = e.target.value.replace(/\D/g, "").slice(0, 5)
            setPostalCode(v)
            setPage(1)
          }}
          inputMode="numeric"
          maxLength={5}
          className="w-[100px]"
        />
        
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1) }}>
          <SelectTrigger className="w-[140px]">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={stars} onValueChange={(v) => { setStars(v); setPage(1) }}>
          <SelectTrigger className="w-[120px]">
            <Star className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Stelle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            {[5, 4, 3, 2, 1].map((s) => (
              <SelectItem key={s} value={s.toString()}>
                {s} {s === 1 ? "stella" : "stelle"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {agentsData?.agents && (
          <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[180px]">
              <Users className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Agente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli agenti</SelectItem>
              <SelectItem value="unassigned">Non assegnati</SelectItem>
              {agentsData.agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.display_name || a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        <Button variant="outline" size="icon" onClick={() => mutate()}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
        
<Button variant="outline" onClick={() => setImportDialogOpen(true)}>
  <Upload className="h-4 w-4 mr-2" />
Import CSV
  </Button>
  <Button onClick={() => setOpenDataDialogOpen(true)}>
  <Globe className="h-4 w-4 mr-2" />
  Scarica OpenData
  </Button>
  <Button variant="outline" onClick={() => {
    setMapSelection([])
    setMapDialogOpen(true)
  }}>
  <MapIcon className="h-4 w-4 mr-2" />
  Seleziona dalla mappa
  </Button>
      </div>
      
      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {selectedIds.size} prospect selezionati
          </span>
          <Button size="sm" onClick={() => setAssignDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Assegna a venditore
          </Button>
          <Button
            size="sm"
            variant={showOnlySelected ? "default" : "outline"}
            onClick={() => {
              setShowOnlySelected((v) => !v)
              setPage(1)
            }}
          >
            {showOnlySelected ? "Mostra tutti" : "Mostra solo selezionati"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedIds(new Set())
              setShowOnlySelected(false)
            }}
          >
            <X className="h-4 w-4 mr-2" />
            Deseleziona
          </Button>
        </div>
      )}
      
      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    data?.prospects &&
                    data.prospects.length > 0 &&
                    data.prospects.every((p) => selectedIds.has(p.id))
                  }
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-center">Stelle</TableHead>
              <TableHead>Localita</TableHead>
              <TableHead>Contatti</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Agente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-red-500">
                  Errore nel caricamento
                </TableCell>
              </TableRow>
            ) : !data?.prospects?.length ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  Nessun prospect trovato
                </TableCell>
              </TableRow>
            ) : (
              data.prospects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={(checked) => handleSelectOne(p.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{getCategoryLabel(p.category)}</TableCell>
                  <TableCell className="text-center">
                    {p.stars ? (
                      <span className="inline-flex items-center gap-1">
                        {p.stars} <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {p.city}
                      {p.province && <span className="text-muted-foreground"> ({p.province})</span>}
                    </div>
                    {p.region && (
                      <div className="text-xs text-muted-foreground">{p.region}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs">
                      {p.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {p.phone}
                        </span>
                      )}
                      {p.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {p.email}
                        </span>
                      )}
                      {p.website && (
                        <a
                          href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <Globe className="h-3 w-3" /> Sito
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(p.status)}</TableCell>
                  <TableCell>
                    {p.assigned_agent ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm">
                          {p.assigned_agent.display_name || p.assigned_agent.email}
                        </span>
                        {p.assignment_expires_at && (
                          <ExpiryBadge expiresAt={p.assignment_expires_at} />
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Pagina {data.pagination.page} di {data.pagination.totalPages} ({data.pagination.total} totali)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      
      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assegna Prospect</DialogTitle>
            <DialogDescription>
              Assegna {selectedIds.size} prospect selezionati a un venditore
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label className="mb-1.5 block text-sm">Venditore</Label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona venditore" />
                </SelectTrigger>
                <SelectContent>
                  {agentsData?.agents?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.display_name || a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-sm">Durata assegnazione</Label>
              <Select value={durationDays} onValueChange={setDurationDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 giorni</SelectItem>
                  <SelectItem value="60">60 giorni (default)</SelectItem>
                  <SelectItem value="90">90 giorni</SelectItem>
                  <SelectItem value="no_expiry">Nessuna scadenza</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Allo scadere, il prospect torna disponibile a tutti automaticamente.
              </p>
            </div>

            {(() => {
              const alreadyAssigned = (data?.prospects ?? []).filter(
                (p) => selectedIds.has(p.id) && p.assigned_agent_id != null,
              )
              if (alreadyAssigned.length === 0) return null
              return (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-900">
                    Attenzione: {alreadyAssigned.length} prospect selezionato/i sono gia&apos; assegnati.
                  </p>
                  <p className="text-xs text-amber-800">
                    Procedendo, l&apos;assegnazione precedente verra&apos; sovrascritta e
                    notificata al venditore attuale.
                  </p>
                  <div>
                    <Label className="mb-1 block text-xs">Motivo della sovrascrittura *</Label>
                    <Textarea
                      value={forceReason}
                      onChange={(e) => setForceReason(e.target.value)}
                      placeholder="Es. riassegnazione per cambio area, agente inattivo, richiesta esplicita..."
                      rows={2}
                      className="bg-white"
                    />
                  </div>
                </div>
              )
            })()}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleBulkAssign}
              disabled={!selectedAgentId || isAssigning}
            >
              {isAssigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Assegna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
{/* Import Dialog */}
<ImportCSVDialog
  open={importDialogOpen}
onOpenChange={setImportDialogOpen}
  onSuccess={() => mutate()}
  />
  
  {/* OpenData Import Dialog */}
  <OpenDataDialog
    open={openDataDialogOpen}
    onOpenChange={setOpenDataDialogOpen}
    onSuccess={() => mutate()}
  />

  {/* Map Selection Dialog */}
  <Dialog open={mapDialogOpen} onOpenChange={setMapDialogOpen}>
    <DialogContent className="max-w-5xl">
      <DialogHeader>
        <DialogTitle>Seleziona prospect dalla mappa</DialogTitle>
        <DialogDescription>
          Disegna un poligono o un rettangolo sulla mappa per selezionare
          le strutture al suo interno. I marker verdi sono disponibili,
          quelli ambra gia&apos; assegnati.
        </DialogDescription>
      </DialogHeader>
      {mapDialogOpen && (
        <ProspectMapSelector
          onlyUnassigned={false}
          selectedIds={new Set(mapSelection)}
          onSelectionChange={setMapSelection}
        />
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={() => setMapDialogOpen(false)}>
          Annulla
        </Button>
        <Button
          disabled={mapSelection.length === 0}
          onClick={() => {
            // Aggiunge la selezione mappa a quella del manager.
            setSelectedIds((prev) => {
              const next = new Set(prev)
              for (const id of mapSelection) next.add(id)
              return next
            })
            // Filtra automaticamente la tabella sui selezionati cosi'
            // l'utente li vede subito sotto invece di doverli cercare
            // tra 100k righe paginate.
            setShowOnlySelected(true)
            setPage(1)
            setMapDialogOpen(false)
            toast.success(
              `${mapSelection.length} prospect aggiunti alla selezione e mostrati qui sotto.`,
            )
          }}
        >
          Aggiungi {mapSelection.length} alla selezione
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  </div>
  )
}

// Componente Import Excel/CSV con preview e dedup intelligente
type PreviewResult = {
  mode: "preview"
  stats: {
    total_rows: number
    parsed: number
    invalid_rows: number
    intra_file_duplicates: number
    to_insert: number
    to_update: number
    already_complete: number
  }
  column_mapping: Record<string, string | null>
  detected_headers: string[]
  sample_new: { name: string; city: string; province: string }[]
  sample_updates: { existingId?: string; merged?: string[] }[]
}

type ExecuteResult = {
  success: boolean
  mode: "execute"
  stats: {
    total_rows: number
    inserted: number
    updated: number
    already_complete: number
    intra_file_duplicates: number
    invalid_rows: number
    errors: number
  }
  sample_errors?: { context: string; error: string }[]
}

function ImportCSVDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [executed, setExecuted] = useState<ExecuteResult | null>(null)
  
  const reset = () => {
    setFile(null)
    setPreview(null)
    setExecuted(null)
  }
  
  const handlePreview = async () => {
    if (!file) return
    setIsWorking(true)
    setPreview(null)
    setExecuted(null)
    
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("data_source", "manual_excel")
      
      const res = await fetch("/api/superadmin/prospects/import?mode=preview", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore durante l'analisi")
      setPreview(data)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore")
    } finally {
      setIsWorking(false)
    }
  }
  
  const handleExecute = async () => {
    if (!file) return
    setIsWorking(true)
    
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("data_source", "manual_excel")
      
      const res = await fetch("/api/superadmin/prospects/import?mode=execute", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore durante l'import")
      setExecuted(data)
      toast.success(`Importati ${data.stats.inserted} nuovi, aggiornati ${data.stats.updated}`)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore")
    } finally {
      setIsWorking(false)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Excel/CSV con Dedup</DialogTitle>
          <DialogDescription>
            Carica un file <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong>. Il sistema riconosce le colonne automaticamente
            (nome, comune, indirizzo, telefono, email, sito, ecc.) e <strong>verifica i duplicati</strong> usando nome+comune normalizzati.
            Le strutture già presenti vengono <strong>arricchite</strong> con i dati mancanti, senza sovrascrivere.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          {/* Step 1: Selezione file */}
          {!preview && !executed && (
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="excel-upload"
              />
              <label htmlFor="excel-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                {file ? (
                  <>
                    <span className="font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Clicca per selezionare un file Excel o CSV
                  </span>
                )}
              </label>
            </div>
          )}
          
          {/* Step 2: Preview */}
          {preview && !executed && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <div className="font-medium mb-2">Colonne rilevate nel file:</div>
                <div className="text-xs text-muted-foreground break-words">
                  {preview.detected_headers.join(", ")}
                </div>
                <div className="font-medium mt-3 mb-1">Mapping colonne:</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(preview.column_mapping).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground">{k}:</span>
                      <span className={v ? "" : "text-muted-foreground/60"}>
                        {v || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-card border rounded-lg p-4 text-sm space-y-2">
                <div className="font-medium mb-2">Anteprima Import:</div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Righe totali" value={preview.stats.total_rows} />
                  <Stat label="Righe valide" value={preview.stats.parsed} />
                  <Stat label="Nuove da inserire" value={preview.stats.to_insert} highlight="green" />
                  <Stat label="Da arricchire" value={preview.stats.to_update} highlight="blue" />
                  <Stat label="Già complete in DB" value={preview.stats.already_complete} highlight="muted" />
                  <Stat label="Duplicati nel file" value={preview.stats.intra_file_duplicates} highlight="muted" />
                  {preview.stats.invalid_rows > 0 && (
                    <Stat label="Righe non valide" value={preview.stats.invalid_rows} highlight="red" />
                  )}
                </div>
              </div>
              
              {preview.sample_new.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3 text-xs">
                  <div className="font-medium mb-1">Esempi di nuove strutture:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {preview.sample_new.map((s, i) => (
                      <li key={i}>{s.name} {s.city ? `— ${s.city}` : ""} {s.province ? `(${s.province})` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {preview.sample_updates.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3 text-xs">
                  <div className="font-medium mb-1">Esempi di campi che verranno arricchiti:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {preview.sample_updates.map((s, i) => (
                      <li key={i}>+ {s.merged?.join(", ") || "—"}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {/* Step 3: Risultato */}
          {executed && (
            <div className="bg-card border rounded-lg p-4 text-sm space-y-2">
              <div className="font-medium mb-2">Import Completato</div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Righe totali" value={executed.stats.total_rows} />
                <Stat label="Nuove inserite" value={executed.stats.inserted} highlight="green" />
                <Stat label="Aggiornate" value={executed.stats.updated} highlight="blue" />
                <Stat label="Già complete" value={executed.stats.already_complete} highlight="muted" />
                <Stat label="Duplicati nel file" value={executed.stats.intra_file_duplicates} highlight="muted" />
                {executed.stats.errors > 0 && (
                  <Stat label="Errori" value={executed.stats.errors} highlight="red" />
                )}
              </div>
              {executed.sample_errors && executed.sample_errors.length > 0 && (
                <div className="mt-3 pt-3 border-t text-xs">
                  <div className="font-medium mb-1">Primi errori:</div>
                  <ul className="list-disc list-inside text-destructive space-y-0.5">
                    {executed.sample_errors.map((e, i) => (
                      <li key={i}>{e.context}: {e.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          {executed ? (
            <>
              <Button variant="outline" onClick={reset}>Carica un altro file</Button>
              <Button onClick={() => onOpenChange(false)}>Chiudi</Button>
            </>
          ) : preview ? (
            <>
              <Button variant="outline" onClick={reset} disabled={isWorking}>
                Annulla
              </Button>
              <Button onClick={handleExecute} disabled={isWorking || preview.stats.to_insert + preview.stats.to_update === 0}>
                {isWorking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Conferma e Importa ({preview.stats.to_insert + preview.stats.to_update})
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
              <Button onClick={handlePreview} disabled={!file || isWorking}>
                {isWorking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Analizza file
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Helper per visualizzare statistiche
function Stat({ label, value, highlight }: { label: string; value: number; highlight?: "green" | "blue" | "red" | "muted" }) {
  const color = highlight === "green" ? "text-green-600 font-semibold"
    : highlight === "blue" ? "text-blue-600 font-semibold"
    : highlight === "red" ? "text-destructive font-semibold"
    : highlight === "muted" ? "text-muted-foreground"
    : ""
  return (
    <div className="flex justify-between border-b pb-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className={color}>{value.toLocaleString("it-IT")}</span>
    </div>
  )
}

// Componente OpenData Import
function OpenDataDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    results: { source: string; imported: number; parsed?: number; error?: string }[]
    totalImported: number
    totalInDatabase: number
  } | null>(null)

  const handleFetch = async () => {
    console.log("[v0] OpenData fetch started")
    setIsLoading(true)
    setResult(null)

    try {
      console.log("[v0] Calling /api/superadmin/prospects/fetch-opendata")
      const res = await fetch("/api/superadmin/prospects/fetch-opendata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      console.log("[v0] Response status:", res.status)
      const data = await res.json()
      console.log("[v0] Response data:", data)

      if (!res.ok) {
        throw new Error(data.error || "Errore durante il fetch")
      }

      setResult(data)
      toast.success(`Importate ${data.totalImported} strutture da OpenData`)
      onSuccess()
    } catch (err: any) {
      console.error("[v0] OpenData fetch error:", err)
      toast.error(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importa da OpenData Italia</DialogTitle>
          <DialogDescription>
            Scarica automaticamente strutture ricettive dai portali OpenData regionali italiani.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <div className="font-medium mb-2">Fonti disponibili:</div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
              <li>Puglia - Strutture Ricettive (~10.000)</li>
              <li>Umbria - Strutture Ricettive (~5.000)</li>
              <li>Lazio - Roma SUAR (~30.000)</li>
              <li>Lombardia - Milano (~19.000)</li>
              <li>Lombardia - Cremona &amp; Monza Brianza</li>
              <li>Emilia-Romagna - Bologna (~19.000)</li>
              <li>Emilia-Romagna - Modena (VisitModena)</li>
              <li>Trentino - Alberghieri ed Extra (~3.000)</li>
              <li>Toscana - Pisa Provincia (~1.200)</li>
              <li>Basilicata - Matera (~500)</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Dati ufficiali dai portali OpenData regionali, aggiornati quotidianamente.
            </p>
          </div>

          {result && (
            <div className="bg-muted rounded-lg p-4 text-sm space-y-2">
              <div className="font-medium">Risultato Import:</div>
                  {result.results.map((r, i) => (
                    <div key={i} className="flex justify-between gap-2">
                      <span className="flex-1">{r.source}</span>
                      <span className="text-right">
                        {r.parsed !== undefined && r.parsed > 0 && (
                          <span className="text-muted-foreground text-xs mr-2">
                            ({r.parsed} parsati)
                          </span>
                        )}
                        {r.error ? (
                          <span className="text-red-600 text-xs">{r.error}</span>
                        ) : (
                          <span className="text-green-600">{r.imported} importate</span>
                        )}
                      </span>
                    </div>
                  ))}
              <div className="pt-2 border-t mt-2">
                <div className="font-medium">
                  Totale importate: {result.totalImported}
                </div>
                <div className="text-muted-foreground">
                  Totale in database: {result.totalInDatabase}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          <Button onClick={handleFetch} disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isLoading ? "Scaricando..." : "Avvia Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

