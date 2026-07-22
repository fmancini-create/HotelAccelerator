"use client"

import React from "react"
import { useEffect, useState } from "react"
import { mutate } from "swr"
import { PMS_CONFIGS } from "@/lib/types/pms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Building2, Power, PowerOff, Trash2, RotateCcw, Edit, Plus, Search, UserCog, BarChart3 } from "lucide-react"
import { useRouter } from "next/navigation"
import { KpiTogglesDialog } from "./kpi-toggles-dialog"
import { ACCOMMODATION_TYPES, getAccommodationLabel } from "@/lib/utils/accommodation-labels"

interface Hotel {
  id: string
  organization_id: string
  name: string
  total_rooms: number
  accommodation_type: string | null
  city: string | null
  country: string | null
  address: string | null
  timezone: string
  currency: string
  is_active: boolean
  deleted_at: string | null
  min_price_delta_eur?: number | null
  notes: string | null
  created_at: string
  organization?: {
    id: string
    name: string
    type: string
  }
  pms_integrations?: Array<{
    id: string
    pms_name: string
    is_active: boolean
    last_sync_at: string | null
    api_key?: string | null
    api_secret?: string | null
    endpoint_url?: string | null
    vat_number?: string | null
    property_id?: string | null
  }>
}

interface Organization {
  id: string
  name: string
  type: string
  vat_number?: string | null
}

export function HotelsManager({
  initialHotels,
  organizations,
}: {
  initialHotels: Hotel[]
  organizations: Organization[]
}) {
  const router = useRouter()
  const [hotels, setHotels] = useState<Hotel[]>(initialHotels)
  const [searchQuery, setSearchQuery] = useState("")
  const [showDeleted, setShowDeleted] = useState(false)
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null)
  const [deletingHotel, setDeletingHotel] = useState<Hotel | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [kpiDialogHotel, setKpiDialogHotel] = useState<{ id: string; name: string } | null>(null)

  // Aprire la gestione hotel equivale a "leggere la posta": segna come visti
  // gli hotel appena registrati e azzera il pallino di avviso nella nav.
  useEffect(() => {
    fetch("/api/superadmin/hotels/mark-seen", { method: "POST" })
      .then(() => mutate("/api/superadmin/hotels/unread-count"))
      .catch(() => {})
  }, [])

  // Filter hotels based on search and deleted status
  const filteredHotels = hotels.filter((hotel) => {
    const matchesSearch =
      hotel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      hotel.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      hotel.organization?.name.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesDeletedFilter = showDeleted ? true : !hotel.deleted_at

    return matchesSearch && matchesDeletedFilter
  })

  const handleActivateToggle = async (hotel: Hotel) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/superadmin/hotels/${hotel.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !hotel.is_active }),
      })

      if (!response.ok) throw new Error("Failed to update hotel status")

      const { hotel: updatedHotel } = await response.json()
      setHotels(hotels.map((h) => (h.id === hotel.id ? { ...h, ...updatedHotel } : h)))
      router.refresh()
    } catch (error) {
      console.error("Error updating hotel status:", error)
      alert("Errore durante l'aggiornamento dello stato della struttura")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingHotel) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/superadmin/hotels/${deletingHotel.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to delete hotel")
      }

      const { hotel: updatedHotel } = await response.json()
      setHotels(hotels.map((h) => (h.id === deletingHotel.id ? { ...h, ...updatedHotel } : h)))
      setDeletingHotel(null)
      router.refresh()
    } catch (error) {
      console.error("Error deleting hotel:", error)
      alert(error instanceof Error ? error.message : "Errore durante l'eliminazione della struttura")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRestore = async (hotel: Hotel) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/superadmin/hotels/${hotel.id}/restore`, {
        method: "POST",
      })

      if (!response.ok) throw new Error("Failed to restore hotel")

      const { hotel: updatedHotel } = await response.json()
      setHotels(hotels.map((h) => (h.id === hotel.id ? { ...h, ...updatedHotel } : h)))
      router.refresh()
    } catch (error) {
      console.error("Error restoring hotel:", error)
      alert("Errore durante il ripristino della struttura")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (formData: Partial<Hotel>) => {
    setIsLoading(true)
    try {
      const url = editingHotel ? `/api/superadmin/hotels/${editingHotel.id}` : "/api/superadmin/hotels"
      const method = editingHotel ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData: any = {}
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { raw: errorText }
        }
        console.error("[v0] Hotel save error - status:", response.status, "statusText:", response.statusText, "body:", errorData)
        throw new Error(errorData.error || `Failed to save hotel (${response.status})`)
      }

      const { hotel: savedHotel } = await response.json()

      if (editingHotel) {
        setHotels(hotels.map((h) => (h.id === editingHotel.id ? { ...h, ...savedHotel } : h)))
      } else {
        setHotels([savedHotel, ...hotels])
      }

      setEditingHotel(null)
      setIsCreating(false)
      router.refresh()
    } catch (error) {
      console.error("Error saving hotel:", error)
      alert("Errore durante il salvataggio della struttura")
    } finally {
      setIsLoading(false)
    }
  }

  const handleImpersonate = async (hotel: Hotel) => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/superadmin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: hotel.id }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to impersonate hotel")

      // Hard reload so the server reads the new impersonation cookie
      window.location.href = "/dashboard"
    } catch (error) {
      console.error("Error impersonating hotel:", error)
      alert("Errore durante l'impersonazione della struttura")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gestione Strutture</CardTitle>
              <CardDescription>Visualizza e gestisci tutte le strutture nel sistema</CardDescription>
            </div>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nuova Struttura
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca struttura per nome, città o organizzazione..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant={showDeleted ? "default" : "outline"} onClick={() => setShowDeleted(!showDeleted)}>
              {showDeleted ? "Nascondi eliminati" : "Mostra eliminati"}
            </Button>
          </div>

          <div className="space-y-4">
            {filteredHotels.map((hotel) => (
              <div
                key={hotel.id}
                className={`border rounded-lg p-4 ${hotel.deleted_at ? "bg-red-50 border-red-200" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <Building2 className={`h-5 w-5 mt-1 ${hotel.is_active ? "text-green-600" : "text-gray-400"}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{hotel.name}</h3>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-600">
                          {hotel.id.slice(0, 8)}
                        </code>
                        {!hotel.is_active && <Badge variant="secondary">Disattivato</Badge>}
                        {hotel.deleted_at && <Badge variant="destructive">Eliminato</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>
                          <strong>Organizzazione:</strong> {hotel.organization?.name || "N/A"}
                        </div>
                        <div>
                          <strong>Località:</strong> {hotel.city || "N/A"}, {hotel.country || "N/A"}
                        </div>
                        <div>
<strong>Tipo:</strong> {getAccommodationLabel(hotel.accommodation_type)} • <strong>{getAccommodationLabel(hotel.accommodation_type)}:</strong> {hotel.total_rooms} • <strong>Valuta:</strong> {hotel.currency} •{" "}
  <strong>Timezone:</strong> {hotel.timezone}
                        </div>
                        {hotel.pms_integrations && hotel.pms_integrations.length > 0 && (
                          <div>
                            <strong>PMS:</strong>{" "}
                            {hotel.pms_integrations.map((pms) => (
                              <Badge key={pms.id} variant="outline" className="ml-1">
                                {pms.pms_name}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {hotel.notes && (
                          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                            <strong>Note:</strong> {hotel.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {hotel.deleted_at ? (
                      <Button size="sm" variant="outline" onClick={() => handleRestore(hotel)} disabled={isLoading}>
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Ripristina
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleImpersonate(hotel)}
                          disabled={isLoading}
                          title="Entra come questa struttura"
                        >
                          <UserCog className="h-4 w-4 mr-1" />
                          Impersona
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setKpiDialogHotel({ id: hotel.id, name: hotel.name })}
                          title="Configura visibilita KPI"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingHotel(hotel)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant={hotel.is_active ? "outline" : "default"}
                          onClick={() => handleActivateToggle(hotel)}
                          disabled={isLoading}
                        >
                          {hotel.is_active ? (
                            <>
                              <PowerOff className="h-4 w-4 mr-1" />
                              Disattiva
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-1" />
                              Attiva
                            </>
                          )}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeletingHotel(hotel)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {filteredHotels.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? "Nessuna struttura trovata con i criteri di ricerca" : "Nessuna struttura nel sistema"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <HotelFormDialog
        hotel={editingHotel}
        isOpen={!!editingHotel || isCreating}
        onClose={() => {
          setEditingHotel(null)
          setIsCreating(false)
        }}
        onSave={handleSave}
        organizations={organizations}
        isLoading={isLoading}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingHotel} onOpenChange={() => setDeletingHotel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare la struttura <strong>{deletingHotel?.name}</strong>? La struttura verrà
              disattivata e nascosta, ma i dati verranno conservati e potranno essere ripristinati in seguito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isLoading}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* KPI Visibility Toggles */}
      <KpiTogglesDialog
        open={!!kpiDialogHotel}
        onOpenChange={(open) => { if (!open) setKpiDialogHotel(null) }}
        hotelId={kpiDialogHotel?.id || ""}
        hotelName={kpiDialogHotel?.name || ""}
      />
    </div>
  )
}

function HotelFormDialog({
  hotel,
  isOpen,
  onClose,
  onSave,
  organizations,
  isLoading,
}: {
  hotel: Hotel | null
  isOpen: boolean
  onClose: () => void
  onSave: (data: Partial<Hotel>) => void
  organizations: Organization[]
  isLoading: boolean
}) {
  const [formData, setFormData] = useState<Partial<Hotel>>({
    name: "",
    organization_id: "",
    total_rooms: 0,
    accommodation_type: "hotel",
    city: "",
    country: "",
    address: "",
    timezone: "Europe/Rome",
    currency: "EUR",
    is_active: true,
    notes: "",
    min_price_delta_eur: 1,
  })

  const [pmsData, setPmsData] = useState({
    pms_name: "",
    api_key: "",
    api_secret: "",
    endpoint_url: "",
    vat_number: "",
    property_id: "",
  })
  const [customPmsName, setCustomPmsName] = useState("")
  const [pmsProviders, setPmsProviders] = useState<{ code: string; name: string }[]>([])

  // Load PMS providers from DB
  React.useEffect(() => {
    fetch("/api/superadmin/connectors/pms-providers")
      .then((r) => r.json())
      .then((data) => {
        if (data.providers) {
          setPmsProviders(
            data.providers
              .map((p: any) => ({ code: p.code, name: p.name }))
              .sort((a: any, b: any) => a.name.localeCompare(b.name))
          )
        }
      })
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    if (hotel) {
      setFormData({
        name: hotel.name,
        organization_id: hotel.organization_id,
        total_rooms: hotel.total_rooms,
        accommodation_type: hotel.accommodation_type || "hotel",
        city: hotel.city || "",
        country: hotel.country || "",
        address: hotel.address || "",
        timezone: hotel.timezone,
        currency: hotel.currency,
        is_active: hotel.is_active,
        notes: hotel.notes || "",
        min_price_delta_eur: hotel.min_price_delta_eur ?? 1,
      })
      // Load existing PMS integration
      const existingPms = hotel.pms_integrations?.[0]
      // Fallback chain for VAT: pms_integrations -> organization
      const orgForHotel = organizations.find((o) => o.id === hotel.organization_id)
      if (existingPms) {
        setPmsData({
          pms_name: existingPms.pms_name || "",
          api_key: (existingPms as Record<string, string>).api_key || "",
          api_secret: (existingPms as Record<string, string>).api_secret || "",
          endpoint_url: (existingPms as Record<string, string>).endpoint_url || "",
          vat_number: (existingPms as Record<string, string>).vat_number || orgForHotel?.vat_number || "",
          property_id: (existingPms as Record<string, string>).property_id || "",
        })
      } else {
        setPmsData({ pms_name: "", api_key: "", api_secret: "", endpoint_url: "", vat_number: "", property_id: "" })
      }
    } else {
      // Reset form for new hotel
      setFormData({
        name: "",
        organization_id: "",
        total_rooms: 0,
        accommodation_type: "hotel",
        city: "",
        country: "",
        address: "",
        timezone: "Europe/Rome",
        currency: "EUR",
        is_active: true,
        notes: "",
        min_price_delta_eur: 1,
      })
      setPmsData({ pms_name: "", api_key: "", api_secret: "", endpoint_url: "", vat_number: "", property_id: "" })
    }
  }, [hotel, isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pmsData.pms_name) {
      alert("Seleziona un PMS. Il PMS e obbligatorio per ogni struttura.")
      return
    }
    onSave({ ...formData, pms: pmsData } as Partial<Hotel>)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{hotel ? "Modifica Struttura" : "Nuova Struttura"}</DialogTitle>
          <DialogDescription>
            {hotel ? "Modifica i dettagli della struttura" : "Crea una nuova struttura nel sistema"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Nome Struttura *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="organization">Organizzazione *</Label>
              <Select
                value={formData.organization_id}
                onValueChange={(value) => setFormData({ ...formData, organization_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona organizzazione" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name} ({org.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="accommodation_type">Tipo di Sistemazione *</Label>
              <Select
                value={formData.accommodation_type || "camere"}
                onValueChange={(val) => setFormData({ ...formData, accommodation_type: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOMMODATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="total_rooms">Numero {getAccommodationLabel(formData.accommodation_type)} *</Label>
              <Input
                id="total_rooms"
                type="number"
                min="1"
                value={formData.total_rooms}
                onChange={(e) => setFormData({ ...formData, total_rooms: Number.parseInt(e.target.value) })}
                required
              />
            </div>

            <div>
              <Label htmlFor="currency">Valuta</Label>
              <Input
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="min_price_delta_eur">
                Soglia minima variazione tariffaria (EUR)
              </Label>
              <Input
                id="min_price_delta_eur"
                type="number"
                min="0"
                step="0.5"
                value={formData.min_price_delta_eur ?? 1}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    min_price_delta_eur: e.target.value === "" ? 1 : Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Le variazioni di prezzo inferiori a questa soglia (in EUR) vengono ignorate dal motore: niente log, niente push OTA. Default 1&euro; (qualunque variazione passa). Per evitare modifiche da pochi euro su tariffe alte (&gt;150&euro;) imposta es. 3-5&euro;.
              </p>
            </div>

            {/* ---- SEZIONE PMS (Obbligatorio) ---- */}
            <div className="col-span-2 border-t pt-4 mt-2">
              <h3 className="text-sm font-semibold mb-3">Integrazione PMS *</h3>
            </div>

            <div className="col-span-2">
              <Label htmlFor="pms_name">PMS *</Label>
              <Select
                value={
                  pmsData.pms_name === "__other__" ||
                  (pmsData.pms_name !== "" && !pmsProviders.some((p) => p.code === pmsData.pms_name))
                    ? "__other__"
                    : pmsData.pms_name
                }
                onValueChange={(v) => {
                  if (v === "__other__") {
                    setPmsData((prev) => ({ ...prev, pms_name: "__other__", endpoint_url: "" }))
                    setCustomPmsName("")
                  } else {
                    setCustomPmsName("")
                    if (v === "scidoo") {
                      setPmsData((prev) => ({ ...prev, pms_name: v, endpoint_url: prev.endpoint_url || "https://www.scidoo.com/api/v1" }))
                    } else {
                      setPmsData((prev) => ({ ...prev, pms_name: v }))
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona PMS *" />
                </SelectTrigger>
                <SelectContent>
                  {pmsProviders.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__other__">Altro (suggerisci)</SelectItem>
                </SelectContent>
              </Select>
              {pmsData.pms_name === "__other__" && (
                <div className="mt-2">
                  <Input
                    placeholder="Scrivi il nome del PMS..."
                    value={customPmsName}
                    onChange={(e) => {
                      setCustomPmsName(e.target.value)
                      setPmsData((prev) => ({ ...prev, pms_name: e.target.value.toLowerCase().replace(/\s+/g, "_") || "__other__" }))
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Inserisci il nome del tuo PMS. Lo aggiungeremo al sistema.</p>
                </div>
              )}
            </div>

            {pmsData.pms_name && (
              <>
                <div className="col-span-2">
                  <Label htmlFor="pms_api_key">API Key</Label>
                  <Input
                    id="pms_api_key"
                    value={pmsData.api_key}
                    onChange={(e) => setPmsData({ ...pmsData, api_key: e.target.value })}
                    placeholder="Inserisci API Key del PMS"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="pms_endpoint">Endpoint URL</Label>
                  <Input
                    id="pms_endpoint"
                    value={pmsData.endpoint_url}
                    onChange={(e) => setPmsData({ ...pmsData, endpoint_url: e.target.value })}
                    placeholder="es. https://www.scidoo.com/api/v1"
                  />
                </div>

                <div>
                  <Label htmlFor="pms_vat">P.IVA PMS</Label>
                  <Input
                    id="pms_vat"
                    value={pmsData.vat_number}
                    onChange={(e) => setPmsData({ ...pmsData, vat_number: e.target.value })}
                    placeholder="Partita IVA per il PMS"
                  />
                </div>

                <div>
                  <Label htmlFor="pms_property_id">Property ID</Label>
                  <Input
                    id="pms_property_id"
                    value={pmsData.property_id}
                    onChange={(e) => setPmsData({ ...pmsData, property_id: e.target.value })}
                    placeholder="ID struttura nel PMS"
                  />
                </div>
              </>
            )}

            <div className="col-span-2">
              <Label htmlFor="address">Indirizzo</Label>
              <Input
                id="address"
                value={formData.address || ""}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="city">Città</Label>
              <Input
                id="city"
                value={formData.city || ""}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="country">Paese</Label>
              <Input
                id="country"
                value={formData.country || ""}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="notes">Note Admin</Label>
              <Textarea
                id="notes"
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading}>
              {hotel ? "Salva Modifiche" : "Crea Struttura"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
