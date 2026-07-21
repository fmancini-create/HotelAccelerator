"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Search, AlertTriangle, CheckCircle2, Clock, XCircle, Settings, Plus } from "lucide-react"
import { toast } from "sonner"
import { CommissionPeriodsEditor } from "./commission-periods-editor"

interface Subscription {
  id: string
  hotel_id: string
  plan_type: string
  algorithm_type: string
  is_active: boolean
  started_at: string
  trial_start_at: string | null
  trial_end_at: string | null
  payment_status: string
  next_billing_date: string | null
  fixed_fee_per_room: number | null
  commission_percentage: number | null
  commission_basis: "total" | "delta" | null
  hotel: {
    id: string
    name: string
    total_rooms: number
    city: string | null
    organization_id: string | null
  } | null
}

interface Organization {
  id: string
  name: string
  company_name: string | null
  vat_number: string | null
}

// Safe accessor helpers to avoid crashes when nested fields are null
function hotelName(sub: Subscription) {
  return sub.hotel?.name ?? "Hotel sconosciuto"
}
function getOrgForSub(sub: Subscription, organizations: Organization[]) {
  if (!sub.hotel?.organization_id) return null
  return organizations.find(o => o.id === sub.hotel?.organization_id) || null
}
function orgName(sub: Subscription, organizations: Organization[]) {
  const org = getOrgForSub(sub, organizations)
  return org?.name ?? org?.company_name ?? "Nessuna organizzazione"
}
function orgVat(sub: Subscription, organizations: Organization[]) {
  const org = getOrgForSub(sub, organizations)
  return org?.vat_number ?? null
}

interface Hotel {
  id: string
  name: string
  total_rooms: number
  city: string | null
  organization_id: string | null
  organization?: { name: string; company_name: string | null } | null
}

export function SubscriptionsManager({ subscriptions, hotels = [], organizations = [] }: { subscriptions: Subscription[]; hotels?: Hotel[]; organizations?: Organization[] }) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [manageSub, setManageSub] = useState<Subscription | null>(null)
  const [saving, setSaving] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [creatingForHotel, setCreatingForHotel] = useState<Hotel | null>(null)
  const [creating, setCreating] = useState(false)
  const [newSub, setNewSub] = useState({
    plan_type: "fixed_fee",
    algorithm_type: "basic",
    is_active: true,
    payment_status: "active",
    fixed_fee_per_room: 3.0,
    commission_percentage: 10,
    commission_basis: "total" as "total" | "delta",
    trial_end_at: "",
    next_billing_date: "",
  })

  // Hotels that don't have a subscription yet
  const hotelIdsWithSub = new Set(subscriptions.map(s => s.hotel_id))
  const hotelsWithoutSub = hotels.filter(h => !hotelIdsWithSub.has(h.id))

  const filteredSubscriptions = subscriptions.filter((sub) => {
    // Safe null checks -- a missing organization must NOT crash the filter
    const hotelN = hotelName(sub).toLowerCase()
    const orgN = orgName(sub, organizations).toLowerCase()
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q || hotelN.includes(q) || orgN.includes(q)

    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "active" && sub.is_active && !sub.trial_end_at) ||
      (filterStatus === "trial" && sub.trial_end_at && new Date(sub.trial_end_at) > new Date()) ||
      (filterStatus === "inactive" && !sub.is_active)

    return matchesSearch && matchesFilter
  })

  const handleSaveManage = async () => {
    if (!manageSub) return
    setSaving(true)
    try {
      const res = await fetch(`/api/superadmin/subscriptions/${manageSub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_active: manageSub.is_active,
          plan_type: manageSub.plan_type,
          algorithm_type: manageSub.algorithm_type,
          payment_status: manageSub.payment_status,
          fixed_fee_per_room: manageSub.fixed_fee_per_room,
          commission_percentage: manageSub.commission_percentage,
          started_at: manageSub.started_at,
          trial_end_at: manageSub.trial_end_at,
          next_billing_date: manageSub.next_billing_date,
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || "Errore salvataggio")
      }
      toast.success("Abbonamento aggiornato")
      setManageSub(null)
      router.refresh()
    } catch {
      toast.error("Errore nel salvataggio dell'abbonamento")
    } finally {
      setSaving(false)
    }
  }

  const handleCreateSubscription = async () => {
    if (!creatingForHotel) return
    setCreating(true)
    try {
      const res = await fetch("/api/superadmin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: creatingForHotel.id,
          plan_type: newSub.plan_type,
          algorithm_type: newSub.algorithm_type,
          is_active: newSub.is_active,
          payment_status: newSub.payment_status,
          fixed_fee_per_room: newSub.plan_type === "fixed_fee" ? newSub.fixed_fee_per_room : null,
          commission_percentage: newSub.plan_type === "commission" ? newSub.commission_percentage : null,
          trial_end_at: newSub.trial_end_at || null,
          next_billing_date: newSub.next_billing_date || null,
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || "Errore creazione abbonamento")
      }
      toast.success(`Abbonamento creato per ${creatingForHotel.name}`)
      setShowCreateDialog(false)
      setCreatingForHotel(null)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || "Errore nella creazione dell'abbonamento")
    } finally {
      setCreating(false)
    }
  }

  const getTrialDaysRemaining = (trialEndAt: string | null) => {
    if (!trialEndAt) return null
    const days = Math.ceil((new Date(trialEndAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    return days > 0 ? days : 0
  }

  const getStatusBadge = (sub: Subscription) => {
    if (!sub.is_active) {
      return (
        <Badge variant="secondary" className="gap-1">
          <XCircle className="h-3 w-3" />
          Disattivato
        </Badge>
      )
    }

    const isInTrial = sub.trial_end_at && new Date(sub.trial_end_at) > new Date()
    const trialDays = getTrialDaysRemaining(sub.trial_end_at)

    if (isInTrial) {
      return (
        <Badge className="bg-blue-600 gap-1">
          <Clock className="h-3 w-3" />
          Prova ({trialDays}gg)
        </Badge>
      )
    }

    if (sub.payment_status === "failed") {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Pagamento Fallito
        </Badge>
      )
    }

    if (sub.payment_status === "pending") {
      return (
        <Badge className="bg-yellow-600 gap-1">
          <Clock className="h-3 w-3" />
          In Attesa
        </Badge>
      )
    }

    return (
      <Badge className="bg-green-600 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Attivo
      </Badge>
    )
  }

  const getMonthlyFee = (sub: Subscription) => {
    if (sub.plan_type === "fixed_fee") {
      return `€${((sub.fixed_fee_per_room || 0) * sub.hotel.total_rooms).toFixed(2)}`
    }
    // Per commissione: se commission_percentage è null, mostra "Vedi periodi"
    if (sub.commission_percentage == null) {
      return "Vedi periodi"
    }
    return `${sub.commission_percentage}%`
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>Gestione Abbonamenti</CardTitle>
            <CardDescription>Visualizza e gestisci tutti gli abbonamenti Accelerator</CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("all")}
            >
              Tutti ({subscriptions.length})
            </Button>
            <Button
              variant={filterStatus === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("active")}
            >
              Attivi
            </Button>
            <Button
              variant={filterStatus === "trial" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("trial")}
            >
              In Prova
            </Button>
            <Button
              variant={filterStatus === "inactive" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("inactive")}
            >
              Disattivati
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-green-600 hover:bg-green-700"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-4 w-4" />
              Nuovo Abbonamento
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per hotel o organizzazione..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hotel</TableHead>
                <TableHead>Organizzazione</TableHead>
                <TableHead>Camere</TableHead>
                <TableHead>Piano</TableHead>
                <TableHead>Costo/Comm.</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Prossimo Pagamento</TableHead>
                <TableHead>Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{hotelName(sub)}</span>
                      <code className="text-xs text-muted-foreground">{sub.hotel_id.slice(0, 8)}</code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
<span className="text-sm">{orgName(sub, organizations)}</span>
                    {orgVat(sub, organizations) && (
                      <span className="text-xs text-muted-foreground">
                        P.IVA: {orgVat(sub, organizations)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{sub.hotel.total_rooms}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="w-fit">
                        {sub.plan_type === "fixed_fee" ? "Fee Fissa" : "Commissione"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {sub.algorithm_type === "basic" ? "Base" : "Avanzato"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{getMonthlyFee(sub)}</TableCell>
                  <TableCell>{getStatusBadge(sub)}</TableCell>
                  <TableCell>
                    {sub.next_billing_date ? (
                      <span className="text-sm">{new Date(sub.next_billing_date).toLocaleDateString("it-IT")}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setManageSub(sub)}>
                        <Settings className="h-3.5 w-3.5" />
                        Gestisci
                      </Button>
                      {sub.plan_type === "commission" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => router.push(`/superadmin/onboarding/${sub.id}`)}
                            title="Onboarding post-firma"
                          >
                            Onboarding
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => router.push(`/superadmin/revman/${sub.hotel_id}`)}
                            title="Area Revenue Manager"
                          >
                            Area RevMan
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredSubscriptions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nessun abbonamento trovato con i criteri di ricerca
          </div>
        )}
      </CardContent>

      {/* Manage Dialog */}
      <Dialog open={!!manageSub} onOpenChange={(open) => !open && setManageSub(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Gestisci Abbonamento</DialogTitle>
            <DialogDescription>{manageSub ? hotelName(manageSub) : ""}</DialogDescription>
          </DialogHeader>
          {manageSub && (
            <div className="space-y-4 py-2 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Piano</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={manageSub.plan_type}
                    onChange={(e) => setManageSub({ ...manageSub, plan_type: e.target.value })}
                  >
                    <option value="fixed_fee">Fee Fissa</option>
                    <option value="commission">Commissione</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Algoritmo</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={manageSub.algorithm_type}
                    onChange={(e) => setManageSub({ ...manageSub, algorithm_type: e.target.value })}
                  >
                    <option value="basic">Base</option>
                    <option value="advanced">Avanzato</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Stato pagamento</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={manageSub.payment_status}
                    onChange={(e) => setManageSub({ ...manageSub, payment_status: e.target.value })}
                  >
                    <option value="pending">In Attesa</option>
                    <option value="active">Attivo</option>
                    <option value="failed">Fallito</option>
                    <option value="cancelled">Cancellato</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Abbonamento attivo</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={manageSub.is_active ? "true" : "false"}
                    onChange={(e) => setManageSub({ ...manageSub, is_active: e.target.value === "true" })}
                  >
                    <option value="true">Attivo</option>
                    <option value="false">Disattivato</option>
                  </select>
                </div>
              </div>

              {manageSub.plan_type === "fixed_fee" && (
                <div className="space-y-1.5">
                  <Label>Fee fissa per camera (€/mese)</Label>
                  <input
                    type="number"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={manageSub.fixed_fee_per_room ?? ""}
                    onChange={(e) => setManageSub({ ...manageSub, fixed_fee_per_room: parseFloat(e.target.value) || null })}
                  />
                </div>
              )}
              {manageSub.plan_type === "commission" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Data inizio conteggio commissioni</Label>
                    <input
                      type="date"
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={manageSub.started_at ? manageSub.started_at.slice(0, 10) : ""}
                      onChange={(e) => setManageSub({ ...manageSub, started_at: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Le commissioni sono conteggiate a partire da questa data. Per
                      variazioni di percentuale o base di calcolo nel tempo, usa i
                      periodi qui sotto.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Percentuale commissione corrente (%)</Label>
                    <input
                      type="number"
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={manageSub.commission_percentage ?? ""}
                      onChange={(e) => setManageSub({ ...manageSub, commission_percentage: parseFloat(e.target.value) || null })}
                    />
<p className="text-xs text-muted-foreground">
  Questo valore e&apos; un riferimento veloce. La storia completa con periodi
  di validita&apos; e base di calcolo (produzione totale o solo incremento YoY)
  si gestisce qui sotto e prevale per il calcolo delle commissioni mensili.
  </p>
  </div>
                  <CommissionPeriodsEditor subscriptionId={manageSub.id} />
                </>
              )}

              <div className="space-y-1.5">
                <Label>Fine periodo di prova</Label>
                <input
                  type="date"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={manageSub.trial_end_at ? manageSub.trial_end_at.slice(0, 10) : ""}
                  onChange={(e) => setManageSub({ ...manageSub, trial_end_at: e.target.value || null })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Prossimo pagamento</Label>
                <input
                  type="date"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={manageSub.next_billing_date ? manageSub.next_billing_date.slice(0, 10) : ""}
                  onChange={(e) => setManageSub({ ...manageSub, next_billing_date: e.target.value || null })}
                />
              </div>
            </div>
          )}
          {/* Bottoni sempre visibili in fondo */}
          {manageSub && (
            <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
              <Button variant="outline" onClick={() => setManageSub(null)} disabled={saving}>
                Annulla
              </Button>
              <Button onClick={handleSaveManage} disabled={saving}>
                {saving ? "Salvataggio..." : "Salva modifiche"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog per creare nuovo abbonamento */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuovo Abbonamento</DialogTitle>
            <DialogDescription>
              Seleziona un hotel e configura l'abbonamento Accelerator
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Selezione Hotel */}
            <div className="space-y-1.5">
              <Label>Hotel</Label>
              {hotelsWithoutSub.length > 0 ? (
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={creatingForHotel?.id || ""}
                  onChange={(e) => {
                    const h = hotelsWithoutSub.find(h => h.id === e.target.value)
                    setCreatingForHotel(h || null)
                  }}
                >
                  <option value="">Seleziona hotel...</option>
                  {hotelsWithoutSub.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.total_rooms} camere) - {h.organization?.name || h.organization?.company_name || "Nessuna org."}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
                  Tutti gli hotel hanno già un abbonamento
                </div>
              )}
            </div>

            {creatingForHotel && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Tipo piano</Label>
                    <select
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={newSub.plan_type}
                      onChange={(e) => setNewSub({ ...newSub, plan_type: e.target.value })}
                    >
                      <option value="fixed_fee">Fee Fissa</option>
                      <option value="commission">Commissione</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Algoritmo</Label>
                    <select
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={newSub.algorithm_type}
                      onChange={(e) => setNewSub({ ...newSub, algorithm_type: e.target.value })}
                    >
                      <option value="basic">Basic</option>
                      <option value="advanced">Advanced</option>
                      <option value="ai">AI</option>
                    </select>
                  </div>
                </div>

                {newSub.plan_type === "fixed_fee" && (
                  <div className="space-y-1.5">
                    <Label>Fee per camera (€/mese)</Label>
                    <input
                      type="number"
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={newSub.fixed_fee_per_room}
                      onChange={(e) => setNewSub({ ...newSub, fixed_fee_per_room: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                )}
{newSub.plan_type === "commission" && (
  <>
  <div className="space-y-1.5">
  <Label>Percentuale commissione (%)</Label>
  <input
  type="number"
  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
  value={newSub.commission_percentage}
  onChange={(e) => setNewSub({ ...newSub, commission_percentage: parseFloat(e.target.value) || 0 })}
  />
  </div>
  <div className="space-y-1.5">
  <Label>Base di calcolo</Label>
  <select
    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
    value={newSub.commission_basis}
    onChange={(e) => setNewSub({ ...newSub, commission_basis: e.target.value as "total" | "delta" })}
  >
    <option value="total">Produzione totale</option>
    <option value="delta">Solo incremento YoY</option>
  </select>
  </div>
  </>
  )}

                <div className="space-y-1.5">
                  <Label>Fine periodo prova (opzionale)</Label>
                  <input
                    type="date"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={newSub.trial_end_at}
                    onChange={(e) => setNewSub({ ...newSub, trial_end_at: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Prossimo pagamento</Label>
                  <input
                    type="date"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={newSub.next_billing_date}
                    onChange={(e) => setNewSub({ ...newSub, next_billing_date: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setShowCreateDialog(false); setCreatingForHotel(null) }} disabled={creating}>
                    Annulla
                  </Button>
                  <Button onClick={handleCreateSubscription} disabled={creating}>
                    {creating ? "Creazione..." : "Crea Abbonamento"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
