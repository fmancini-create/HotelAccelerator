"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileSpreadsheet,
  Wifi,
  ExternalLink,
  Search,
  Settings2,
  ArrowLeft,
  ArrowRight,
  Table2,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

// ---------- Types ----------

interface PmsProvider {
  id: string
  name: string
  code: string
  description?: string
  website?: string
}

interface SheetTab {
  name: string
  index: number
  rowCount: number
  columnCount: number
  headers: string[]
  previewRows: string[][]
}

interface DiscoverResult {
  spreadsheetId: string
  spreadsheetTitle: string
  tabs: SheetTab[]
}

// The data categories we need to map
const DATA_CATEGORIES = [
  {
    key: "production",
    label: "Produzione tariffaria",
    description: "Ricavi giornalieri, ADR, revenue per camera",
    required: true,
    fields: [
      { key: "date", label: "Data", required: true },
      { key: "room_type", label: "Tipo camera / Codice", required: false },
      { key: "revenue", label: "Ricavo / Revenue", required: true },
      { key: "adr", label: "ADR (prezzo medio)", required: false },
      { key: "revpar", label: "RevPAR", required: false },
    ],
  },
  {
    key: "availability",
    label: "Disponibilita camere",
    description: "Camere totali, disponibili, fuori servizio",
    required: false,
    fields: [
      { key: "date", label: "Data", required: true },
      { key: "room_type", label: "Tipo camera / Codice", required: false },
      { key: "total_rooms", label: "Camere totali", required: true },
      { key: "available_rooms", label: "Camere disponibili", required: false },
      { key: "out_of_service", label: "Fuori servizio", required: false },
    ],
  },
  {
    key: "rooms_sold",
    label: "Camere vendute",
    description: "Numero di camere vendute e occupancy",
    required: false,
    fields: [
      { key: "date", label: "Data", required: true },
      { key: "room_type", label: "Tipo camera / Codice", required: false },
      { key: "rooms_sold", label: "Camere vendute", required: true },
      { key: "occupancy_pct", label: "Occupancy %", required: false },
    ],
  },
  {
    key: "bookings",
    label: "Prenotazioni",
    description: "Lista prenotazioni con dettagli ospite e canale",
    required: false,
    fields: [
      { key: "booking_id", label: "ID Prenotazione", required: false },
      { key: "check_in", label: "Check-in", required: true },
      { key: "check_out", label: "Check-out", required: true },
      { key: "room_type", label: "Tipo camera", required: false },
      { key: "guest_name", label: "Nome ospite", required: false },
      { key: "channel", label: "Canale (OTA / Diretto)", required: false },
      { key: "amount", label: "Importo totale", required: false },
      { key: "nights", label: "Numero notti", required: false },
    ],
  },
  {
    key: "rates",
    label: "Tariffe / Prezzi",
    description: "Tariffario giornaliero per tipo camera",
    required: false,
    fields: [
      { key: "date", label: "Data", required: true },
      { key: "room_type", label: "Tipo camera / Codice", required: false },
      { key: "rate_name", label: "Nome tariffa", required: false },
      { key: "price", label: "Prezzo", required: true },
      { key: "min_stay", label: "Soggiorno minimo", required: false },
    ],
  },
] as const

type CategoryKey = (typeof DATA_CATEGORIES)[number]["key"]

interface CategoryMapping {
  tab: string | null
  orientation: "dates_as_rows" | "dates_as_columns"
  columns: Record<string, string> // field_key -> sheet_column_header
  skipped: boolean
}

interface PMSSetupFormProps {
  hotelId: string
  pmsProviders: PmsProvider[]
}

type WizardStep = "select-pms" | "select-mode" | "connect-sheet" | "mapping" | "review"

// ---------- Component ----------

export function PMSSetupForm({ hotelId, pmsProviders }: PMSSetupFormProps) {
  const router = useRouter()

  // Wizard navigation
  const [wizardStep, setWizardStep] = useState<WizardStep>("select-pms")

  // Step 1: PMS selection
  const [selectedPms, setSelectedPms] = useState<PmsProvider | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  // Step 2: Mode
  const [integrationMode, setIntegrationMode] = useState<"api" | "gsheets">("api")

  // Step 3: Connect sheet
  const [gsheetUrl, setGsheetUrl] = useState("")
  const [discoverResult, setDiscoverResult] = useState<DiscoverResult | null>(null)
  const [isDiscovering, setIsDiscovering] = useState(false)

  // Step 4: Mapping wizard
  const [currentCategoryIdx, setCurrentCategoryIdx] = useState(0)
  const [mappings, setMappings] = useState<Record<string, CategoryMapping>>(() => {
    const init: Record<string, CategoryMapping> = {}
    DATA_CATEGORIES.forEach((cat) => {
      init[cat.key] = { tab: null, orientation: "dates_as_rows", columns: {}, skipped: false }
    })
    return init
  })
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null)

  // API mode fields
  const [apiKey, setApiKey] = useState("")
  const [endpointUrl, setEndpointUrl] = useState("")

  // 19/05/2026: precompila endpointUrl dal catalogo globale
  // pms_providers.api_base_url quando l'utente sceglie un PMS, se non
  // ha gia' digitato un valore custom. Pattern coerente con
  // pms-config-form.tsx.
  useEffect(() => {
    if (!selectedPms?.code) return
    if (endpointUrl) return
    let cancelled = false
    fetch(`/api/settings/pms-config?pmsName=${encodeURIComponent(selectedPms.code)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data?.defaultEndpointUrl) setEndpointUrl(data.defaultEndpointUrl)
      })
      .catch((err) => console.error("[v0] Error loading provider default URL:", err))
    return () => { cancelled = true }
  }, [selectedPms?.code])

  // Common
  const [vatNumber, setVatNumber] = useState("")
  const [propertyId, setPropertyId] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const filteredProviders = pmsProviders.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // ------- Discover Sheet -------
  const handleDiscover = useCallback(async () => {
    if (!gsheetUrl) return
    setIsDiscovering(true)
    setError(null)
    setDiscoverResult(null)

    try {
      const res = await fetch("/api/gsheets/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetUrl: gsheetUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore nella connessione al foglio")

      setDiscoverResult({
        spreadsheetId: data.spreadsheetId,
        spreadsheetTitle: data.spreadsheetTitle,
        tabs: data.tabs,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore")
    } finally {
      setIsDiscovering(false)
    }
  }, [gsheetUrl])

  // ------- Mapping Helpers -------
  const currentCategory = DATA_CATEGORIES[currentCategoryIdx]
  const currentMapping = mappings[currentCategory.key]
  const selectedTab = discoverResult?.tabs.find((t) => t.name === currentMapping.tab) || null

  const updateMapping = (catKey: string, partial: Partial<CategoryMapping>) => {
    setMappings((prev) => ({
      ...prev,
      [catKey]: { ...prev[catKey], ...partial },
    }))
  }

  const updateColumnMapping = (catKey: string, fieldKey: string, sheetColumn: string) => {
    setMappings((prev) => ({
      ...prev,
      [catKey]: {
        ...prev[catKey],
        columns: { ...prev[catKey].columns, [fieldKey]: sheetColumn },
      },
    }))
  }

  // ------- Save -------
  const handleSave = async () => {
    if (!selectedPms) return
    setIsLoading(true)
    setError(null)

    try {
      const gsheetsConfig = integrationMode === "gsheets"
        ? {
            gsheets_mapping: Object.fromEntries(
              Object.entries(mappings)
                .filter(([, v]) => !v.skipped && v.tab)
                .map(([k, v]) => [k, { tab: v.tab, orientation: v.orientation, columns: v.columns }])
            ),
          }
        : null

      const spreadsheetId = discoverResult?.spreadsheetId || null

      const res = await fetch("/api/settings/pms-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          pmsName: selectedPms.code,
          integrationMode,
          apiKey: integrationMode === "api" ? apiKey || null : null,
          endpointUrl: integrationMode === "api" ? endpointUrl || null : null,
          vatNumber: vatNumber || null,
          propertyId: propertyId || null,
          isActive: true,
          gsheetSpreadsheetId: spreadsheetId,
          gsheetSpreadsheetUrl: integrationMode === "gsheets" ? gsheetUrl || null : null,
          config: gsheetsConfig,
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Errore durante il salvataggio")

      setSuccess("PMS configurato con successo! La pagina si aggiornera...")
      setTimeout(() => router.refresh(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio")
    } finally {
      setIsLoading(false)
    }
  }

  // ------- Step indicator -------
  const steps: { key: WizardStep; label: string }[] =
    integrationMode === "gsheets"
      ? [
          { key: "select-pms", label: "PMS" },
          { key: "select-mode", label: "Modalita" },
          { key: "connect-sheet", label: "Connetti" },
          { key: "mapping", label: "Mappatura" },
          { key: "review", label: "Riepilogo" },
        ]
      : [
          { key: "select-pms", label: "PMS" },
          { key: "select-mode", label: "Modalita" },
          { key: "review", label: "Riepilogo" },
        ]

  const currentStepIndex = steps.findIndex((s) => s.key === wizardStep)

  function StepIndicator() {
    return (
      <div className="flex items-center gap-1 mb-6">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center rounded-full text-xs font-semibold h-7 w-7 transition-colors ${
                i < currentStepIndex
                  ? "bg-primary text-primary-foreground"
                  : i === currentStepIndex
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < currentStepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={`text-xs hidden sm:inline ${
                i === currentStepIndex ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>
    )
  }

  // ============================
  // STEP 1: Select PMS
  // ============================
  if (wizardStep === "select-pms") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Configura il tuo PMS
          </CardTitle>
          <CardDescription>
            Seleziona il Property Management System utilizzato dalla tua struttura.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StepIndicator />

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca PMS per nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1">
            {filteredProviders.map((pms) => (
              <button
                key={pms.id}
                onClick={() => {
                  setSelectedPms(pms)
                  if (pms.code === "scidoo") setEndpointUrl("https://www.scidoo.com/api/v1")
                  setWizardStep("select-mode")
                }}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                  selectedPms?.id === pms.id ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{pms.name}</p>
                  {pms.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{pms.description}</p>
                  )}
                </div>
                {pms.website && (
                  <a
                    href={pms.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-muted-foreground hover:text-primary shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </button>
            ))}
            {filteredProviders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nessun PMS trovato per &quot;{searchTerm}&quot;
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Il tuo PMS non e in lista? Contattaci a{" "}
            <a href="mailto:supporto@santaddeo.com" className="text-primary hover:underline">
              supporto@santaddeo.com
            </a>
          </p>
        </CardContent>
      </Card>
    )
  }

  // ============================
  // STEP 2: Select Mode
  // ============================
  if (wizardStep === "select-mode") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Come vuoi collegare {selectedPms?.name}?
              </CardTitle>
              <CardDescription className="mt-1">
                Scegli la modalita di integrazione con la piattaforma.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <StepIndicator />

          <RadioGroup
            value={integrationMode}
            onValueChange={(v) => setIntegrationMode(v as "api" | "gsheets")}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <label
              htmlFor="mode-api"
              className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-5 transition-colors ${
                integrationMode === "api" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              }`}
            >
              <RadioGroupItem value="api" id="mode-api" className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-primary" />
                  <span className="font-semibold">API Diretta</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Collegamento diretto via API. Dati in tempo reale e sincronizzazione automatica.
                </p>
              </div>
            </label>

            <label
              htmlFor="mode-gsheets"
              className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-5 transition-colors ${
                integrationMode === "gsheets" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              }`}
            >
              <RadioGroupItem value="gsheets" id="mode-gsheets" className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  <span className="font-semibold">Google Sheets</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Importa dati dal foglio Google fornito dal PMS. Ti guideremo nella mappatura dei dati.
                </p>
              </div>
            </label>
          </RadioGroup>

          {/* API: show config fields + save directly */}
          {integrationMode === "api" && (
            <div className="space-y-4 pt-2">
              <div className="grid gap-2">
                <Label htmlFor="setup-apiKey">API Key</Label>
                <Input id="setup-apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={`API Key di ${selectedPms?.name}`} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="setup-endpoint">Endpoint URL</Label>
                <Input id="setup-endpoint" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="setup-vat">P.IVA (opzionale)</Label>
                  <Input id="setup-vat" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="Partita IVA" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="setup-prop">Property ID (opzionale)</Label>
                  <Input id="setup-prop" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="ID struttura" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
          )}
          {success && (
            <Alert className="border-green-200 bg-green-50 text-green-900"><CheckCircle2 className="h-4 w-4 text-green-600" /><AlertDescription>{success}</AlertDescription></Alert>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => { setWizardStep("select-pms"); setError(null) }}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Indietro
            </Button>
            {integrationMode === "api" ? (
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvataggio...</> : "Salva configurazione"}
              </Button>
            ) : (
              <Button onClick={() => setWizardStep("connect-sheet")}>
                Avanti <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ============================
  // STEP 3: Connect Google Sheet
  // ============================
  if (wizardStep === "connect-sheet") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Connetti il foglio Google di {selectedPms?.name}
          </CardTitle>
          <CardDescription>
            Incolla il link del foglio Google fornito dal tuo PMS. Il foglio deve essere condiviso con
            &quot;Chiunque con il link&quot; (permesso Visualizzatore).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StepIndicator />

          <div className="space-y-3">
            <Label htmlFor="gsheet-url" className="text-sm font-semibold">URL del foglio Google</Label>
            <div className="flex gap-2">
              <Input
                id="gsheet-url"
                value={gsheetUrl}
                onChange={(e) => setGsheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="flex-1"
              />
              <Button
                onClick={handleDiscover}
                disabled={!gsheetUrl || isDiscovering}
                className="shrink-0"
              >
                {isDiscovering ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connetti"}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
          )}

          {/* Discovery result */}
          {discoverResult && (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50 text-green-900">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <strong>{discoverResult.spreadsheetTitle}</strong> connesso!
                  Trovati {discoverResult.tabs.length} fogli.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Fogli trovati:</p>
                {discoverResult.tabs.map((tab) => (
                  <div
                    key={tab.name}
                    className="rounded-lg border p-3"
                  >
                    <button
                      type="button"
                      className="w-full flex items-center justify-between text-left"
                      onClick={() => setExpandedPreview(expandedPreview === tab.name ? null : tab.name)}
                    >
                      <div className="flex items-center gap-2">
                        <Table2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{tab.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {tab.headers.length} colonne
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        {expandedPreview === tab.name ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </div>
                    </button>

                    {expandedPreview === tab.name && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr>
                              {tab.headers.map((h, i) => (
                                <th key={i} className="border border-border px-2 py-1.5 bg-muted font-semibold text-left whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tab.previewRows.map((row, ri) => (
                              <tr key={ri}>
                                {tab.headers.map((_, ci) => (
                                  <td key={ci} className="border border-border px-2 py-1 whitespace-nowrap text-muted-foreground">
                                    {row[ci] || ""}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {tab.previewRows.length === 0 && (
                          <p className="text-xs text-muted-foreground py-2 text-center">Nessun dato</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => { setWizardStep("select-mode"); setError(null); setDiscoverResult(null) }}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Indietro
            </Button>
            <Button
              onClick={() => { setWizardStep("mapping"); setCurrentCategoryIdx(0) }}
              disabled={!discoverResult}
            >
              Inizia mappatura <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ============================
  // STEP 4: Mapping Wizard
  // ============================
  if (wizardStep === "mapping" && discoverResult) {
    const cat = currentCategory
    const mapping = currentMapping
    const isLast = currentCategoryIdx === DATA_CATEGORIES.length - 1

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Table2 className="h-5 w-5 text-primary" />
                Mappatura: {cat.label}
                {!cat.required && (
                  <Badge variant="secondary" className="text-xs font-normal">Opzionale</Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">{cat.description}</CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0">
              {currentCategoryIdx + 1} / {DATA_CATEGORIES.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <StepIndicator />

          {/* Skip toggle */}
          {!cat.required && (
            <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
              <input
                type="checkbox"
                id={`skip-${cat.key}`}
                checked={mapping.skipped}
                onChange={(e) => updateMapping(cat.key, { skipped: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor={`skip-${cat.key}`} className="text-sm">
                Questo foglio non contiene dati di <strong>{cat.label.toLowerCase()}</strong> -- salta questo step
              </label>
            </div>
          )}

          {!mapping.skipped && (
            <>
              {/* Tab selection */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">In quale foglio si trovano i dati?</Label>
                <Select
                  value={mapping.tab || ""}
                  onValueChange={(v) => updateMapping(cat.key, { tab: v, columns: {} })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona il foglio..." />
                  </SelectTrigger>
                  <SelectContent>
                    {discoverResult.tabs.map((tab) => (
                      <SelectItem key={tab.name} value={tab.name}>
                        {tab.name} ({tab.headers.length} colonne)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Orientation */}
              {mapping.tab && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Come sono organizzati i dati?</Label>
                  <RadioGroup
                    value={mapping.orientation}
                    onValueChange={(v) =>
                      updateMapping(cat.key, { orientation: v as "dates_as_rows" | "dates_as_columns" })
                    }
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  >
                    <label
                      htmlFor={`orient-rows-${cat.key}`}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 text-sm transition-colors ${
                        mapping.orientation === "dates_as_rows" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <RadioGroupItem value="dates_as_rows" id={`orient-rows-${cat.key}`} className="mt-0.5" />
                      <div>
                        <p className="font-medium">Date nelle righe</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ogni riga e un giorno diverso. Le colonne sono i campi dati.
                        </p>
                      </div>
                    </label>
                    <label
                      htmlFor={`orient-cols-${cat.key}`}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 text-sm transition-colors ${
                        mapping.orientation === "dates_as_columns" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <RadioGroupItem value="dates_as_columns" id={`orient-cols-${cat.key}`} className="mt-0.5" />
                      <div>
                        <p className="font-medium">Date nelle colonne</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ogni colonna e un giorno diverso. Le righe sono le camere o i campi.
                        </p>
                      </div>
                    </label>
                  </RadioGroup>
                </div>
              )}

              {/* Column mapping */}
              {selectedTab && mapping.tab && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Associa le colonne ai campi</Label>
                  <p className="text-xs text-muted-foreground">
                    Per ogni campo, seleziona la colonna corrispondente nel foglio &quot;{mapping.tab}&quot;.
                  </p>

                  <div className="space-y-2">
                    {cat.fields.map((field) => (
                      <div key={field.key} className="flex items-center gap-3">
                        <div className="w-40 shrink-0">
                          <span className="text-sm">
                            {field.label}
                            {field.required && <span className="text-destructive ml-0.5">*</span>}
                          </span>
                        </div>
                        <Select
                          value={mapping.columns[field.key] || ""}
                          onValueChange={(v) => updateColumnMapping(cat.key, field.key, v === "__skip__" ? "" : v)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="-- Seleziona colonna --" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">-- Non presente --</SelectItem>
                            {selectedTab.headers.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  {/* Preview */}
                  <div className="mt-4 overflow-x-auto rounded-lg border">
                    <p className="text-xs font-semibold px-3 py-2 bg-muted border-b">
                      Anteprima: {mapping.tab}
                    </p>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          {selectedTab.headers.map((h, i) => {
                            const isMapped = Object.values(mapping.columns).includes(h)
                            return (
                              <th
                                key={i}
                                className={`border-b border-r border-border px-2 py-1.5 text-left whitespace-nowrap ${
                                  isMapped ? "bg-primary/10 text-primary font-bold" : "bg-muted font-semibold"
                                }`}
                              >
                                {h}
                                {isMapped && <span className="ml-1 text-primary">*</span>}
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTab.previewRows.slice(0, 3).map((row, ri) => (
                          <tr key={ri}>
                            {selectedTab.headers.map((h, ci) => {
                              const isMapped = Object.values(mapping.columns).includes(h)
                              return (
                                <td
                                  key={ci}
                                  className={`border-b border-r border-border px-2 py-1 whitespace-nowrap ${
                                    isMapped ? "bg-primary/5 font-medium" : "text-muted-foreground"
                                  }`}
                                >
                                  {row[ci] || ""}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => {
                if (currentCategoryIdx > 0) {
                  setCurrentCategoryIdx((i) => i - 1)
                } else {
                  setWizardStep("connect-sheet")
                }
                setError(null)
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Indietro
            </Button>

            <Button
              onClick={() => {
                if (isLast) {
                  setWizardStep("review")
                } else {
                  setCurrentCategoryIdx((i) => i + 1)
                }
              }}
            >
              {isLast ? "Riepilogo" : "Avanti"} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ============================
  // STEP 5: Review & Save
  // ============================
  if (wizardStep === "review") {
    const activeMappings = Object.entries(mappings).filter(([, v]) => !v.skipped && v.tab)

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Riepilogo configurazione
          </CardTitle>
          <CardDescription>
            Verifica la configurazione prima di salvare.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StepIndicator />

          {/* PMS info */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">PMS</span>
              <Badge>{selectedPms?.name}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Modalita</span>
              <Badge variant="secondary">
                {integrationMode === "api" ? "API Diretta" : "Google Sheets"}
              </Badge>
            </div>
            {integrationMode === "gsheets" && discoverResult && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Foglio</span>
                <span className="text-sm text-muted-foreground">{discoverResult.spreadsheetTitle}</span>
              </div>
            )}
          </div>

          {/* Mappings summary */}
          {integrationMode === "gsheets" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Mappatura dati</p>
              {activeMappings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna categoria mappata.</p>
              ) : (
                activeMappings.map(([key, m]) => {
                  const cat = DATA_CATEGORIES.find((c) => c.key === key)!
                  const mappedFields = Object.entries(m.columns).filter(([, v]) => v)
                  return (
                    <div key={key} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{cat.label}</span>
                        <Badge variant="outline" className="text-xs">
                          Foglio: {m.tab}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Orientamento: {m.orientation === "dates_as_rows" ? "date nelle righe" : "date nelle colonne"}
                      </p>
                      {mappedFields.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {mappedFields.map(([fk, col]) => {
                            const field = cat.fields.find((f) => f.key === fk)
                            return (
                              <Badge key={fk} variant="secondary" className="text-xs">
                                {field?.label || fk} = {col}
                              </Badge>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              {/* Skipped categories */}
              {Object.entries(mappings)
                .filter(([, v]) => v.skipped)
                .map(([key]) => {
                  const cat = DATA_CATEGORIES.find((c) => c.key === key)!
                  return (
                    <div key={key} className="rounded-lg border border-dashed p-3 opacity-60">
                      <span className="text-sm text-muted-foreground">{cat.label} -- saltata</span>
                    </div>
                  )
                })}
            </div>
          )}

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="review-vat">P.IVA (opzionale)</Label>
              <Input id="review-vat" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="Partita IVA" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="review-prop">Property ID (opzionale)</Label>
              <Input id="review-prop" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="ID struttura" />
            </div>
          </div>

          {error && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
          )}
          {success && (
            <Alert className="border-green-200 bg-green-50 text-green-900">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => {
                if (integrationMode === "gsheets") {
                  setWizardStep("mapping")
                  setCurrentCategoryIdx(DATA_CATEGORIES.length - 1)
                } else {
                  setWizardStep("select-mode")
                }
                setError(null)
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Indietro
            </Button>
            <Button onClick={handleSave} disabled={isLoading} size="lg">
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvataggio...</>
              ) : (
                <><CheckCircle2 className="mr-2 h-4 w-4" /> Salva configurazione PMS</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
