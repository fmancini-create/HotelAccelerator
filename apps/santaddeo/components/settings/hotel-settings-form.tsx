"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useRouter } from "next/navigation"
import { Loader2, SlidersHorizontal, Lock, MessageSquareWarning, CheckCircle2, MapPin, Building2 } from "lucide-react"
import { ACCOMMODATION_TYPES, getAccommodationPlural } from "@/lib/utils/accommodation-labels"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { KpiTogglesDialog } from "@/components/superadmin/kpi-toggles-dialog"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface HotelSettingsFormProps {
  hotel: any
  organization: any
  isSuperAdmin: boolean
}

export function HotelSettingsForm({ hotel, organization, isSuperAdmin }: HotelSettingsFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false)
  const [changeRequestOpen, setChangeRequestOpen] = useState(false)
  const [changeRequestMessage, setChangeRequestMessage] = useState("")
  const [changeRequestSending, setChangeRequestSending] = useState(false)
  const [changeRequestSent, setChangeRequestSent] = useState(false)
  const [showSplash, setShowSplash] = useState(hotel.show_motivational_splash ?? true)
  const [splashSaving, setSplashSaving] = useState(false)
  // Visualizzazione importi (IVA) — preferenza del tenant, salvataggio autonomo.
  const [vatMode, setVatMode] = useState<"included" | "excluded">(
    hotel.revenue_vat_mode === "excluded" ? "excluded" : "included",
  )
  const [vatRate, setVatRate] = useState<string>(
    hotel.accommodation_vat_rate != null ? String(hotel.accommodation_vat_rate) : "10",
  )
  const [vatSaving, setVatSaving] = useState(false)
  const [vatSavedAt, setVatSavedAt] = useState<number | null>(null)

  // Google Places autocomplete
  const addressInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [placesLoaded, setPlacesLoaded] = useState(false)

  const [formData, setFormData] = useState({
    // Hotel fields
    name: hotel.name || "",
    address: hotel.address || "",
    city: hotel.city || "",
    province: hotel.province || "",
    cap: hotel.cap || "",
    country: hotel.country || "",
    accommodation_type: hotel.accommodation_type || "camere",
    total_rooms: hotel.total_rooms || 0,
    timezone: hotel.timezone || "Europe/Rome",
    currency: hotel.currency || "EUR",
    star_rating: hotel.star_rating || "",
    // Organization fields (read-only for non-super_admin)
    company_name: organization?.company_name || "",
    vat_number: organization?.vat_number || "",
  })

  // Load Google Places API (only for super_admin)
  useEffect(() => {
    if (!isSuperAdmin) return
    if (typeof window !== "undefined" && window.google?.maps?.places) {
      setPlacesLoaded(true)
      return
    }

    const apiKey = hotel.google_places_api_key || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""
    if (!apiKey) return // No API key available

    const script = document.createElement("script")
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=it`
    script.async = true
    script.defer = true
    script.onload = () => setPlacesLoaded(true)
    document.head.appendChild(script)

    return () => {
      // Don't remove script on unmount since it's cached
    }
  }, [isSuperAdmin, hotel.google_places_api_key])

  // Initialize autocomplete when Places is loaded and input is ready
  const initAutocomplete = useCallback(() => {
    if (!placesLoaded || !addressInputRef.current || autocompleteRef.current) return

    autocompleteRef.current = new google.maps.places.Autocomplete(addressInputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "it" },
      fields: ["address_components", "formatted_address"],
    })

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current?.getPlace()
      if (!place?.address_components) return

      let street = ""
      let streetNumber = ""
      let city = ""
      let province = ""
      let cap = ""
      let country = ""

      for (const component of place.address_components) {
        const types = component.types
        if (types.includes("route")) street = component.long_name
        if (types.includes("street_number")) streetNumber = component.long_name
        if (types.includes("locality") || types.includes("administrative_area_level_3")) city = component.long_name
        if (types.includes("administrative_area_level_2")) province = component.short_name
        if (types.includes("postal_code")) cap = component.long_name
        if (types.includes("country")) country = component.long_name
      }

      const fullAddress = streetNumber ? `${street}, ${streetNumber}` : street

      setFormData((prev) => ({
        ...prev,
        address: fullAddress,
        city: city || prev.city,
        province: province || prev.province,
        cap: cap || prev.cap,
        country: country || prev.country,
      }))
    })
  }, [placesLoaded])

  useEffect(() => {
    initAutocomplete()
  }, [initAutocomplete])

  // All structure data is locked for non-super_admin
  const isLocked = !isSuperAdmin

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return
    setIsLoading(true)

    try {
      // Update hotel (only super_admin)
      const hotelResponse = await fetch(`/api/hotels/${hotel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          address: formData.address,
          city: formData.city,
          province: formData.province,
          cap: formData.cap,
          country: formData.country,
          accommodation_type: formData.accommodation_type,
          total_rooms: formData.total_rooms,
          star_rating: formData.star_rating,
        }),
      })

      if (!hotelResponse.ok) {
        const errData = await hotelResponse.json().catch(() => ({}))
        throw new Error(errData.error || "Errore aggiornamento struttura")
      }

      // Update organization business data
      const orgResponse = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: formData.company_name,
          vat_number: formData.vat_number,
        }),
      })

      if (!orgResponse.ok) {
        const errData = await orgResponse.json().catch(() => ({}))
        throw new Error(errData.error || "Errore aggiornamento organizzazione")
      }

      router.refresh()
      alert("Impostazioni salvate con successo!")
    } catch (error: any) {
      console.error("Error saving settings:", error)
      alert(error.message || "Errore durante il salvataggio delle impostazioni")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestChange = async () => {
    if (!changeRequestMessage.trim()) return
    setChangeRequestSending(true)

    try {
      const res = await fetch(`/api/organizations/${organization.id}/request-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: changeRequestMessage }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Errore invio richiesta")
      }

      setChangeRequestSent(true)
      setChangeRequestMessage("")
    } catch (error: any) {
      alert(error.message || "Errore durante l'invio della richiesta")
    } finally {
      setChangeRequestSending(false)
    }
  }

  // Salva la preferenza IVA (mode e/o aliquota) in autonomia, come lo splash.
  const persistVat = async (payload: { revenue_vat_mode?: string; accommodation_vat_rate?: number }) => {
    setVatSaving(true)
    try {
      const res = await fetch(`/api/hotels/${hotel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Errore salvataggio")
      setVatSavedAt(Date.now())
      router.refresh()
    } catch {
      // In caso di errore ricarico i valori dal server per coerenza.
      router.refresh()
    } finally {
      setVatSaving(false)
    }
  }

  const lockedClass = "bg-muted cursor-not-allowed"

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Dati Aziendali - read-only per non-super_admin */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Dati Azienda</h3>
            {isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {isLocked && (
          <p className="text-sm text-muted-foreground">
            I dati aziendali e della struttura possono essere modificati solo dall{"'"}amministratore della piattaforma.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="company_name">Ragione Sociale</Label>
            <Input
              id="company_name"
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
            />
          </div>
          <div>
            <Label htmlFor="vat_number">Partita IVA</Label>
            <Input
              id="vat_number"
              value={formData.vat_number}
              onChange={(e) => setFormData({ ...formData, vat_number: e.target.value })}
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Dati Struttura</h3>
          {isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="name">Nome Struttura *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
            />
          </div>

          <div className="col-span-2">
            <Label htmlFor="address" className="flex items-center gap-1.5">
              Indirizzo (Via e Numero)
              {isSuperAdmin && placesLoaded && (
                <span className="text-[10px] text-emerald-600 font-normal flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  Google Places attivo
                </span>
              )}
            </Label>
            {isSuperAdmin ? (
              <Input
                ref={addressInputRef}
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Inizia a digitare l'indirizzo..."
              />
            ) : (
              <Input
                id="address"
                value={formData.address}
                disabled
                className={lockedClass}
              />
            )}
          </div>

          <div>
            <Label htmlFor="city">Citta</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
            />
          </div>

          <div>
            <Label htmlFor="province">Provincia</Label>
            <Input
              id="province"
              value={formData.province}
              onChange={(e) => setFormData({ ...formData, province: e.target.value })}
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
              placeholder="Es: FI"
              maxLength={2}
            />
          </div>

          <div>
            <Label htmlFor="cap">CAP</Label>
            <Input
              id="cap"
              value={formData.cap}
              onChange={(e) => setFormData({ ...formData, cap: e.target.value })}
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
              placeholder="Es: 50028"
              maxLength={5}
            />
          </div>

          <div>
            <Label htmlFor="country">Paese</Label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
            />
          </div>

          <div>
            <Label htmlFor="accommodation_type">Tipologia Struttura *</Label>
            {isLocked ? (
              <Input
                id="accommodation_type"
                value={ACCOMMODATION_TYPES.find(t => t.value === formData.accommodation_type)?.label || "Camere"}
                disabled
                className={lockedClass}
              />
            ) : (
              <Select
                value={formData.accommodation_type}
                onValueChange={(value) => setFormData({ ...formData, accommodation_type: value })}
              >
                <SelectTrigger id="accommodation_type">
                  <SelectValue placeholder="Seleziona tipologia" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOMMODATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label htmlFor="total_rooms">
              Numero {getAccommodationPlural(formData.accommodation_type).charAt(0).toUpperCase() + getAccommodationPlural(formData.accommodation_type).slice(1)} *
            </Label>
            <Input
              id="total_rooms"
              type="number"
              min="1"
              value={formData.total_rooms}
              onChange={(e) => setFormData({ ...formData, total_rooms: Number.parseInt(e.target.value) })}
              required
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
            />
          </div>

          <div>
            <Label htmlFor="star_rating">Classificazione (Stelle)</Label>
            <Input
              id="star_rating"
              value={formData.star_rating}
              onChange={(e) => setFormData({ ...formData, star_rating: e.target.value })}
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
              placeholder="Es: 4 stelle"
            />
          </div>

          <div>
            <Label htmlFor="currency">Valuta</Label>
            <Input
              id="currency"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
            />
          </div>

          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              disabled={isLocked}
              className={isLocked ? lockedClass : ""}
            />
          </div>
        </div>
      </div>

      {/* Pulsante richiesta modifica per non-super_admin */}
      {isLocked && (
        <Button
          type="button"
          variant="outline"
          className="text-amber-700 border-amber-300 hover:bg-amber-50"
          onClick={() => {
            setChangeRequestSent(false)
            setChangeRequestMessage("")
            setChangeRequestOpen(true)
          }}
        >
          <MessageSquareWarning className="h-4 w-4 mr-2" />
          I dati non sono corretti? Chiedi la modifica!
        </Button>
      )}

      {/* Sezione Messaggio Motivazionale */}
      <div className="space-y-4 border-t pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Messaggio Motivazionale</h3>
            <p className="text-sm text-muted-foreground">
              Mostra un messaggio AI motivazionale sui KPI ad ogni accesso alla dashboard
            </p>
          </div>
          <div className="flex items-center gap-2">
            {splashSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              checked={showSplash}
              onCheckedChange={async (checked) => {
                setShowSplash(checked)
                setSplashSaving(true)
                try {
                  const res = await fetch(`/api/hotels/${hotel.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ show_motivational_splash: checked }),
                  })
                  if (!res.ok) throw new Error("Errore salvataggio")
                } catch {
                  setShowSplash(!checked) // rollback
                } finally {
                  setSplashSaving(false)
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Sezione Visibilita KPI */}
      <div className="space-y-4 border-t pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Visibilita KPI Dashboard</h3>
            <p className="text-sm text-muted-foreground">
              Scegli quali indicatori mostrare nella dashboard di questa struttura
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="bg-transparent"
            onClick={() => setKpiDialogOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Configura KPI
          </Button>
        </div>
      </div>

      {/* Sezione Visualizzazione importi (IVA) */}
      <div className="space-y-4 border-t pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Visualizzazione importi (IVA)</h3>
            <p className="text-sm text-muted-foreground">
              Scegli se vedere tutti gli indicatori monetari della piattaforma (revenue, ADR, RevPAR, produzione…) IVA
              inclusa o IVA esclusa.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {vatSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {!vatSaving && vatSavedAt && <CheckCircle2 className="h-4 w-4 text-green-600" />}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vat_mode">Modalità importi</Label>
            <Select
              value={vatMode}
              onValueChange={(v) => {
                const mode = v === "excluded" ? "excluded" : "included"
                setVatMode(mode)
                void persistVat({ revenue_vat_mode: mode })
              }}
            >
              <SelectTrigger id="vat_mode" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="included">IVA inclusa (lordo)</SelectItem>
                <SelectItem value="excluded">IVA esclusa (netto)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="vat_rate">Aliquota IVA alloggio (%)</Label>
            <Input
              id="vat_rate"
              type="number"
              min={0}
              max={99}
              step={0.5}
              inputMode="decimal"
              value={vatRate}
              disabled={vatMode !== "excluded"}
              className={vatMode !== "excluded" ? `mt-1 ${lockedClass}` : "mt-1"}
              onChange={(e) => setVatRate(e.target.value)}
              onBlur={() => {
                const rate = Number(vatRate)
                if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
                  setVatRate(hotel.accommodation_vat_rate != null ? String(hotel.accommodation_vat_rate) : "10")
                  return
                }
                void persistVat({ accommodation_vat_rate: rate })
              }}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          L{"'"}aliquota alloggio si applica ai KPI camera (revenue, ADR, RevPAR, RevPOR). La{" "}
          <span className="font-medium">Produzione Fiscale</span> usa invece l{"'"}IVA reale per reparto rilevata dal
          gestionale; se il dato non è disponibile mostra {'"'}n/d{'"'} anziché un valore stimato.
        </p>
      </div>

      {isSuperAdmin && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva Impostazioni
          </Button>
        </div>
      )}

      <KpiTogglesDialog
        open={kpiDialogOpen}
        onOpenChange={setKpiDialogOpen}
        hotelId={hotel.id}
        hotelName={hotel.name || "Struttura"}
        readOnly={!isSuperAdmin}
      />

      {/* Dialog richiesta modifica dati */}
      <Dialog open={changeRequestOpen} onOpenChange={setChangeRequestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Richiedi Modifica Dati</DialogTitle>
            <DialogDescription>
              Descrivi quali dati devono essere modificati. La richiesta sara inviata all{"'"}amministratore della piattaforma.
            </DialogDescription>
          </DialogHeader>

          {changeRequestSent ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <p className="text-center font-medium">Richiesta inviata con successo!</p>
              <p className="text-center text-sm text-muted-foreground">
                Il team SANTADDEO la contattera al piu presto per aggiornare i dati.
              </p>
              <Button type="button" variant="outline" onClick={() => setChangeRequestOpen(false)}>
                Chiudi
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                  <p><span className="font-medium">Ragione Sociale:</span> {formData.company_name || "Non impostata"}</p>
                  <p><span className="font-medium">Partita IVA:</span> {formData.vat_number || "Non impostata"}</p>
                  <p><span className="font-medium">Nome Struttura:</span> {formData.name || "Non impostato"}</p>
                  <p><span className="font-medium">Indirizzo:</span> {formData.address || "Non impostato"}</p>
                  <p><span className="font-medium">Citta:</span> {formData.city || "Non impostata"} ({formData.province || "?"}) - {formData.cap || "?"}</p>
                </div>
                <div>
                  <Label htmlFor="change_message">Descrivi le modifiche necessarie *</Label>
                  <Textarea
                    id="change_message"
                    value={changeRequestMessage}
                    onChange={(e) => setChangeRequestMessage(e.target.value)}
                    placeholder={"Es: L'indirizzo corretto e' Via Roma 15, la citta' deve essere..."}
                    rows={4}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setChangeRequestOpen(false)}
                >
                  Annulla
                </Button>
                <Button
                  type="button"
                  onClick={handleRequestChange}
                  disabled={changeRequestSending || !changeRequestMessage.trim()}
                >
                  {changeRequestSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Invia Richiesta
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </form>
  )
}
