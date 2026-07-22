"use client"

import type React from "react"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Plus,
  Settings,
  Trash2,
  Upload,
  FileText,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  User,
  Globe,
  RefreshCw,
  Eye,
  EyeOff,
  Webhook,
  History,
  Database,
  Clock,
  Archive,
  Sparkles,
  FileCode,
  Zap,
  Building2,
  Users,
  BedDouble,
  Calendar,
  DollarSign,
  Package,
  Tag,
  ImageIcon,
  Receipt,
  ArrowRight,
  Save,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PMS_CATALOG, getFacilityStars, type PmsCatalogEntry } from "@/lib/pms-catalog" // Added for catalog PMS

interface EndpointTestResult {
  endpoint_path: string
  entity: string
  description: string
  is_critical: boolean
  is_available: boolean
  status: "success" | "error" | "not_tested"
  error?: string
  sample_count?: number
}

interface ApiDiscoveryResult {
  success: boolean
  message: string
  accountInfo?: {
    name: string
    email?: string
    properties?: { id: number; name: string }[]
  }
  availableEndpoints: string[]
  unavailableEndpoints: string[]
  entities: string[]
  criticalMissing: string[]
  endpointResults?: EndpointTestResult[]
  capabilities: {
    hasWebhook: boolean
    hasVersioning: boolean
    hasDeltaSync: boolean
    hasLastModified: boolean
    requiresFullHistorization: boolean
    syncStrategy: "full" | "delta" | "webhook"
  }
}

interface PmsDocument {
  id: string
  name: string
  description: string | null
  file_url: string
  file_type: string
  file_size: number | null
  document_type: string
  created_at: string
  uploaded_at?: string // Added for consistency with updates
  content?: string // Added for consistency with updates
  content_text?: string // Added for consistency with updates
  metadata?: {
    // Added for consistency with updates
    parsed_endpoints: Array<{ path: string; method: string; entity?: string }>
    parsed_capabilities: Partial<ApiDiscoveryResult["capabilities"]>
  }
}

interface PmsProvider {
  id: string
  name: string
  code: string
  description: string | null
  logo_url: string | null
  website: string | null
  commercial_contact_name: string | null
  commercial_contact_email: string | null
  commercial_contact_phone: string | null
  technical_contact_name: string | null
  technical_contact_email: string | null
  technical_contact_phone: string | null
  api_base_url: string | null
  api_key: string | null
  api_secret: string | null
  api_username: string | null
  api_password: string | null
  api_extra_config: Record<string, unknown>
  connection_status: "not_configured" | "configured" | "testing" | "connected" | "error"
  last_connection_test: string | null
  last_connection_error: string | null
  is_active: boolean
  created_at: string
  documents: PmsDocument[]
  has_webhook: boolean
  has_versioning: boolean
  has_delta_sync: boolean
  has_last_modified: boolean
  requires_full_historization: boolean
  sync_strategy: "full" | "delta" | "webhook"
  available_entities: string[]
}

// Define interface for parsed API documentation result
interface ParsedApiDocumentation {
  success?: boolean
  message?: string
  endpoints: Array<{ path: string; method: string; entity?: string }>
  capabilities: Partial<ApiDiscoveryResult["capabilities"]>
  entities?: string[] // Added for consistency with updates
}

const DOCUMENT_TYPES = [
  { value: "api_documentation", label: "Documentazione API" },
  { value: "integration_guide", label: "Guida Integrazione" },
  { value: "field_mapping", label: "Mappatura Campi" },
  { value: "contract", label: "Contratto" },
  { value: "other", label: "Altro" },
]

const CONNECTION_STATUS_CONFIG = {
  not_configured: { label: "Non configurato", color: "bg-gray-100 text-gray-800", icon: AlertCircle },
  configured: { label: "Configurato", color: "bg-blue-100 text-blue-800", icon: Settings },
  testing: { label: "Test in corso...", color: "bg-yellow-100 text-yellow-800", icon: Loader2 },
  connected: { label: "Connesso", color: "bg-green-100 text-green-800", icon: CheckCircle },
  error: { label: "Errore", color: "bg-red-100 text-red-800", icon: XCircle },
}

const SCIDOO_ENTITIES = {
  "Struttura & Account": ["account", "property"],
  "Clienti & Persone": ["customer", "guest", "guest_type"],
  Alloggi: [
    "room_type",
    "room",
    "room_status",
    "room_availability",
    "room_availability_detail",
    "list_date_type_room",
    "list_date_room",
    "bed_preference",
  ],
  Prenotazioni: [
    "reservation",
    "booking_room",
    "booking_rate",
    "booking_day_price",
    "booking_price_detail",
    "booking_extra",
    "booking_payment",
    "booking_note",
    "booking_agency",
    "booking_origin",
    "booking_group",
  ],
  "Prezzi & Tariffe": [
    "rate",
    "arrangement",
    "day_price",
    "price_detail",
    "due_amount",
    "cancellation_policy",
    "deposit_policy",
  ],
  Preventivi: ["estimate", "proposal"],
  "Canali / Origini": ["agency", "origin"],
  "Servizi & Extra": [
    "service",
    "offer",
    "supplement",
    "service_composition",
    "service_availability",
    "service_time_slot",
  ],
  Metadati: ["tag", "category_group", "info"],
  Media: ["album", "video"],
  Fiscale: ["tax_document", "fee", "account_revenue", "suspended_invoice"],
}

const CRITICAL_ENTITIES = [
  "reservation",
  "room",
  "room_type",
  "room_availability",
  "rate",
  "day_price",
  "customer",
  "guest",
  "booking_extra",
  "booking_payment",
  "account",
  "property",
]

interface Props {
  initialProviders?: PmsProvider[]
  onPmsSelect?: (provider: PmsProvider) => void
  onProviderUpdate?: (provider: PmsProvider) => void // New callback to notify parent of updates
  onNavigateToMapping?: (entityType: string) => void // Callback to navigate to mapping tab
}

export function PmsProvidersManager({ initialProviders, onPmsSelect, onProviderUpdate, onNavigateToMapping }: Props) {
  const [providers, setProviders] = useState<PmsProvider[]>(initialProviders || [])
  const [loading, setLoading] = useState(!initialProviders)
  const [selectedProvider, setSelectedProvider] = useState<PmsProvider | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isNewProvider, setIsNewProvider] = useState(false)
  const [activeTab, setActiveTab] = useState("info")
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<ApiDiscoveryResult | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showApiSecret, setShowApiSecret] = useState(false)
  const [apiDocText, setApiDocText] = useState("") // Renamed from apiDocsText to apiDocText
  const [isParsingDoc, setIsParsingDoc] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [discoveryLoading, setDiscoveryLoading] = useState(false) // State for file upload/parsing loading
  const [discoveryResult, setDiscoveryResult] = useState<ParsedApiDocumentation | null>(null) // State for discovery results

  const [savedDocuments, setSavedDocuments] = useState<PmsDocument[]>([]) // Updated type
  const [loadingDocuments, setLoadingDocuments] = useState(false)

  // Save state for the standalone "Salva credenziali" button in the API tab.
  // Without it, users had to click the global "Salva" in the dialog footer
  // (or "Testa Connessione") to persist API credentials. Easy to lose data.
  const [isSavingCredentials, setIsSavingCredentials] = useState(false)
  const [credentialsSaveResult, setCredentialsSaveResult] = useState<
    { ok: boolean; message: string } | null
  >(null)

  // Save state for the document upload in the Info tab. Previously the upload
  // only parsed the PDF in memory but never persisted it; now we auto-save.
  const [isSavingDocument, setIsSavingDocument] = useState(false)
  const [documentSaveResult, setDocumentSaveResult] = useState<
    { ok: boolean; message: string } | null
  >(null)

  const [capabilitiesChanged, setCapabilitiesChanged] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [selectedCatalogPms, setSelectedCatalogPms] = useState<PmsCatalogEntry | null>(null)

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    website: "",
    commercial_contact_name: "",
    commercial_contact_email: "",
    commercial_contact_phone: "",
    technical_contact_name: "",
    technical_contact_email: "",
    technical_contact_phone: "",
    api_base_url: "",
    api_key: "",
    api_secret: "",
    api_username: "",
    api_password: "",
    has_webhook: false,
    has_versioning: false,
    has_delta_sync: false,
    has_last_modified: false,
    requires_full_historization: true,
    sync_strategy: "full" as "full" | "delta" | "webhook",
    available_entities: [] as string[], // Aggiunto per gestire le entità disponibili
  })

  useEffect(() => {
    if (initialProviders === undefined || initialProviders === null) {
      loadProviders()
    }
  }, [initialProviders])

  useEffect(() => {
    if (selectedProvider?.id) {
      loadSavedDocuments(selectedProvider.id)
    }
  }, [selectedProvider?.id])

  const loadSavedDocuments = async (providerId: string) => {
    setLoadingDocuments(true)
    try {
      const response = await fetch(`/api/superadmin/connectors/pms-providers/documents?providerId=${providerId}`)
      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Documents loaded:", data.documents?.length || 0)
        setSavedDocuments(data.documents || [])
      } else {
        console.log("[v0] Failed to load documents:", response.status)
      }
    } catch (error) {
      console.error("[v0] Error loading documents:", error)
    } finally {
      setLoadingDocuments(false)
    }
  }

  const loadProviders = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/superadmin/connectors/pms-providers")
      const data = await response.json()
      if (data.providers) {
        setProviders(data.providers)
      }
    } catch (error) {
      console.error("Error loading providers:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectCatalogPms = (pmsCode: string) => {
    const pms = PMS_CATALOG.find((p) => p.code === pmsCode)
    if (pms) {
      setSelectedCatalogPms(pms)
      setFormData((prev) => ({
        ...prev,
        name: pms.name,
        code: pms.code,
        description: pms.notes || "",
        website: pms.docUrl || "",
      }))
    }
  }

  const handleOpenDialog = (provider?: PmsProvider) => {
    if (provider) {
      setSelectedProvider(provider)
      setIsNewProvider(false)
      setFormData({
        name: provider.name,
        code: provider.code,
        description: provider.description || "",
        website: provider.website || "",
        commercial_contact_name: provider.commercial_contact_name || "",
        commercial_contact_email: provider.commercial_contact_email || "",
        commercial_contact_phone: provider.commercial_contact_phone || "",
        technical_contact_name: provider.technical_contact_name || "",
        technical_contact_email: provider.technical_contact_email || "",
        technical_contact_phone: provider.technical_contact_phone || "",
        api_base_url: provider.api_base_url || "",
        api_key: provider.api_key || "",
        api_secret: provider.api_secret || "",
        api_username: provider.api_username || "",
        api_password: provider.api_password || "",
        has_webhook: provider.has_webhook || false,
        has_versioning: provider.has_versioning || false,
        has_delta_sync: provider.has_delta_sync || false,
        has_last_modified: provider.has_last_modified || false,
        requires_full_historization: provider.requires_full_historization ?? true,
        sync_strategy: provider.sync_strategy || "full",
        available_entities: provider.available_entities || [], // Inizializza available_entities
      })
    } else {
      setSelectedProvider(null)
      setIsNewProvider(true)
      setSelectedCatalogPms(null)
      setFormData({
        name: "",
        code: "",
        description: "",
        website: "",
        commercial_contact_name: "",
        commercial_contact_email: "",
        commercial_contact_phone: "",
        technical_contact_name: "",
        technical_contact_email: "",
        technical_contact_phone: "",
        api_base_url: "",
        api_key: "",
        api_secret: "",
        api_username: "",
        api_password: "",
        has_webhook: false,
        has_versioning: false,
        has_delta_sync: false,
        has_last_modified: false,
        requires_full_historization: true,
        sync_strategy: "full",
        available_entities: [], // Inizializza available_entities
      })
    }
    setTestResult(null)
    setApiDocText("")
    setDiscoveryResult(null) // Clear discovery results when opening dialog
    setSavedDocuments([]) // Clear saved documents when opening dialog
    setCredentialsSaveResult(null) // Clear stale "credenziali salvate" toast
    setDocumentSaveResult(null) // Clear stale upload feedback
    setActiveTab("info")
    setIsDialogOpen(true)
    setCapabilitiesChanged(false) // Reset capability change flag
  }

  const handleSaveProvider = async () => {
    try {
      const method = isNewProvider ? "POST" : "PUT"
      const body = isNewProvider ? formData : { ...formData, id: selectedProvider?.id }

      const response = await fetch("/api/superadmin/connectors/pms-providers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        loadProviders()
        setIsDialogOpen(false)
        if (onPmsSelect && selectedProvider) {
          const updatedProvider = await response.json() // Assumendo che la risposta contenga il provider aggiornato
          onPmsSelect(updatedProvider.provider)
        } else if (onPmsSelect && isNewProvider) {
          // Se stiamo aggiungendo un nuovo provider e c'è un callback, dobbiamo ricaricare per ottenere l'ID
          const reloadResponse = await fetch("/api/superadmin/connectors/pms-providers")
          const reloadData = await reloadResponse.json()
          if (reloadData.providers && reloadData.providers.length > 0) {
            const newProvider = reloadData.providers.find((p: PmsProvider) => p.code === formData.code)
            if (newProvider) {
              onPmsSelect(newProvider)
            }
          }
        }
        // Clear capability change flag on explicit save
        setCapabilitiesChanged(false)
      }
    } catch (error) {
      console.error("Error saving provider:", error)
    }
  }

  // Saves only API credentials (URL, key, secret, username, password) without
  // touching the rest of the form. Used by the standalone "Salva credenziali"
  // button in the API tab so the user gets immediate feedback.
  const handleSaveCredentials = async () => {
    if (!selectedProvider) return
    setIsSavingCredentials(true)
    setCredentialsSaveResult(null)
    try {
      const response = await fetch("/api/superadmin/connectors/pms-providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedProvider.id,
          api_base_url: formData.api_base_url,
          api_key: formData.api_key,
          api_secret: formData.api_secret,
          api_username: formData.api_username,
          api_password: formData.api_password,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        const msg = err?.error || `Errore nel salvataggio (${response.status})`
        setCredentialsSaveResult({ ok: false, message: msg })
        return
      }
      // Update the in-memory selectedProvider so subsequent test/discovery uses
      // the freshly saved credentials.
      setSelectedProvider((prev) =>
        prev
          ? {
              ...prev,
              api_base_url: formData.api_base_url || null,
              api_key: formData.api_key || null,
              api_secret: formData.api_secret || null,
              api_username: formData.api_username || null,
              api_password: formData.api_password || null,
              connection_status: "configured",
            }
          : prev,
      )
      setCredentialsSaveResult({ ok: true, message: "Credenziali salvate" })
      // Refresh provider list so the dashboard reflects the new status.
      loadProviders()
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Errore di rete"
      setCredentialsSaveResult({ ok: false, message: msg })
    } finally {
      setIsSavingCredentials(false)
    }
  }

  const handleDeleteProvider = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo PMS?")) return

    try {
      const response = await fetch(`/api/superadmin/connectors/pms-providers?id=${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        loadProviders()
      }
    } catch (error) {
      console.error("Error deleting provider:", error)
    }
  }

  const handleTestConnection = async () => {
    if (!selectedProvider) return

    setIsTesting(true)
    setTestResult(null)

    try {
      // Prima salva le credenziali aggiornate
      const updateResponse = await fetch("/api/superadmin/connectors/pms-providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedProvider.id,
          api_base_url: formData.api_base_url,
          api_key: formData.api_key,
          api_secret: formData.api_secret,
          api_username: formData.api_username,
          api_password: formData.api_password,
        }),
      })

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}))
        console.error("[v0] Update credentials failed:", updateResponse.status, errorData)
        throw new Error(errorData.error || `Failed to update credentials (${updateResponse.status})`)
      }

      // Poi esegui il test con discovery
      const response = await fetch("/api/superadmin/connectors/pms-providers/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: selectedProvider.id,
        }),
      })

      const data: ApiDiscoveryResult = await response.json()
      setTestResult(data)

      if (data.success && data.capabilities) {
        setFormData((prev) => ({
          ...prev,
          has_webhook: data.capabilities.hasWebhook,
          has_versioning: data.capabilities.hasVersioning,
          has_delta_sync: data.capabilities.hasDeltaSync,
          has_last_modified: data.capabilities.hasLastModified,
          requires_full_historization: data.capabilities.requiresFullHistorization,
          sync_strategy: data.capabilities.syncStrategy,
          available_entities: data.entities || [], // Aggiorna available_entities dai risultati della discovery
        }))
        // Mark capabilities as changed when discovery updates them
        setCapabilitiesChanged(true)
      }

      loadProviders() // Ricarica la lista per aggiornare lo stato di connessione
    } catch (error) {
      console.error("Connection test error:", error)
      setTestResult({
        success: false,
        message: "Errore di connessione o durante il test",
        availableEndpoints: [],
        unavailableEndpoints: [],
        entities: [],
        criticalMissing: [],
        capabilities: {
          hasWebhook: false,
          hasVersioning: false,
          hasDeltaSync: false,
          hasLastModified: false,
          requiresFullHistorization: true,
          syncStrategy: "full",
        },
      })
    } finally {
      setIsTesting(false)
    }
  }

  // Function to parse API documentation text
  const parseApiDocumentation = (text: string): ParsedApiDocumentation => {
    const endpoints: Array<{ path: string; method: string; entity?: string }> = []
    const capabilities: Partial<ApiDiscoveryResult["capabilities"]> = {
      hasWebhook: false,
      hasVersioning: false,
      hasDeltaSync: false,
      hasLastModified: false,
      requiresFullHistorization: false, // Default to false, will be inferred
      syncStrategy: "full",
    }

    // Simple regex to find common endpoint patterns
    const endpointRegex = /(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/gi
    let match
    while ((match = endpointRegex.exec(text)) !== null) {
      const method = match[1]
      const path = match[2]

      // Try to infer entity from path
      let inferredEntity: string | undefined
      if (path.includes("/rooms/")) inferredEntity = "room"
      else if (path.includes("/bookings/")) inferredEntity = "reservation"
      else if (path.includes("/guests/")) inferredEntity = "guest"
      else if (path.includes("/properties/")) inferredEntity = "property"
      else if (path.includes("/accounts/")) inferredEntity = "account"

      endpoints.push({ path: path, method: method, entity: inferredEntity })
    }

    // Infer capabilities from keywords
    if (/webhook/i.test(text)) capabilities.hasWebhook = true
    if (/version|v\d+/i.test(text)) capabilities.hasVersioning = true
    if (/delta|incremental|changes/i.test(text)) capabilities.hasDeltaSync = true
    if (/last.?modified|updated.?at|modified.?date/i.test(text)) capabilities.hasLastModified = true

    // Infer sync strategy
    if (capabilities.hasWebhook) capabilities.syncStrategy = "webhook"
    else if (capabilities.hasDeltaSync || capabilities.hasLastModified) capabilities.syncStrategy = "delta"
    else capabilities.syncStrategy = "full"

    // Infer requiresFullHistorization
    capabilities.requiresFullHistorization =
      !capabilities.hasDeltaSync && !capabilities.hasLastModified && !capabilities.hasWebhook

    return { endpoints, capabilities }
  }

  // Function to parse API documentation text (kept for the "Discovery" tab)
  const handleParseApiDoc = () => {
    if (!apiDocText.trim()) return

    setIsParsingDoc(true)
    setTestResult(null) // Clear connection test results

    const result = parseApiDocumentation(apiDocText)
    setDiscoveryResult(result) // Store parsed results

    if (result.endpoints.length > 0) {
      const discoveredEntities = result.endpoints.map((e) => e.entity).filter(Boolean)
      const uniqueEntities = [...new Set(discoveredEntities)]

      setFormData((prev) => ({
        ...prev,
        available_entities: uniqueEntities,
        // Update capabilities based on parsed doc
        has_webhook: result.capabilities.hasWebhook || false,
        has_versioning: result.capabilities.hasVersioning || false,
        has_delta_sync: result.capabilities.hasDeltaSync || false,
        has_last_modified: result.capabilities.hasLastModified || false,
        requires_full_historization: result.capabilities.requiresFullHistorization || false,
        sync_strategy: result.capabilities.syncStrategy || "full",
      }))
      // Mark capabilities as changed when parsing doc updates them
      setCapabilitiesChanged(true)
    }

    setIsParsingDoc(false)
  }

  // Function to load pdf.js library dynamically
  const loadPdfJs = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve()
        return
      }

      const script = document.createElement("script")
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
      script.onload = () => {
        ;(window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
        resolve()
      }
      script.onerror = reject
      document.head.appendChild(script)
    })
  }

  // Function to extract text from PDF
  async function extractTextFromPDF(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer
          // Use pdf.js via CDN
          const pdfjsLib = (window as any).pdfjsLib
          if (!pdfjsLib) {
            // Load pdf.js dynamically
            await loadPdfJs()
          }

          const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise
          let fullText = ""

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()
            const pageText = textContent.items.map((item: any) => item.str).join(" ")
            fullText += pageText + "\n"
          }

          resolve(fullText)
        } catch (error) {
          // Fallback: try to read as text
          console.error("PDF parsing failed, trying text fallback:", error)
          reject(error)
        }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedProvider) return

    setDiscoveryLoading(true)
    setApiDocText("") // Clear previous text
    setDiscoveryResult(null) // Clear previous discovery results
    setDocumentSaveResult(null) // Clear previous save feedback

    // Local var to capture the parsed text for auto-save (state updates are
    // async and we need the value within this same handler scope).
    let parsedText = ""
    let parsedResult: ParsedApiDocumentation | null = null

    try {
      // Read file as text (for txt files) or as ArrayBuffer (for PDF)
      if (file.type === "application/pdf") {
        // For PDF, we use a simpler approach - read as text and try to extract
        const text = await extractTextFromPDF(file)
        if (text) {
          parsedText = text
          setApiDocText(text)
          // Auto-parse the documentation
          const result = parseApiDocumentation(text)
          if (result.endpoints.length > 0) {
            // Update available_entities based on discovered endpoints
            const discoveredEntities = result.endpoints.map((e) => e.entity).filter(Boolean)
            const uniqueEntities = [...new Set(discoveredEntities)]

            setFormData((prev) => ({
              ...prev,
              available_entities: uniqueEntities,
            }))

            parsedResult = {
              success: true,
              message: `Trovati ${result.endpoints.length} endpoint API e ${uniqueEntities.length} entità`,
              endpoints: result.endpoints,
              capabilities: result.capabilities,
            }
            setDiscoveryResult(parsedResult)
            // Mark capabilities as changed when parsing doc updates them
            setCapabilitiesChanged(true)
          } else {
            parsedResult = {
              success: false,
              message: `Nessun endpoint API trovato nel documento PDF.`,
              endpoints: [],
              capabilities: {},
            }
            setDiscoveryResult(parsedResult)
          }
        }
      } else {
        // For text files, read directly. We use a Promise wrapper to await
        // FileReader so the auto-save below runs after parsing completes.
        await new Promise<void>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => {
            const text = e.target?.result as string
            if (text) {
              parsedText = text
              setApiDocText(text)
              // Auto-parse
              const result = parseApiDocumentation(text)
              if (result.endpoints.length > 0) {
                const discoveredEntities = result.endpoints.map((e) => e.entity).filter(Boolean)
                const uniqueEntities = [...new Set(discoveredEntities)]

                setFormData((prev) => ({
                  ...prev,
                  available_entities: uniqueEntities,
                }))

                parsedResult = {
                  success: true,
                  message: `Trovati ${result.endpoints.length} endpoint API e ${uniqueEntities.length} entità`,
                  endpoints: result.endpoints,
                  capabilities: result.capabilities,
                }
                setDiscoveryResult(parsedResult)
                // Mark capabilities as changed when parsing doc updates them
                setCapabilitiesChanged(true)
              } else {
                parsedResult = {
                  success: false,
                  message: `Nessun endpoint API trovato nel file di testo.`,
                  endpoints: [],
                  capabilities: {},
                }
                setDiscoveryResult(parsedResult)
              }
            }
            resolve()
          }
          reader.onerror = (error) => {
            console.error("Error reading text file:", error)
            setDiscoveryResult({
              success: false,
              message: `Errore nel leggere il file di testo.`,
              endpoints: [],
              capabilities: {},
            })
            resolve()
          }
          reader.readAsText(file)
        })
      }

      // Auto-save the uploaded document so it doesn't stay only in memory.
      // We save even when no endpoints were extracted, because the file is
      // useful as a reference attachment on the provider record.
      if (parsedText.trim()) {
        const saveResult = await handleSaveDocument(file.name)
        setDocumentSaveResult(saveResult)
      } else {
        setDocumentSaveResult({
          ok: false,
          message: "Impossibile estrarre testo dal file caricato.",
        })
      }
    } catch (error) {
      console.error("Error parsing file:", error)
      setDiscoveryResult({
        success: false,
        message: `Errore nel parsing del file: ${error instanceof Error ? error.message : "Errore sconosciuto"}`,
        endpoints: [],
        capabilities: {},
      })
      setDocumentSaveResult({
        ok: false,
        message: `Errore nel parsing del file: ${error instanceof Error ? error.message : "Errore sconosciuto"}`,
      })
    } finally {
      setDiscoveryLoading(false)
      event.target.value = "" // Reset input
    }
  }

  // Save the parsed/uploaded document. Optional `fileName` lets us preserve
  // the original PDF file name (instead of a generated one) when saving from
  // the Info tab auto-upload. Returns a result so callers can show feedback.
  const handleSaveDocument = async (fileName?: string): Promise<{ ok: boolean; message: string }> => {
    if (!selectedProvider) {
      return { ok: false, message: "Nessun provider selezionato" }
    }
    if (!apiDocText.trim()) {
      return { ok: false, message: "Nessun contenuto documento da salvare" }
    }

    console.log("[v0] Saving document for provider:", selectedProvider.id)
    setIsSavingDocument(true)
    try {
      const finalFileName =
        fileName ||
        `API_Documentation_${selectedProvider.name}_${new Date().toISOString().split("T")[0]}.txt`
      const response = await fetch("/api/superadmin/connectors/pms-providers/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pms_provider_id: selectedProvider.id,
          file_name: finalFileName,
          file_type: "api_documentation",
          content_text: apiDocText,
          parsed_endpoints: discoveryResult?.endpoints || [],
          parsed_capabilities: discoveryResult?.capabilities || {},
        }),
      })

      if (response.ok) {
        console.log("[v0] Document saved successfully")
        loadSavedDocuments(selectedProvider.id)
        return { ok: true, message: `Documento "${finalFileName}" salvato` }
      } else {
        const error = await response.json().catch(() => ({}))
        const msg = error?.error || `Errore nel salvataggio (${response.status})`
        console.error("[v0] Error saving document:", error)
        return { ok: false, message: msg }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Errore di rete"
      console.error("[v0] Error in handleSaveDocument:", error)
      return { ok: false, message: msg }
    } finally {
      setIsSavingDocument(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo documento?")) return

    try {
      const response = await fetch(`/api/superadmin/connectors/pms-providers/documents?id=${docId}`, {
        method: "DELETE",
      })

      if (response.ok && selectedProvider) {
        loadSavedDocuments(selectedProvider.id)
      }
    } catch (error) {
      console.error("Error deleting document:", error)
    }
  }

  const handleLoadDocument = (doc: any) => {
    const content = doc.content || doc.content_text || ""
    setApiDocText(content)

    // Reconstruct discovery result from saved metadata
    const endpoints = doc.metadata?.parsed_endpoints || doc.parsed_endpoints || []
    const capabilities = doc.metadata?.parsed_capabilities || doc.parsed_capabilities || {}

    if (endpoints.length > 0) {
      setDiscoveryResult({
        success: true,
        message: `Caricato documento con ${endpoints.length} endpoint`,
        endpoints,
        capabilities,
        entities: endpoints.map((e: any) => e.entity).filter(Boolean),
      })
    }
  }

  const saveCapabilities = useCallback(async () => {
    if (!selectedProvider) return

    console.log("[v0] Saving capabilities for provider:", selectedProvider.id)
    console.log("[v0] Capabilities data:", {
      has_webhook: formData.has_webhook,
      has_versioning: formData.has_versioning,
      has_delta_sync: formData.has_delta_sync,
      has_last_modified: formData.has_last_modified,
      requires_full_historization: formData.requires_full_historization,
      sync_strategy: formData.sync_strategy,
      available_entities: formData.available_entities?.length,
    })

    try {
      const response = await fetch("/api/superadmin/connectors/pms-providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedProvider.id,
          has_webhook: formData.has_webhook,
          has_versioning: formData.has_versioning,
          has_delta_sync: formData.has_delta_sync,
          has_last_modified: formData.has_last_modified,
          requires_full_historization: formData.requires_full_historization,
          sync_strategy: formData.sync_strategy,
          available_entities: formData.available_entities,
        }),
      })

      if (response.ok) {
        console.log("[v0] Capabilities saved successfully")
        setCapabilitiesChanged(false)
        // Update local provider data
        setProviders((prev) =>
          prev.map((p) =>
            p.id === selectedProvider.id
              ? {
                  ...p,
                  has_webhook: formData.has_webhook,
                  has_versioning: formData.has_versioning,
                  has_delta_sync: formData.has_delta_sync,
                  has_last_modified: formData.has_last_modified,
                  requires_full_historization: formData.requires_full_historization,
                  sync_strategy: formData.sync_strategy,
                  available_entities: formData.available_entities,
                }
              : p,
          ),
        )
        // Notify parent
        if (onProviderUpdate) {
          onProviderUpdate({
            ...selectedProvider,
            has_webhook: formData.has_webhook,
            has_versioning: formData.has_versioning,
            has_delta_sync: formData.has_delta_sync,
            has_last_modified: formData.has_last_modified,
            requires_full_historization: formData.requires_full_historization,
            sync_strategy: formData.sync_strategy,
            available_entities: formData.available_entities,
          })
        }
      } else {
        const error = await response.json()
        console.error("[v0] Error saving capabilities:", error)
      }
    } catch (error) {
      console.error("[v0] Error in saveCapabilities:", error)
    }
  }, [selectedProvider, formData, capabilitiesChanged, onProviderUpdate])

  useEffect(() => {
    if (capabilitiesChanged) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveCapabilities()
      }, 1000) // Save after 1 second of no changes
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [capabilitiesChanged, saveCapabilities])

  const handleCapabilityChange = (field: string, value: boolean | string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setCapabilitiesChanged(true)
  }

  const StatusIcon = selectedProvider ? CONNECTION_STATUS_CONFIG[selectedProvider.connection_status]?.icon : AlertCircle

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Provider PMS Configurati</h3>
          <p className="text-sm text-muted-foreground">Gestisci i PMS connessi alla piattaforma</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Aggiungi PMS
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const statusConfig = CONNECTION_STATUS_CONFIG[provider.connection_status]
          const StatusIconComponent = statusConfig.icon

          return (
            <Card key={provider.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{provider.name}</CardTitle>
                    <CardDescription className="text-xs font-mono">{provider.code}</CardDescription>
                  </div>
                  <Badge className={statusConfig.color}>
                    <StatusIconComponent className="mr-1 h-3 w-3" />
                    {statusConfig.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {provider.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{provider.description}</p>
                )}

                <div className="flex flex-wrap gap-1">
                  {provider.has_webhook && (
                    <Badge variant="outline" className="text-xs bg-green-50">
                      <Webhook className="mr-1 h-3 w-3" />
                      Webhook
                    </Badge>
                  )}
                  {provider.has_delta_sync && (
                    <Badge variant="outline" className="text-xs bg-blue-50">
                      <History className="mr-1 h-3 w-3" />
                      Delta
                    </Badge>
                  )}
                  {provider.has_last_modified && (
                    <Badge variant="outline" className="text-xs bg-purple-50">
                      <Clock className="mr-1 h-3 w-3" />
                      Last Modified
                    </Badge>
                  )}
                  {provider.requires_full_historization && (
                    <Badge variant="outline" className="text-xs bg-orange-50">
                      <Archive className="mr-1 h-3 w-3" />
                      Storicizzazione
                    </Badge>
                  )}
                </div>

                {provider.available_entities?.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <Database className="inline mr-1 h-3 w-3" />
                    {provider.available_entities.length} entità API disponibili
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {provider.website && (
                    <a
                      href={provider.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center hover:text-primary"
                    >
                      <Globe className="mr-1 h-3 w-3" />
                      Sito web
                    </a>
                  )}
                  {provider.documents?.length > 0 && (
                    <span className="flex items-center">
                      <FileText className="mr-1 h-3 w-3" />
                      {provider.documents.length} doc
                    </span>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-transparent"
                    onClick={() => {
                      handleOpenDialog(provider)
                      if (onPmsSelect) {
                        onPmsSelect(provider)
                      }
                    }}
                  >
                    <Settings className="mr-1 h-3 w-3" />
                    Configura
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 bg-transparent"
                    onClick={() => handleDeleteProvider(provider.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {providers.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Database className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h4 className="font-medium">Nessun PMS configurato</h4>
              <p className="text-sm text-muted-foreground mt-1">Aggiungi il primo PMS per iniziare le mappature</p>
              <Button className="mt-4" onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi PMS
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog configurazione PMS */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNewProvider ? "Nuovo PMS" : `Configura ${selectedProvider?.name ?? "PMS"}`}</DialogTitle>
            <DialogDescription>
              {isNewProvider ? "Inserisci le informazioni del nuovo PMS" : "Modifica le configurazioni del PMS"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="contacts">Contatti</TabsTrigger>
              <TabsTrigger value="api">API</TabsTrigger>
              <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
              <TabsTrigger value="discovery">
                <Sparkles className="mr-1 h-3 w-3" />
                Discovery
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 mt-4">
              {isNewProvider && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
                  <Label className="text-sm font-medium">Seleziona PMS dal catalogo</Label>
                  <Select onValueChange={handleSelectCatalogPms} value={selectedCatalogPms?.code || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Scegli un PMS dalla lista..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {PMS_CATALOG.filter((pms) => !providers.some((p) => p.code === pms.code))
                        .sort((a, b) => b.facilityScore - a.facilityScore)
                        .map((pms) => (
                          <SelectItem key={pms.code} value={pms.code}>
                            <div className="flex items-center gap-2">
                              <span className="text-yellow-500 text-xs">{getFacilityStars(pms.facilityScore)}</span>
                              <span>{pms.name}</span>
                              <span className="text-xs text-muted-foreground">({pms.auth})</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  {selectedCatalogPms && (
                    <div className="mt-3 p-3 bg-background rounded border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{selectedCatalogPms.name}</span>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${i < selectedCatalogPms.facilityScore ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>
                          <strong>Doc:</strong> {selectedCatalogPms.docType}
                        </p>
                        <p>
                          <strong>Auth:</strong> {selectedCatalogPms.auth}
                        </p>
                        <p>
                          <strong>Endpoints:</strong> {selectedCatalogPms.endpoints}
                        </p>
                        {selectedCatalogPms.notes && (
                          <p>
                            <strong>Note:</strong> {selectedCatalogPms.notes}
                          </p>
                        )}
                      </div>
                      {selectedCatalogPms.docUrl && (
                        <a
                          href={selectedCatalogPms.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Documentazione API
                        </a>
                      )}
                    </div>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-muted/50 px-2 text-muted-foreground">oppure inserisci manualmente</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome PMS *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="es. Scidoo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Codice *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase() })}
                    placeholder="es. scidoo"
                    disabled={!isNewProvider}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrizione</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Breve descrizione del PMS..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Sito Web</Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://www.esempio.com"
                />
              </div>

              {/* Documenti — usa savedDocuments (caricati dal DB via API), non
                  selectedProvider.documents (legacy non mai aggiornato). */}
              {!isNewProvider && selectedProvider && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Documenti allegati</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={discoveryLoading || isSavingDocument}
                      >
                        {discoveryLoading || isSavingDocument ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="mr-1 h-3 w-3" />
                        )}
                        Carica PDF / TXT
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt,.md"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </div>

                    {/* Feedback dell'auto-save dopo upload */}
                    {documentSaveResult && (
                      <Alert
                        className={
                          documentSaveResult.ok
                            ? "border-green-500 bg-green-50"
                            : "border-amber-500 bg-amber-50"
                        }
                      >
                        <AlertDescription className="flex items-center gap-2 text-xs">
                          {documentSaveResult.ok ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                          )}
                          {documentSaveResult.message}
                        </AlertDescription>
                      </Alert>
                    )}

                    {loadingDocuments ? (
                      <p className="text-sm text-muted-foreground text-center py-4 flex items-center justify-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Caricamento documenti...
                      </p>
                    ) : savedDocuments.length > 0 ? (
                      <div className="space-y-2">
                        {savedDocuments.map((doc) => {
                          const docName =
                            (doc as any).name || (doc as any).document_name || (doc as any).file_name || "Documento"
                          const docDate =
                            (doc as any).created_at || (doc as any).uploaded_at
                          const endpointsCount =
                            (doc as any).metadata?.parsed_endpoints?.length ||
                            (doc as any).parsed_endpoints?.length ||
                            0
                          return (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-2 border rounded-lg"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-4 w-4 text-red-500 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{docName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {docDate
                                      ? new Date(docDate).toLocaleDateString("it-IT", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                        })
                                      : ""}
                                    {endpointsCount > 0 && ` · ${endpointsCount} endpoint`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {(doc as any).file_url && (
                                  <Button variant="ghost" size="sm" asChild>
                                    <a
                                      href={(doc as any).file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteDocument(doc.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nessun documento caricato
                      </p>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="contacts" className="space-y-4 mt-4">
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Contatto Commerciale
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={formData.commercial_contact_name}
                      onChange={(e) => setFormData({ ...formData, commercial_contact_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.commercial_contact_email}
                      onChange={(e) => setFormData({ ...formData, commercial_contact_email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefono</Label>
                    <Input
                      value={formData.commercial_contact_phone}
                      onChange={(e) => setFormData({ ...formData, commercial_contact_phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Contatto Tecnico
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={formData.technical_contact_name}
                      onChange={(e) => setFormData({ ...formData, technical_contact_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.technical_contact_email}
                      onChange={(e) => setFormData({ ...formData, technical_contact_email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefono</Label>
                    <Input
                      value={formData.technical_contact_phone}
                      onChange={(e) => setFormData({ ...formData, technical_contact_phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="api" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="api_base_url">URL Base API</Label>
                <Input
                  id="api_base_url"
                  value={formData.api_base_url}
                  onChange={(e) => setFormData({ ...formData, api_base_url: e.target.value })}
                  placeholder="https://api.esempio.com/v1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="api_key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="api_key"
                      type={showApiKey ? "text" : "password"}
                      value={formData.api_key}
                      onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                      placeholder="Chiave API"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api_secret">API Secret</Label>
                  <div className="relative">
                    <Input
                      id="api_secret"
                      type={showApiSecret ? "text" : "password"}
                      value={formData.api_secret}
                      onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                      placeholder="Secret (opzionale)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowApiSecret(!showApiSecret)}
                    >
                      {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="api_username">Username</Label>
                  <Input
                    id="api_username"
                    value={formData.api_username}
                    onChange={(e) => setFormData({ ...formData, api_username: e.target.value })}
                    placeholder="Username (se richiesto)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api_password">Password</Label>
                  <Input
                    id="api_password"
                    type="password"
                    value={formData.api_password}
                    onChange={(e) => setFormData({ ...formData, api_password: e.target.value })}
                    placeholder="Password (se richiesta)"
                  />
                </div>
              </div>

              {/* Save credentials button: persists API URL/key/secret/user/pass
                  without closing the dialog. Necessario perche' altrimenti
                  cambiando tab senza cliccare "Salva" nel footer si perdono
                  le modifiche. */}
              {!isNewProvider && selectedProvider && (
                <div className="space-y-2">
                  <Button
                    onClick={handleSaveCredentials}
                    disabled={isSavingCredentials}
                    variant="outline"
                    className="w-full"
                  >
                    {isSavingCredentials ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvataggio in corso...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Salva credenziali
                      </>
                    )}
                  </Button>
                  {credentialsSaveResult && (
                    <Alert
                      className={
                        credentialsSaveResult.ok
                          ? "border-green-500 bg-green-50 py-2"
                          : "border-red-500 bg-red-50 py-2"
                      }
                    >
                      <AlertDescription className="flex items-center gap-2 text-xs">
                        {credentialsSaveResult.ok ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-600" />
                        )}
                        {credentialsSaveResult.message}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <Separator />

              {/* Test connessione */}
              {!isNewProvider && selectedProvider && (
                <div className="space-y-4">
                  <Button onClick={handleTestConnection} disabled={isTesting} className="w-full">
                    {isTesting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Test e Discovery in corso...
                      </>
                    ) : (
                      <>
                        <Zap className="mr-2 h-4 w-4" />
                        Testa Connessione e Scopri API
                      </>
                    )}
                  </Button>

                  {testResult && (
                    <Alert className={testResult.success ? "border-green-500" : "border-red-500"}>
                      <AlertDescription>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            {testResult.success ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className="font-medium">{testResult.message}</span>
                          </div>

                          {testResult.success && testResult.accountInfo?.properties && (
                            <div className="mt-2">
                              <span className="text-sm font-medium">Strutture trovate:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {testResult.accountInfo.properties.map((p) => (
                                  <Badge key={p.id} variant="secondary">
                                    {p.name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {testResult.success && testResult.entities?.length > 0 && (
                            <div className="mt-2">
                              <span className="text-sm font-medium">
                                Entità API scoperte: {testResult.entities.length}
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                                {testResult.entities.slice(0, 20).map((entity) => (
                                  <Badge
                                    key={entity}
                                    variant={CRITICAL_ENTITIES.includes(entity) ? "default" : "outline"}
                                    className={CRITICAL_ENTITIES.includes(entity) ? "bg-green-100 text-green-800" : ""}
                                  >
                                    {entity}
                                  </Badge>
                                ))}
                                {testResult.entities.length > 20 && (
                                  <Badge variant="outline">+{testResult.entities.length - 20} altre</Badge>
                                )}
                              </div>
                            </div>
                          )}

                          {testResult.criticalMissing?.length > 0 && (
                            <div className="mt-2">
                              <span className="text-sm font-medium text-red-600">Entita critiche mancanti:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {testResult.criticalMissing.map((entity) => (
                                  <Badge key={entity} variant="destructive">
                                    {entity}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Full endpoint discovery results */}
                          {testResult.endpointResults && testResult.endpointResults.length > 0 && (
                            <div className="mt-4 border-t pt-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-semibold">
                                  Endpoint API Scoperti ({testResult.endpointResults.length})
                                </span>
                                <div className="flex gap-2 text-xs">
                                  <span className="flex items-center gap-1">
                                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                                    {testResult.endpointResults.filter(e => e.is_available).length} disponibili
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                                    {testResult.endpointResults.filter(e => !e.is_available).length} non disponibili
                                  </span>
                                </div>
                              </div>
                              <div className="max-h-80 overflow-y-auto border rounded-lg">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/50 sticky top-0">
                                    <tr>
                                      <th className="text-left p-2 font-medium">Stato</th>
                                      <th className="text-left p-2 font-medium">Endpoint</th>
                                      <th className="text-left p-2 font-medium">Entita</th>
                                      <th className="text-left p-2 font-medium">Descrizione</th>
                                      <th className="text-left p-2 font-medium">Tipo</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {testResult.endpointResults
                                      .sort((a, b) => {
                                        // Critical first, then available, then unavailable
                                        if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1
                                        if (a.is_available !== b.is_available) return a.is_available ? -1 : 1
                                        return a.endpoint_path.localeCompare(b.endpoint_path)
                                      })
                                      .map((ep) => (
                                        <tr
                                          key={ep.endpoint_path}
                                          className={`${ep.is_available ? "" : "opacity-60"} ${ep.is_critical ? "bg-amber-50/50" : ""}`}
                                        >
                                          <td className="p-2">
                                            {ep.is_available ? (
                                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" title="Disponibile" />
                                            ) : (
                                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title={ep.error || "Non disponibile"} />
                                            )}
                                          </td>
                                          <td className="p-2 font-mono text-[11px]">
                                            {ep.endpoint_path}
                                          </td>
                                          <td className="p-2">
                                            <Badge variant="outline" className="text-[10px] py-0">
                                              {ep.entity}
                                            </Badge>
                                          </td>
                                          <td className="p-2 text-muted-foreground">{ep.description}</td>
                                          <td className="p-2">
                                            {ep.is_critical ? (
                                              <Badge variant="destructive" className="text-[10px] py-0">Critico</Badge>
                                            ) : (
                                              <Badge variant="secondary" className="text-[10px] py-0">Opzionale</Badge>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                Questi endpoint sono stati salvati nel database. Per ogni sviluppo futuro, consultare questa lista per sapere quali dati il PMS puo fornire.
                              </p>
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="capabilities" className="space-y-4 mt-4">
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertDescription>
                  Queste impostazioni vengono rilevate automaticamente durante il test di connessione o analizzando la
                  documentazione. Puoi comunque modificarle manualmente.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Webhook className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label>Supporta Webhook</Label>
                      <p className="text-xs text-muted-foreground">Il PMS invia notifiche push per gli aggiornamenti</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.has_webhook}
                    onCheckedChange={(checked) => handleCapabilityChange("has_webhook", checked)} // Use handleCapabilityChange
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <History className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label>Supporta Versioning</Label>
                      <p className="text-xs text-muted-foreground">API con versioni (es. v1, v2)</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.has_versioning}
                    onCheckedChange={(checked) => handleCapabilityChange("has_versioning", checked)} // Use handleCapabilityChange
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label>Supporta Delta Sync</Label>
                      <p className="text-xs text-muted-foreground">
                        Possibilità di sincronizzare solo le modifiche incrementali
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.has_delta_sync}
                    onCheckedChange={(checked) => handleCapabilityChange("has_delta_sync", checked)} // Use handleCapabilityChange
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label>Ha Last Modified</Label>
                      <p className="text-xs text-muted-foreground">I record hanno un campo last_modified affidabile</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.has_last_modified}
                    onCheckedChange={(checked) => handleCapabilityChange("has_last_modified", checked)} // Use handleCapabilityChange
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-orange-50">
                  <div className="flex items-center gap-3">
                    <Archive className="h-5 w-5 text-orange-600" />
                    <div>
                      <Label>Richiede Storicizzazione Completa</Label>
                      <p className="text-xs text-muted-foreground">
                        Senza webhook/delta, dobbiamo storicizzare tutti i dati per non perderli
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.requires_full_historization}
                    onCheckedChange={(checked) => handleCapabilityChange("requires_full_historization", checked)} // Use handleCapabilityChange
                  />
                </div>

                <div className="space-y-2">
                  <Label>Strategia di Sincronizzazione</Label>
                  <Select
                    value={formData.sync_strategy}
                    onValueChange={
                      (value: "full" | "delta" | "webhook") => handleCapabilityChange("sync_strategy", value) // Use handleCapabilityChange
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Sync (scarica tutto ogni volta)</SelectItem>
                      <SelectItem value="delta">Delta Sync (solo modifiche)</SelectItem>
                      <SelectItem value="webhook">Webhook (push dal PMS)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Entità API Disponibili</h3>
                    <p className="text-sm text-muted-foreground">
                      Tutte le entità che il PMS può fornire, organizzate per categoria
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {formData.available_entities?.length || 0} entità
                  </Badge>
                </div>

                {/* Legenda */}
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-500" />
                    <span>Critica (obbligatoria)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-green-500" />
                    <span>Disponibile</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-gray-300" />
                    <span>Non disponibile</span>
                  </div>
                </div>

                {/* Categorie di entità */}
                <div className="grid gap-4">
                  {Object.entries(SCIDOO_ENTITIES).map(([category, entities]) => (
                    <div key={category} className="border rounded-lg p-4">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        {category === "Struttura & Account" && <Building2 className="h-4 w-4" />}
                        {category === "Clienti & Persone" && <Users className="h-4 w-4" />}
                        {category === "Alloggi" && <BedDouble className="h-4 w-4" />}
                        {category === "Prenotazioni" && <Calendar className="h-4 w-4" />}
                        {category === "Prezzi & Tariffe" && <DollarSign className="h-4 w-4" />}
                        {category === "Preventivi" && <FileText className="h-4 w-4" />}
                        {category === "Canali / Origini" && <Globe className="h-4 w-4" />}
                        {category === "Servizi & Extra" && <Package className="h-4 w-4" />}
                        {category === "Metadati" && <Tag className="h-4 w-4" />}
                        {category === "Media" && <ImageIcon className="h-4 w-4" />}
                        {category === "Fiscale" && <Receipt className="h-4 w-4" />}
                        {category}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {entities.map((entity) => {
                          const isCritical = CRITICAL_ENTITIES.includes(entity)
                          const isAvailable = formData.available_entities?.includes(entity)

                          return (
                            <Badge
                              key={entity}
                              variant={isAvailable ? "default" : "outline"}
                              className={`cursor-pointer transition-all ${
                                isCritical
                                  ? isAvailable
                                    ? "bg-red-500 hover:bg-red-600 text-white"
                                    : "border-red-500 text-red-500"
                                  : isAvailable
                                    ? "bg-green-500 hover:bg-green-600 text-white"
                                    : "bg-gray-100 text-gray-500"
                              }`}
                              onClick={() => {
                                const currentEntities = formData.available_entities || []
                                const newEntities = isAvailable
                                  ? currentEntities.filter((e) => e !== entity)
                                  : [...currentEntities, entity]
                                // Use handleCapabilityChange for available_entities
                                handleCapabilityChange("available_entities", newEntities)
                              }}
                            >
                              {entity}
                              {isCritical && <span className="ml-1">*</span>}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Riepilogo entità critiche */}
                <Alert
                  variant={
                    CRITICAL_ENTITIES.every((e) => formData.available_entities?.includes(e)) ? "default" : "destructive"
                  }
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Entità Critiche:</strong>{" "}
                    {CRITICAL_ENTITIES.filter((e) => formData.available_entities?.includes(e)).length}/
                    {CRITICAL_ENTITIES.length} disponibili.
                    {CRITICAL_ENTITIES.filter((e) => !formData.available_entities?.includes(e)).length > 0 && (
                      <span className="block mt-1 text-sm">
                        Mancanti:{" "}
                        {CRITICAL_ENTITIES.filter((e) => !formData.available_entities?.includes(e)).join(", ")}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>

                {CRITICAL_ENTITIES.filter((e) => formData.available_entities?.includes(e)).length > 0 && (
                  <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50/50">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <h4 className="font-semibold text-red-800">Entità Critiche da Mappare</h4>
                    </div>
                    <p className="text-sm text-red-700 mb-4">
                      Queste entità sono fondamentali per il funzionamento del sistema. Assicurati di mapparle
                      correttamente nel tab "Mappatura Dati".
                    </p>
                    <div className="grid gap-2">
                      {CRITICAL_ENTITIES.filter((e) => formData.available_entities?.includes(e)).map((entity) => {
                        // Determina la categoria dell'entità
                        let entityType = "booking_status" // Default
                        let entityLabel = entity

                        if (
                          [
                            "reservation",
                            "booking_room",
                            "booking_rate",
                            "booking_day_price",
                            "booking_price_detail",
                            "booking_extra",
                            "booking_payment",
                            "booking_note",
                          ].includes(entity)
                        ) {
                          entityType = "booking_status"
                          entityLabel =
                            {
                              reservation: "Stati Prenotazione",
                              booking_room: "Camere Prenotazione",
                              booking_rate: "Tariffe Prenotazione",
                              booking_day_price: "Prezzi Giornalieri",
                              booking_price_detail: "Dettagli Prezzo",
                              booking_extra: "Extra Prenotazione",
                              booking_payment: "Pagamenti",
                              booking_note: "Note Prenotazione",
                            }[entity] || entity
                        } else if (["room", "room_type", "room_status", "room_availability"].includes(entity)) {
                          entityType = "room_type"
                          entityLabel =
                            {
                              room: "Camere",
                              room_type: "Tipologie Camera",
                              room_status: "Stati Camera",
                              room_availability: "Disponibilità Camera",
                            }[entity] || entity
                        } else if (["rate", "day_price", "arrangement"].includes(entity)) {
                          entityType = "rate_plan"
                          entityLabel =
                            {
                              rate: "Piani Tariffari",
                              day_price: "Prezzi Giornalieri",
                              arrangement: "Trattamenti",
                            }[entity] || entity
                        } else if (["customer", "guest", "guest_type"].includes(entity)) {
                          entityType = "document_type"
                          entityLabel =
                            {
                              customer: "Clienti",
                              guest: "Ospiti",
                              guest_type: "Tipi Ospite",
                            }[entity] || entity
                        }

                        return (
                          <div
                            key={entity}
                            className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200"
                          >
                            <div className="flex items-center gap-3">
                              <Badge variant="destructive" className="text-xs">
                                {entity}
                              </Badge>
                              <span className="text-sm font-medium">{entityLabel}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-300 hover:bg-red-50 bg-transparent"
                              onClick={() => {
                                // Passa al tab Mappatura Dati
                                if (onNavigateToMapping) {
                                  onNavigateToMapping(entityType)
                                }
                              }}
                            >
                              <ArrowRight className="h-4 w-4 mr-1" />
                              Mappa
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {/* Fine sezione entità critiche da mappare */}

                {/* Pulsante per selezionare tutte le entità Scidoo */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const allEntities = Object.values(SCIDOO_ENTITIES).flat()
                      handleCapabilityChange("available_entities", allEntities) // Use handleCapabilityChange
                    }}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Seleziona Tutte
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleCapabilityChange("available_entities", [...CRITICAL_ENTITIES]) // Use handleCapabilityChange
                    }}
                  >
                    Solo Critiche
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleCapabilityChange("available_entities", []) // Use handleCapabilityChange
                    }}
                  >
                    Deseleziona Tutte
                  </Button>
                </div>
              </div>
              {/* Fine sezione Entità API */}
            </TabsContent>

            <TabsContent value="discovery" className="space-y-4 mt-4">
              <Alert>
                <FileCode className="h-4 w-4" />
                <AlertDescription>
                  Incolla qui la documentazione API del PMS o carica un file (PDF, TXT). Il sistema analizzerà
                  automaticamente gli endpoint e le capabilities disponibili.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Documentazione API (incolla il testo)</Label>
                <Textarea
                  value={apiDocText}
                  onChange={(e) => setApiDocText(e.target.value)}
                  placeholder={`Incolla qui la documentazione API del PMS...

Esempio:
POST /api/v1/bookings/get.php
GET /api/v1/rooms/getRoomTypes.php
...

Il sistema rileverà automaticamente:
- Endpoint disponibili
- Supporto webhook
- Supporto delta/last_modified
- Entità mappabili`}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleParseApiDoc}
                disabled={!apiDocText.trim() || isParsingDoc || discoveryLoading}
                className="w-full"
              >
                {isParsingDoc || discoveryLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isParsingDoc ? "Analisi in corso..." : "Caricamento e analisi file..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analizza Documentazione
                  </>
                )}
              </Button>

              {discoveryResult && (
                <Alert className={discoveryResult.success ? "border-green-500" : "border-red-500"}>
                  <AlertDescription>
                    <div className="flex items-center gap-2">
                      {discoveryResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">{discoveryResult.message}</span>
                    </div>
                    {discoveryResult.endpoints.length > 0 && (
                      <div className="mt-2">
                        <span className="text-sm font-medium">
                          Endpoint scoperti: {discoveryResult.endpoints.length}
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                          {discoveryResult.endpoints.slice(0, 10).map((ep, index) => (
                            <Badge key={index} variant="outline">
                              {ep.method} {ep.path} {ep.entity && `(${ep.entity})`}
                            </Badge>
                          ))}
                          {discoveryResult.endpoints.length > 10 && (
                            <Badge variant="outline">+{discoveryResult.endpoints.length - 10} altri</Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              <div className="space-y-2">
                <Label>Oppure carica un file</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                    disabled={discoveryLoading}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Carica PDF / TXT
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {/* Update the Discovery TabsContent to show saved documents and save button */}
              {/* Documenti API Salvati */}
              {savedDocuments.length > 0 && (
                <div className="space-y-2 mt-4">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Documenti API Salvati ({savedDocuments.length})
                  </Label>
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {savedDocuments.map((doc) => {
                      // Cast to any: PmsDocument interface doesn't fully model
                      // legacy/alternate field names (file_name, parsed_endpoints
                      // top-level vs metadata.parsed_endpoints).
                      const d = doc as any
                      const docName = d.name || d.file_name || d.document_name || "Documento API"
                      const docDate = d.created_at || d.uploaded_at
                      const endpointsCount =
                        d.metadata?.parsed_endpoints?.length ??
                        d.parsed_endpoints?.length ??
                        0
                      return (
                      <div key={doc.id} className="p-3 flex items-center justify-between hover:bg-muted/50">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{docName}</div>
                          <div className="text-xs text-muted-foreground">
                            {docDate ? new Date(docDate).toLocaleDateString("it-IT") : ""} - {endpointsCount} endpoint
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleLoadDocument(doc)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Pulsante Salva Documento — wrapped in arrow function because
                  handleSaveDocument now accepts an optional fileName param. */}
              {apiDocText.trim() && discoveryResult?.success && (
                <Button onClick={() => handleSaveDocument()} variant="outline" className="w-full mt-2 bg-transparent">
                  <Save className="mr-2 h-4 w-4" />
                  Salva Documento API
                </Button>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSaveProvider}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { PmsProvidersManager as PMSProvidersManager }
