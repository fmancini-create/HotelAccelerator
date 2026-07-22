"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Plus, Key, Settings, FileSpreadsheet } from "lucide-react"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Lock,
  Loader2,
  RefreshCw,
  Building2,
  Shield,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

interface HotelBinding {
  id: string
  hotel_id: string
  hotel_name: string
  pms_provider_id: string
  pms_name: string
  // Codice del provider (es. "scidoo", "brig"). Usato per discriminare la UI:
  // i bindings Brig mostrano un dropdown per scegliere il sub-PMS sottostante.
  provider_code: string | null
  status: "INCOMPLETE" | "COMPLETE" | "ACTIVE" | "SUSPENDED"
  room_types_mapped: boolean
  rate_plans_mapped: boolean
  channels_mapped: boolean
  created_at: string
  activated_at?: string
  has_api_key: boolean
  api_key_masked: string | null
  vat_number: string | null
  endpoint_url: string | null
  property_id: string | null
  pms_integration_id: string | null
  // "api" = usa API Key, "gsheets" = usa solo Google Sheets (no API)
  integration_mode: "api" | "gsheets" | null
  // Solo per provider_code === "brig": il PMS reale dietro al bridge
  // (bedzzle, mews, octorate, ...). NULL per gli altri provider.
  brig_sub_pms: string | null
}

// Whitelist dei sub-PMS gestiti da Brig — coerente con il CHECK constraint DB
// e con `pms_providers.api_extra_config.supported_sub_pms` per il provider Brig.
// AGGIORNAMENTO 13/07/2026: "slope" rimosso — ora ha un connettore NATIVO
// (provider code='slope', Partner API v1), non passa piu' dal bridge BRiG.
const BRIG_SUB_PMS_OPTIONS: { value: string; label: string }[] = [
  { value: "bedzzle", label: "Bedzzle" },
  { value: "5stelle", label: "5stelle" },
  { value: "cloudbeds", label: "Cloudbeds" },
  { value: "hotelcube", label: "HotelCube" },
  { value: "mews", label: "Mews" },
  { value: "octorate", label: "Octorate" },
  { value: "opera", label: "Opera" },
  { value: "passepartout", label: "Passepartout" },
  { value: "zak", label: "Zak" },
  { value: "apaleo", label: "Apaleo" },
]

interface MappingVersion {
  id: string
  pms_provider_id: string
  pms_name: string
  version_number: number
  status: "DRAFT" | "VALIDATED" | "LOCKED" | "DEPRECATED"
  completeness_score: number
  mappings_count: number
  created_at: string
  validated_at?: string
  locked_at?: string
}

interface Props {
  selectedProviderId: string
  pmsProviders: Array<{ id: string; name: string; code: string }>
}

export function HotelBindingsManager({ selectedProviderId, pmsProviders }: Props) {
  const [bindings, setBindings] = useState<HotelBinding[]>([])
  const [versions, setVersions] = useState<MappingVersion[]>([])
  const [availableHotels, setAvailableHotels] = useState<Array<{ id: string; name: string }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showAddBindingDialog, setShowAddBindingDialog] = useState(false)
  const [selectedHotelId, setSelectedHotelId] = useState<string>("")
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: "validate" | "lock" | "activate" | "deactivate" | null
    targetId: string
    targetName: string
  }>({ open: false, type: null, targetId: "", targetName: "" })

  const [apiKeyDialog, setApiKeyDialog] = useState<{
    open: boolean
    binding: HotelBinding | null
  }>({ open: false, binding: null })
  const [apiKeyForm, setApiKeyForm] = useState({
    api_key: "",
    vat_number: "",
    endpoint_url: "",
    property_id: "",
    brig_sub_pms: "", // popolato solo per binding Brig
  })
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)

  const selectedProvider = pmsProviders.find((p) => p.id === selectedProviderId)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [bindingsRes, versionsRes, hotelsRes] = await Promise.all([
        fetch(`/api/superadmin/hotel-bindings?provider_id=${selectedProviderId}`),
        fetch(`/api/superadmin/mapping-versions?provider_id=${selectedProviderId}`),
        fetch(`/api/superadmin/available-hotels?pms_provider_id=${selectedProviderId}`),
      ])

      if (bindingsRes.ok) {
        const data = await bindingsRes.json()
        setBindings(data.bindings || [])
      }

      if (versionsRes.ok) {
        const data = await versionsRes.json()
        setVersions(data.versions || [])
      }

      if (hotelsRes.ok) {
        const data = await hotelsRes.json()
        setAvailableHotels(data.hotels || [])
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (selectedProviderId) {
      fetchData()
    }
  }, [selectedProviderId])

  const getBindingStatusBadge = (status: HotelBinding["status"]) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge className="bg-green-600 text-white">
            <Zap className="h-3 w-3 mr-1" /> Attivo
          </Badge>
        )
      case "COMPLETE":
        return (
          <Badge className="bg-blue-600 text-white">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Completo
          </Badge>
        )
      case "SUSPENDED":
        return (
          <Badge variant="outline" className="text-orange-600 border-orange-600">
            <XCircle className="h-3 w-3 mr-1" /> Sospeso
          </Badge>
        )
      case "INCOMPLETE":
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <AlertTriangle className="h-3 w-3 mr-1" /> Incompleto
          </Badge>
        )
    }
  }

  const getVersionStatusBadge = (status: MappingVersion["status"]) => {
    switch (status) {
      case "LOCKED":
        return (
          <Badge className="bg-purple-600 text-white">
            <Lock className="h-3 w-3 mr-1" /> Bloccata
          </Badge>
        )
      case "VALIDATED":
        return (
          <Badge className="bg-green-600 text-white">
            <Shield className="h-3 w-3 mr-1" /> Validata
          </Badge>
        )
      case "DRAFT":
        return (
          <Badge variant="outline">
            <AlertTriangle className="h-3 w-3 mr-1" /> Bozza
          </Badge>
        )
      case "DEPRECATED":
        return (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" /> Deprecata
          </Badge>
        )
    }
  }

  const handleUpdateBindingField = async (bindingId: string, field: string, value: boolean) => {
    try {
      const res = await fetch(`/api/superadmin/hotel-bindings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ binding_id: bindingId, [field]: value }),
      })

      if (!res.ok) {
        throw new Error("Errore nell'aggiornamento")
      }

      // Update local state
      setBindings((prev) =>
        prev.map((b) => {
          if (b.id === bindingId) {
            const updated = { ...b, [field]: value }
            // Auto-set status to COMPLETE if all mapped
            if (updated.room_types_mapped && updated.rate_plans_mapped) {
              updated.status = "COMPLETE"
            } else {
              updated.status = "INCOMPLETE"
            }
            return updated
          }
          return b
        }),
      )

      toast.success("Aggiornato!")
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const openApiKeyDialog = (binding: HotelBinding) => {
    // Per Brig: l'endpoint è centrale (BRIG_BASE_URL env), non per-hotel.
    // Per Scidoo: si pre-popola con l'endpoint di default Scidoo.
    const isBrig = binding.provider_code === "brig"
    const defaultEndpoint = isBrig ? "" : "https://www.scidoo.com/api/v1"
    setApiKeyForm({
      api_key: "",
      vat_number: binding.vat_number || "",
      endpoint_url: binding.endpoint_url || defaultEndpoint,
      property_id: binding.property_id || "",
      brig_sub_pms: binding.brig_sub_pms || "",
    })
    setApiKeyDialog({ open: true, binding })
  }

  const handleSaveApiKey = async () => {
    console.log("[v0] handleSaveApiKey called", { binding: apiKeyDialog.binding, form: apiKeyForm })
    if (!apiKeyDialog.binding) {
      console.log("[v0] handleSaveApiKey - no binding, returning early")
      return
    }
    setIsSavingApiKey(true)
    try {
      const providerCode = pmsProviders.find((p) => p.id === selectedProviderId)?.code || "scidoo"
      const payload: Record<string, any> = {
        hotel_id: apiKeyDialog.binding.hotel_id,
        pms_name: providerCode,
      }
      // Only send api_key if user typed something (don't overwrite with empty)
      if (apiKeyForm.api_key.trim()) payload.api_key = apiKeyForm.api_key.trim()
      if (apiKeyForm.vat_number.trim()) payload.vat_number = apiKeyForm.vat_number.trim()
      if (apiKeyForm.endpoint_url.trim()) payload.endpoint_url = apiKeyForm.endpoint_url.trim()
      if (apiKeyForm.property_id.trim()) payload.property_id = apiKeyForm.property_id.trim()

      console.log("[v0] handleSaveApiKey - sending payload:", payload)
      const res = await fetch("/api/superadmin/hotel-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      console.log("[v0] handleSaveApiKey - response status:", res.status)

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Errore nel salvataggio")
      }

      // Per binding Brig: persisti il sub-PMS sulla riga hotel_bindings.
      // È una colonna del binding (non dell'integration) perché identifica il PMS
      // sottostante fisicamente a quell'hotel, non la credenziale.
      if (apiKeyDialog.binding.provider_code === "brig") {
        const subPmsRes = await fetch("/api/superadmin/hotel-bindings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            binding_id: apiKeyDialog.binding.id,
            brig_sub_pms: apiKeyForm.brig_sub_pms || "",
          }),
        })
        if (!subPmsRes.ok) {
          const err = await subPmsRes.json()
          throw new Error(err.error || "Sub-PMS non salvato")
        }
      }

      toast.success(`Credenziali API salvate per ${apiKeyDialog.binding.hotel_name}`)
      setApiKeyDialog({ open: false, binding: null })
      fetchData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSavingApiKey(false)
    }
  }

  const handleMarkComplete = async (bindingId: string) => {
    try {
      const res = await fetch(`/api/superadmin/hotel-bindings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ binding_id: bindingId, status: "COMPLETE" }),
      })

      if (!res.ok) {
        throw new Error("Errore nell'aggiornamento")
      }

      fetchData()
      toast.success("Binding marcato come completo!")
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleValidateVersion = async (versionId: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/superadmin/mapping-versions/${versionId}/validate`, {
        method: "POST",
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || "Errore nella validazione")
      }

      toast.success("Mappatura validata con successo!")
      fetchData()
    } catch (error: any) {
      toast.error(error.message || "Errore nella validazione")
    } finally {
      setIsLoading(false)
      setConfirmDialog({ open: false, type: null, targetId: "", targetName: "" })
    }
  }

  const handleLockVersion = async (versionId: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/superadmin/mapping-versions/${versionId}/lock`, {
        method: "POST",
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || "Errore nel blocco")
      }

      toast.success("Mappatura bloccata! Non può più essere modificata.")
      fetchData()
    } catch (error: any) {
      toast.error(error.message || "Errore nel blocco")
    } finally {
      setIsLoading(false)
      setConfirmDialog({ open: false, type: null, targetId: "", targetName: "" })
    }
  }

  const handleActivateBinding = async (bindingId: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/superadmin/hotel-bindings/${bindingId}/activate`, {
        method: "POST",
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || "Errore nell'attivazione")
      }

      toast.success("Binding attivato! ETL ora abilitato per questa struttura.")
      fetchData()
    } catch (error: any) {
      toast.error(error.message || "Errore nell'attivazione")
    } finally {
      setIsLoading(false)
      setConfirmDialog({ open: false, type: null, targetId: "", targetName: "" })
    }
  }

  const handleDeactivateBinding = async (bindingId: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/superadmin/hotel-bindings/${bindingId}/deactivate`, {
        method: "POST",
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || "Errore nella disattivazione")
      }

      toast.success("Binding disattivato! ETL sospeso per questa struttura.")
      fetchData()
    } catch (error: any) {
      toast.error(error.message || "Errore nella disattivazione")
    } finally {
      setIsLoading(false)
      setConfirmDialog({ open: false, type: null, targetId: "", targetName: "" })
    }
  }

  const handleTestEtl = async (hotelId: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/superadmin/test-etl?hotel_id=${hotelId}`)
      const data = await res.json()

      if (data.can_run) {
        const modeLabel = data.integration_mode === "gsheets" ? "Google Sheets" : "API"
        const ping = data.pms_ping
        let pingLabel = ""
        if (ping?.ok && ping.provider) {
          const count = (ping.sample as any)?.roomTypesCount
          pingLabel =
            typeof count === "number"
              ? ` - ${ping.provider.toUpperCase()} OK (${count} room types)`
              : ` - ${ping.provider.toUpperCase()} OK`
        }
        toast.success(
          `ETL OK! Modalita: ${modeLabel}, Binding: ${data.binding_status || "ACTIVE"}${pingLabel}`,
          { duration: 6000 },
        )
      } else {
        const blockers = data.blockers || []
        if (blockers.length > 0) {
          // Mostra ogni blocker separatamente per chiarezza
          blockers.forEach((b: any) => {
            toast.error(b.message || b.code, { duration: 8000 })
          })
        } else {
          toast.error("ETL bloccato: motivo sconosciuto")
        }
      }
    } catch (error) {
      toast.error("Errore nella connessione al server per il test ETL")
    } finally {
      setIsLoading(false)
    }
  }

  // Check if any version is validated/locked
  const hasValidatedVersion = versions.some((v) => v.status === "VALIDATED" || v.status === "LOCKED")

  const handleCreateBinding = async () => {
    if (!selectedHotelId) {
      toast.error("Seleziona un hotel")
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch("/api/superadmin/hotel-bindings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: selectedHotelId,
          pms_provider_id: selectedProviderId,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Errore nella creazione")
      }

      toast.success("Binding creato con successo!")
      setShowAddBindingDialog(false)
      setSelectedHotelId("")
      fetchData()
    } catch (error: any) {
      toast.error(error.message || "Errore nella creazione")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateVersion = async () => {
    if (!selectedProviderId) return
    const existingDraft = versions.find((v) => v.status === "DRAFT")
    if (existingDraft) {
      toast.error(
        `Esiste gia' una versione DRAFT (v${existingDraft.version_number}). Validala o eliminala prima di crearne una nuova.`,
      )
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch("/api/superadmin/mapping-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pms_provider_id: selectedProviderId }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Errore nella creazione della versione")
      }
      toast.success("Versione DRAFT creata. Ora popola le mappature e validala.")
      fetchData()
    } catch (error: any) {
      toast.error(error.message || "Errore nella creazione della versione")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Gestione Binding e Versioni</h2>
          <p className="text-sm text-muted-foreground">
            Controlla lo stato dei binding hotel e delle versioni mappatura per{" "}
            {selectedProvider?.name || "il PMS selezionato"}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {/* Versioni Mappatura */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Versioni Mappatura PMS
              </CardTitle>
              <CardDescription>
                La mappatura deve essere VALIDATA o BLOCCATA per permettere l'ETL. La validazione richiede 100% di
                completezza.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={handleCreateVersion}
              disabled={isLoading || !selectedProviderId || versions.some((v) => v.status === "DRAFT")}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuova Versione
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Nessuna versione mappatura</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  Per questo PMS non esiste ancora alcuna versione di mappatura. L'ETL e l'attivazione dei binding
                  sono bloccati finche' non c'e' una versione VALIDATED o LOCKED.
                </p>
                <Button size="sm" onClick={handleCreateVersion} disabled={isLoading || !selectedProviderId}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crea prima versione (DRAFT)
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Versione</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Mappature</TableHead>
                  <TableHead>Completezza</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell className="font-mono font-bold">v{version.version_number}</TableCell>
                    <TableCell>{getVersionStatusBadge(version.status)}</TableCell>
                    <TableCell>{version.mappings_count} mappature</TableCell>
                    <TableCell>
                      <span
                        className={version.completeness_score >= 100 ? "text-green-600 font-bold" : "text-yellow-600"}
                      >
                        {version.completeness_score}%
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {version.locked_at
                        ? `Bloccata: ${new Date(version.locked_at).toLocaleDateString("it-IT")}`
                        : version.validated_at
                          ? `Validata: ${new Date(version.validated_at).toLocaleDateString("it-IT")}`
                          : `Creata: ${new Date(version.created_at).toLocaleDateString("it-IT")}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {version.status === "DRAFT" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setConfirmDialog({
                                open: true,
                                type: "validate",
                                targetId: version.id,
                                targetName: `v${version.version_number}`,
                              })
                            }
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Valida
                          </Button>
                        )}
                        {version.status === "VALIDATED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setConfirmDialog({
                                open: true,
                                type: "lock",
                                targetId: version.id,
                                targetName: `v${version.version_number}`,
                              })
                            }
                          >
                            <Lock className="h-4 w-4 mr-1" />
                            Blocca
                          </Button>
                        )}
                        {(version.status === "VALIDATED" || version.status === "LOCKED") && (
                          <Badge variant="secondary" className="ml-2">
                            ETL OK
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Binding Hotel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Binding Hotel
              </CardTitle>
              <CardDescription>
                Segna room_types e rate_plans come mappati, poi attiva il binding per abilitare l'ETL.
                {!hasValidatedVersion && (
                  <span className="text-destructive ml-1">(Richiede prima una mappatura VALIDATA)</span>
                )}
              </CardDescription>
            </div>
            {availableHotels.length > 0 && (
              <Button onClick={() => setShowAddBindingDialog(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Aggiungi Hotel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {bindings.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Nessun binding hotel</AlertTitle>
              <AlertDescription>Non ci sono binding configurati per questo PMS.</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead>Sub-PMS</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-center">Room Types</TableHead>
                  <TableHead className="text-center">Rate Plans</TableHead>
                  <TableHead className="text-center">Channels</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bindings.map((binding) => (
                  <TableRow key={binding.id}>
                    <TableCell className="font-medium">{binding.hotel_name}</TableCell>
                    <TableCell>
                      {binding.integration_mode === "gsheets" ? (
                        // Struttura che usa Google Sheets - non richiede API Key
                        <Badge className="bg-blue-100 text-blue-800 text-xs">
                          <FileSpreadsheet className="h-3 w-3 mr-1" />
                          Google Sheets
                        </Badge>
                      ) : binding.has_api_key ? (
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-green-100 text-green-800 font-mono text-xs">
                            <Key className="h-3 w-3 mr-1" />
                            {binding.api_key_masked}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => openApiKeyDialog(binding)}
                            title="Modifica credenziali API"
                          >
                            <Settings className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-orange-600 border-orange-300 bg-transparent hover:bg-orange-50"
                          onClick={() => openApiKeyDialog(binding)}
                        >
                          <Key className="h-3 w-3 mr-1" />
                          Configura
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {binding.provider_code === "brig" ? (
                        binding.brig_sub_pms ? (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {BRIG_SUB_PMS_OPTIONS.find((o) => o.value === binding.brig_sub_pms)?.label ||
                              binding.brig_sub_pms}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">— non impostato —</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{getBindingStatusBadge(binding.status)}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={binding.room_types_mapped}
                        onCheckedChange={(checked) =>
                          handleUpdateBindingField(binding.id, "room_types_mapped", !!checked)
                        }
                        disabled={false}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={binding.rate_plans_mapped}
                        onCheckedChange={(checked) =>
                          handleUpdateBindingField(binding.id, "rate_plans_mapped", !!checked)
                        }
                        disabled={false}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={binding.channels_mapped}
                        onCheckedChange={(checked) =>
                          handleUpdateBindingField(binding.id, "channels_mapped", !!checked)
                        }
                        disabled={false}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-transparent hover:bg-blue-50"
                          onClick={() => handleTestEtl(binding.hotel_id)}
                          title="Test ETL"
                          disabled={isLoading || !binding.hotel_id}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Test
                        </Button>
                        {binding.status === "INCOMPLETE" && binding.room_types_mapped && binding.rate_plans_mapped && (
                          <Button size="sm" variant="outline" onClick={() => handleMarkComplete(binding.id)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Completa
                          </Button>
                        )}
                        {(binding.status === "COMPLETE" || binding.status === "SUSPENDED") && (
                          <>
                            {!hasValidatedVersion ? (
                              // Non c'e nessuna versione VALIDATED o LOCKED
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-muted-foreground"
                                disabled
                                title="Prima valida la mappatura (Room Types, Rate Plans)"
                              >
                                <Shield className="h-4 w-4 mr-1" />
                                Richiede Mappatura
                              </Button>
                            ) : binding.integration_mode === "gsheets" || binding.has_api_key ? (
                              // Puo attivare: GSheets non richiede API key, oppure ha gia API key
                              <Button
                                size="sm"
                                onClick={() =>
                                  setConfirmDialog({
                                    open: true,
                                    type: "activate",
                                    targetId: binding.id,
                                    targetName: binding.hotel_name,
                                  })
                                }
                              >
                                <Zap className="h-4 w-4 mr-1" />
                                Attiva
                              </Button>
                            ) : (
                              // Struttura API senza API key configurata
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-muted-foreground"
                                disabled
                                title="Configura prima le credenziali API per attivare"
                              >
                                <Key className="h-4 w-4 mr-1" />
                                Richiede API Key
                              </Button>
                            )}
                          </>
                        )}
                        {binding.status === "ACTIVE" && (
                          <>
                            <Badge className="bg-green-600 text-white">ETL Abilitato</Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-orange-600 border-orange-600 hover:bg-orange-50 bg-transparent"
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  type: "deactivate",
                                  targetId: binding.id,
                                  targetName: binding.hotel_name,
                                })
                              }
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Disattiva
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.type === "validate" && "Conferma Validazione"}
              {confirmDialog.type === "lock" && "Conferma Blocco"}
              {confirmDialog.type === "activate" && "Conferma Attivazione"}
              {confirmDialog.type === "deactivate" && "Conferma Disattivazione"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.type === "validate" && (
                <>
                  Stai per validare la mappatura <strong>{confirmDialog.targetName}</strong>. Richiede 100% di
                  completezza (8 entity types mappati).
                </>
              )}
              {confirmDialog.type === "lock" && (
                <>
                  Stai per bloccare la mappatura <strong>{confirmDialog.targetName}</strong>.
                  <span className="text-destructive font-semibold"> Questa azione è IRREVERSIBILE.</span>
                </>
              )}
              {confirmDialog.type === "activate" && (
                <>
                  Stai per attivare il binding per <strong>{confirmDialog.targetName}</strong>. L'ETL sarà abilitato per
                  questa struttura.
                </>
              )}
              {confirmDialog.type === "deactivate" && (
                <>
                  Stai per disattivare il binding per <strong>{confirmDialog.targetName}</strong>.
                  <span className="text-orange-600 font-semibold"> L'ETL sarà sospeso per questa struttura.</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, type: null, targetId: "", targetName: "" })}
            >
              Annulla
            </Button>
            <Button
              variant={confirmDialog.type === "lock" || confirmDialog.type === "deactivate" ? "destructive" : "default"}
              onClick={() => {
                if (confirmDialog.type === "validate") handleValidateVersion(confirmDialog.targetId)
                if (confirmDialog.type === "lock") handleLockVersion(confirmDialog.targetId)
                if (confirmDialog.type === "activate") handleActivateBinding(confirmDialog.targetId)
                if (confirmDialog.type === "deactivate") handleDeactivateBinding(confirmDialog.targetId)
              }}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Key Config Dialog */}
      <Dialog open={apiKeyDialog.open} onOpenChange={(open) => setApiKeyDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Credenziali API - {apiKeyDialog.binding?.hotel_name}
            </DialogTitle>
            <DialogDescription>
              Inserisci la chiave API e i dati specifici per questa struttura.
              {apiKeyDialog.binding?.has_api_key && (
                <span className="block mt-1 text-green-600">
                  Chiave API gia configurata. Lascia il campo vuoto per mantenere quella attuale.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="hotel-api-key">API Key</Label>
              <Input
                id="hotel-api-key"
                type="password"
                value={apiKeyForm.api_key}
                onChange={(e) => setApiKeyForm({ ...apiKeyForm, api_key: e.target.value })}
                placeholder={apiKeyDialog.binding?.has_api_key ? "Lascia vuoto per mantenere" : "Inserisci la chiave API"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotel-vat">P.IVA Struttura</Label>
              <Input
                id="hotel-vat"
                value={apiKeyForm.vat_number}
                onChange={(e) => setApiKeyForm({ ...apiKeyForm, vat_number: e.target.value })}
                placeholder="Es. 05194480488"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotel-endpoint">Endpoint URL</Label>
              <Input
                id="hotel-endpoint"
                value={apiKeyForm.endpoint_url}
                onChange={(e) => setApiKeyForm({ ...apiKeyForm, endpoint_url: e.target.value })}
                placeholder="https://www.scidoo.com/api/v1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotel-property-id">
                {apiKeyDialog.binding?.provider_code === "brig" ? "Structure ID (Brig)" : "Property ID (opzionale)"}
              </Label>
              <Input
                id="hotel-property-id"
                value={apiKeyForm.property_id}
                onChange={(e) => setApiKeyForm({ ...apiKeyForm, property_id: e.target.value })}
                placeholder={
                  apiKeyDialog.binding?.provider_code === "brig"
                    ? "es. 66f280ae0396d95e07cccda9 (24 char)"
                    : "ID struttura nel PMS"
                }
              />
            </div>
            {apiKeyDialog.binding?.provider_code === "brig" && (
              <div className="space-y-2">
                <Label htmlFor="hotel-brig-sub-pms">PMS sottostante (via Brig)</Label>
                <Select
                  value={apiKeyForm.brig_sub_pms || "__none__"}
                  onValueChange={(v) =>
                    setApiKeyForm({ ...apiKeyForm, brig_sub_pms: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger id="hotel-brig-sub-pms">
                    <SelectValue placeholder="Seleziona il PMS reale dietro Brig" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— non specificato —</SelectItem>
                    {BRIG_SUB_PMS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Indica quale PMS reale è dietro al bridge Brig per questa struttura. Utile per analytics
                  e per debug rapido.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => setApiKeyDialog({ open: false, binding: null })}
            >
              Annulla
            </Button>
            <Button onClick={handleSaveApiKey} disabled={isSavingApiKey}>
              {isSavingApiKey && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva Credenziali
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Binding Dialog */}
      <Dialog open={showAddBindingDialog} onOpenChange={setShowAddBindingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi Binding Hotel</DialogTitle>
            <DialogDescription>
              Seleziona un hotel da collegare al PMS{" "}
              {pmsProviders.find((p) => p.id === selectedProviderId)?.name || "selezionato"}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="hotel-select">Hotel</Label>
            <Select value={selectedHotelId} onValueChange={setSelectedHotelId}>
              <SelectTrigger id="hotel-select" className="mt-2">
                <SelectValue placeholder="Seleziona un hotel..." />
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
              <p className="text-sm text-muted-foreground mt-2">
                Tutti gli hotel sono già collegati a questo PMS.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddBindingDialog(false)
                setSelectedHotelId("")
              }}
            >
              Annulla
            </Button>
            <Button onClick={handleCreateBinding} disabled={isLoading || !selectedHotelId}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crea Binding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
