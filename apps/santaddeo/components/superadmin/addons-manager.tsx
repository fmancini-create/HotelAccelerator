"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, Crown, Trash2, Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { it } from "date-fns/locale"

interface Addon {
  id: string
  hotel_id: string
  user_id: string | null
  addon_type: string
  status: string
  price_cents: number
  billing_interval: string
  current_period_start: string | null
  current_period_end: string | null
  stripe_subscription_id: string | null
  created_at: string
  hotels?: { id: string; name: string } | null
  profiles?: { id: string; email: string; full_name: string | null } | null
}

interface Hotel {
  id: string
  name: string
}

const ADDON_TYPES = [
  { id: "premium_expert", name: "Premium Expert", price: 499 },
]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Attivo", color: "bg-green-100 text-green-700" },
  canceled: { label: "Cancellato", color: "bg-red-100 text-red-700" },
  past_due: { label: "Scaduto", color: "bg-amber-100 text-amber-700" },
  trialing: { label: "Trial", color: "bg-blue-100 text-blue-700" },
  unpaid: { label: "Non pagato", color: "bg-gray-100 text-gray-700" },
}

export function AddonsManager({ hotels }: { hotels: Hotel[] }) {
  const [addons, setAddons] = useState<Addon[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newAddon, setNewAddon] = useState({
    hotel_id: "",
    addon_type: "premium_expert",
    status: "active",
  })

  const fetchAddons = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/superadmin/addons")
      const data = await res.json()
      setAddons(data.addons || [])
    } catch (error) {
      console.error("Error fetching addons:", error)
      toast.error("Errore nel caricamento degli addon")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAddons()
  }, [])

  const filteredAddons = addons.filter((addon) => {
    const hotelName = addon.hotels?.name?.toLowerCase() || ""
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q || hotelName.includes(q)
    const matchesStatus = filterStatus === "all" || addon.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const handleCreate = async () => {
    if (!newAddon.hotel_id) {
      toast.error("Seleziona un hotel")
      return
    }

    setCreating(true)
    try {
      const res = await fetch("/api/superadmin/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAddon),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Errore nella creazione")
      }

      toast.success("Addon creato con successo")
      setShowCreateDialog(false)
      setNewAddon({ hotel_id: "", addon_type: "premium_expert", status: "active" })
      fetchAddons()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nella creazione")
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm("Sei sicuro di voler cancellare questo addon?")) return

    try {
      const res = await fetch(`/api/superadmin/addons?id=${id}`, {
        method: "DELETE",
      })

      if (!res.ok) throw new Error("Errore nella cancellazione")

      toast.success("Addon cancellato")
      fetchAddons()
    } catch (error) {
      toast.error("Errore nella cancellazione")
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/superadmin/addons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })

      if (!res.ok) throw new Error("Errore nell'aggiornamento")

      toast.success("Stato aggiornato")
      fetchAddons()
    } catch (error) {
      toast.error("Errore nell'aggiornamento")
    }
  }

  // Hotels without active premium_expert addon
  const hotelsWithAddon = new Set(
    addons.filter(a => a.addon_type === "premium_expert" && a.status === "active").map(a => a.hotel_id)
  )
  const availableHotels = hotels.filter(h => !hotelsWithAddon.has(h.id))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-emerald-600" />
              Gestione Addon Premium
            </CardTitle>
            <CardDescription>
              Gestisci gli addon Premium Expert degli hotel
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchAddons} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Addon
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca hotel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="active">Attivi</SelectItem>
              <SelectItem value="canceled">Cancellati</SelectItem>
              <SelectItem value="past_due">Scaduti</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-2xl font-bold text-green-700">
              {addons.filter(a => a.status === "active").length}
            </p>
            <p className="text-sm text-green-600">Attivi</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-2xl font-bold text-red-700">
              {addons.filter(a => a.status === "canceled").length}
            </p>
            <p className="text-sm text-red-600">Cancellati</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4">
            <p className="text-2xl font-bold text-amber-700">
              {addons.filter(a => a.status === "past_due").length}
            </p>
            <p className="text-sm text-amber-600">Scaduti</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-4">
            <p className="text-2xl font-bold text-emerald-700">
              {(addons.filter(a => a.status === "active").reduce((sum, a) => sum + a.price_cents, 0) / 100).toLocaleString("it-IT")} EUR
            </p>
            <p className="text-sm text-emerald-600">Ricavi Annuali</p>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAddons.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Nessun addon trovato
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Addon</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Prezzo</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead>Stripe</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAddons.map((addon) => {
                  const statusInfo = STATUS_LABELS[addon.status] || { label: addon.status, color: "bg-gray-100" }
                  return (
                    <TableRow key={addon.id}>
                      <TableCell className="font-medium">
                        {addon.hotels?.name || "Hotel sconosciuto"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          {ADDON_TYPES.find(t => t.id === addon.addon_type)?.name || addon.addon_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusInfo.color}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(addon.price_cents / 100).toLocaleString("it-IT")} EUR/{addon.billing_interval === "year" ? "anno" : "mese"}
                      </TableCell>
                      <TableCell>
                        {addon.current_period_end
                          ? format(new Date(addon.current_period_end), "dd MMM yyyy", { locale: it })
                          : "-"
                        }
                      </TableCell>
                      <TableCell>
                        {addon.stripe_subscription_id ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Manuale</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Select 
                            value={addon.status} 
                            onValueChange={(value) => handleStatusChange(addon.id, value)}
                          >
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Attivo</SelectItem>
                              <SelectItem value="canceled">Cancellato</SelectItem>
                              <SelectItem value="past_due">Scaduto</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleCancel(addon.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Addon Premium</DialogTitle>
            <DialogDescription>
              Attiva manualmente un addon per un hotel
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Hotel</Label>
              <Select value={newAddon.hotel_id} onValueChange={(v) => setNewAddon({ ...newAddon, hotel_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona hotel" />
                </SelectTrigger>
                <SelectContent>
                  {availableHotels.map((hotel) => (
                    <SelectItem key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableHotels.length === 0 && (
                <p className="text-sm text-amber-600">Tutti gli hotel hanno gia' Premium Expert attivo</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Addon</Label>
              <Select value={newAddon.addon_type} onValueChange={(v) => setNewAddon({ ...newAddon, addon_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADDON_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name} - {type.price} EUR/anno
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Stato</Label>
              <Select value={newAddon.status} onValueChange={(v) => setNewAddon({ ...newAddon, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Attivo</SelectItem>
                  <SelectItem value="trialing">Trial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newAddon.hotel_id}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crea Addon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
