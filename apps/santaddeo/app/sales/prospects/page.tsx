"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
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
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Search,
  Building2,
  Star,
  Phone,
  Mail,
  Globe,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MessageSquare,
  UserPlus,
  XCircle,
  CheckCircle,
  Loader2,
  MapPin,
} from "lucide-react"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
  notes: string | null
  last_contact_at: string | null
  contact_attempts: number
  assignment_date: string | null
}

const CATEGORIES = [
  { value: "hotel", label: "Hotel" },
  { value: "b&b", label: "B&B" },
  { value: "agriturismo", label: "Agriturismo" },
  { value: "residence", label: "Residence" },
  { value: "camping", label: "Camping" },
  { value: "ostello", label: "Ostello" },
  { value: "casa_vacanze", label: "Casa Vacanze" },
  { value: "altro", label: "Altro" },
]

const STATUSES = [
  { value: "assigned", label: "Da contattare", color: "bg-blue-100 text-blue-700" },
  { value: "contacted", label: "Contattato", color: "bg-yellow-100 text-yellow-700" },
  { value: "meeting_scheduled", label: "Demo fissata", color: "bg-purple-100 text-purple-700" },
  { value: "proposal_sent", label: "Proposta inviata", color: "bg-orange-100 text-orange-700" },
  { value: "converted", label: "Convertito", color: "bg-green-100 text-green-700" },
  { value: "not_interested", label: "Non interessato", color: "bg-red-100 text-red-700" },
  { value: "not_reachable", label: "Non raggiungibile", color: "bg-gray-100 text-gray-700" },
]

export default function SalesProspectsPage() {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")
  const [city, setCity] = useState<string>("")
  const [postalCode, setPostalCode] = useState<string>("")
  const [stars, setStars] = useState<string>("all")
  const [page, setPage] = useState(1)
  const pageSize = 25
  
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [newStatus, setNewStatus] = useState("")
  const [notes, setNotes] = useState("")
  const [isUpdating, setIsUpdating] = useState(false)
  
  const buildQuery = useCallback(() => {
    const params = new URLSearchParams()
    params.set("page", page.toString())
    params.set("page_size", pageSize.toString())
    if (search) params.set("search", search)
    if (category && category !== "all") params.set("category", category)
    if (status && status !== "all") params.set("status", status)
    if (city.trim()) params.set("city", city.trim())
    if (postalCode.trim()) params.set("postal_code", postalCode.trim())
    if (stars && stars !== "all") params.set("stars", stars)
    return `/api/sales/prospects?${params.toString()}`
  }, [page, search, category, status, city, postalCode, stars])
  
  const { data, error, isLoading, mutate } = useSWR<{
    prospects: Prospect[]
    pagination: { page: number; pageSize: number; total: number; totalPages: number }
    stats: { total: number; assigned: number; contacted: number; converted: number }
  }>(buildQuery(), fetcher)
  
  const handleOpenAction = (prospect: Prospect) => {
    setSelectedProspect(prospect)
    setNewStatus(prospect.status)
    setNotes(prospect.notes || "")
    setActionDialogOpen(true)
  }
  
  const handleUpdateProspect = async () => {
    if (!selectedProspect) return
    
    setIsUpdating(true)
    try {
      const res = await fetch("/api/sales/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect_id: selectedProspect.id,
          status: newStatus,
          notes,
          last_contact_at: new Date().toISOString(),
        }),
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Errore durante l'aggiornamento")
      }
      
      toast.success("Prospect aggiornato")
      setActionDialogOpen(false)
      mutate()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsUpdating(false)
    }
  }
  
  const handleCreateDeal = (prospect: Prospect) => {
    // Redirect to pipeline with prospect pre-filled
    window.location.href = `/sales/pipeline?create_from_prospect=${prospect.id}`
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
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">I Miei Prospect</h1>
        <p className="text-muted-foreground">
          Strutture ricettive assegnate a te per attivita commerciale
        </p>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale Assegnati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Da Contattare
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {data?.stats?.assigned || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Contattati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {data?.stats?.contacted || 0}
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
              {data?.stats?.converted || 0}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca nome o citta..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3 w-full sm:w-auto">
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[140px]">
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

        <Input
          placeholder="Citta'"
          value={city}
          onChange={(e) => { setCity(e.target.value); setPage(1) }}
          className="w-full sm:w-[140px]"
        />

        <Input
          placeholder="CAP"
          value={postalCode}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 5)
            setPostalCode(v)
            setPage(1)
          }}
          inputMode="numeric"
          maxLength={5}
          className="w-full sm:w-[100px]"
        />

        <Select value={stars} onValueChange={(v) => { setStars(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[130px]">
            <Star className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Stelle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="1">1 stella</SelectItem>
            <SelectItem value="2">2 stelle</SelectItem>
            <SelectItem value="3">3 stelle</SelectItem>
            <SelectItem value="4">4 stelle</SelectItem>
            <SelectItem value="5">5 stelle</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button variant="outline" size="icon" onClick={() => mutate()} className="col-span-2 w-full sm:w-10">
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
        </div>
      </div>
      
      {/* Table (desktop) */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-center">Stelle</TableHead>
              <TableHead>Localita</TableHead>
              <TableHead>Contatti</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-red-500">
                  Errore nel caricamento
                </TableCell>
              </TableRow>
            ) : !data?.prospects?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nessun prospect assegnato
                </TableCell>
              </TableRow>
            ) : (
              data.prospects.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={(e) => {
                    // Evita di aprire il link se il click parte da un bottone/azione
                    const t = e.target as HTMLElement
                    if (t.closest("button, a")) return
                    window.location.href = `/sales/prospects/${p.id}`
                  }}
                >
                  <TableCell className="font-medium">
                    <a
                      href={`/sales/prospects/${p.id}`}
                      className="hover:text-emerald-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {p.name}
                    </a>
                  </TableCell>
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
                    <div className="flex items-center gap-1 text-sm">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {p.city}
                      {p.province && <span className="text-muted-foreground"> ({p.province})</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs">
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 hover:text-blue-600">
                          <Phone className="h-3 w-3" /> {p.phone}
                        </a>
                      )}
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:text-blue-600">
                          <Mail className="h-3 w-3" /> {p.email}
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(p.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        title="Apri scheda"
                      >
                        <a href={`/sales/prospects/${p.id}`}>Apri</a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenAction(p)}
                        title="Aggiorna stato"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCreateDeal(p)}
                        title="Crea deal"
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Card list (mobile) */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-10 text-red-500">Errore nel caricamento</div>
        ) : !data?.prospects?.length ? (
          <div className="text-center py-10 text-muted-foreground">Nessun prospect assegnato</div>
        ) : (
          data.prospects.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <CardContent className="p-4">
                <a
                  href={`/sales/prospects/${p.id}`}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {getCategoryLabel(p.category)}
                      {p.stars ? (
                        <span className="inline-flex items-center gap-0.5 ml-1">
                          · {p.stars} <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {getStatusBadge(p.status)}
                </a>

                {(p.city || p.province) && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {p.city}
                      {p.province && ` (${p.province})`}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3">
                  {p.phone && (
                    <Button variant="outline" size="sm" asChild className="flex-1">
                      <a href={`tel:${p.phone}`}>
                        <Phone className="h-4 w-4 mr-1.5" /> Chiama
                      </a>
                    </Button>
                  )}
                  {p.email && (
                    <Button variant="outline" size="sm" asChild className="flex-1">
                      <a href={`mailto:${p.email}`}>
                        <Mail className="h-4 w-4 mr-1.5" /> Email
                      </a>
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleOpenAction(p)}
                  >
                    <MessageSquare className="h-4 w-4 mr-1.5" /> Stato
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleCreateDeal(p)}
                  >
                    <UserPlus className="h-4 w-4 mr-1.5" /> Deal
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      
      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            Pagina {data.pagination.page} di {data.pagination.totalPages}
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
      
      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedProspect?.name}</DialogTitle>
            <DialogDescription>
              Aggiorna lo stato e aggiungi note sul contatto
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Stato</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Aggiungi note sul contatto..."
                rows={4}
              />
            </div>
            
            {selectedProspect?.last_contact_at && (
              <div className="text-sm text-muted-foreground">
                Ultimo contatto: {new Date(selectedProspect.last_contact_at).toLocaleDateString("it-IT")}
                {selectedProspect.contact_attempts > 0 && (
                  <span> ({selectedProspect.contact_attempts} tentativi)</span>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleUpdateProspect} disabled={isUpdating}>
              {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
