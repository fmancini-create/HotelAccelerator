"use client"
import { useState, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, Plus, Edit, Trash2, AlertTriangle, Loader2, ShieldAlert, CheckCircle } from "lucide-react"
import { toast } from "sonner"

// Types
interface CodeItem {
  code: string
  label: string
  source?: "db" | "predefined" | "custom"
}

interface Mapping {
  id?: string
  pms_provider: string
  pms_entity_type: string
  pms_code: string
  pms_label?: string
  rms_code: string
  rms_label?: string
  hotel_id?: string | null
  locked?: boolean
}

interface ConnectorsMappingTableProps {
  initialMappings: any[]
  hotels: any[]
  pmsData: any
  pmsHotelData?: Record<string, any[]>
  rmsCanonicalCodes: Record<string, string[]>
  pmsProviders?: any[]
  selectedProviderId?: string
  initialInternalTab?: string
  criticalEntities?: string[]
  missingCriticalEntities?: string[]
  onMappingsUpdate?: (mappings: any[]) => void
  onPmsGlobalDataUpdate?: (data: Record<string, any[]>) => void
  onPmsHotelDataUpdate?: (data: Record<string, any[]>) => void
}

// Entity types for global mapping (PMS-level)
const GLOBAL_VALUE_TYPES: Array<{ key: string; label: string; critical?: boolean; isSchemaMapping?: boolean }> = [
  { key: "booking_status", label: "Stati Prenotazione" },
  { key: "document_type", label: "Tipi Documento" },
  { key: "availability", label: "Disponibilità" },
  { key: "min_stay", label: "Minimum Stay" },
  { key: "fiscal_production", label: "Produzione Fiscale" },
  { key: "reservation", label: "Prenotazioni", critical: true },
  { key: "guest", label: "Ospiti", critical: true },
  { key: "customer", label: "Clienti (Fatturazione)" },
  { key: "booking_room", label: "Camere Prenotate", critical: true },
  { key: "tax_document", label: "Documenti Fiscali", critical: true },
  { key: "room_api", label: "Camere (API)", isSchemaMapping: true },
  { key: "rate_api", label: "Tariffe (API)", isSchemaMapping: true },
]

// Entity types for hotel-specific mapping
const HOTEL_ENTITY_TYPES: Array<{ key: string; label: string; critical?: boolean; isSchemaMapping?: boolean }> = [
  { key: "room_type", label: "Tipologie Camera", critical: true },
  { key: "rate_plan", label: "Piani Tariffari", critical: true },
  { key: "channel", label: "Canali di Vendita" },
  { key: "payment_method", label: "Metodi Pagamento" },
  { key: "meal_plan", label: "Trattamenti Pasti" },
]

// 19/05/2026: spostata a top-level (era dentro il componente) cosi le
// funzioni getMappingsForEntity / getExistingMapping possono leggerla
// senza dipendere dall'ordine di dichiarazione.
// Solo entity *strettamente* per-hotel (anagrafiche camere/tariffe).
// Tutte le altre HOTEL_ENTITY_TYPES (channel, payment_method,
// meal_plan) ereditano dal mapping globale se l'hotel non ha override.
// 19/05/2026 update: "channel" RIMOSSO da questa lista. I canali di
// vendita (Booking, Expedia, Airbnb...) sono un'anagrafica globale:
// se il super admin li mappa una volta, tutti gli hotel ereditano
// senza rimapparli. Singoli hotel possono comunque overridare.
const HOTEL_LEVEL_ENTITIES = [
  "room_type",
  "rate_plan",
  "arrangement",
  "room",
  "rate",
]

// All entity types
const ENTITY_TYPES = [
  // Core entities
  { key: "reservation", label: "Prenotazioni", critical: true },
  { key: "guest", label: "Ospiti", critical: true },
  { key: "customer", label: "Clienti (Fatturazione)" },
  { key: "booking_room", label: "Camere Prenotate", critical: true },
  { key: "tax_document", label: "Documenti Fiscali", critical: true },
  { key: "room_type", label: "Tipologie Camere", critical: true },
  { key: "rate_plan", label: "Piani Tariffari", critical: true },
  { key: "channel", label: "Canali di Vendita" },
  { key: "availability", label: "Disponibilità" },
  { key: "booking_status", label: "Stati Prenotazione" },
  { key: "payment_method", label: "Metodi Pagamento" },
  { key: "meal_plan", label: "Trattamenti Pasti" },
  { key: "room_api", label: "Camere (API)", isSchemaMapping: true },
  { key: "rate_api", label: "Tariffe (API)", isSchemaMapping: true },
]

// SUS Schema fields for dropdown
const getRmsSchemaFields = (entityType: string): Array<{ code: string; label: string }> => {
  const susSchemaFields: Record<string, Array<{ code: string; label: string }>> = {
    reservation: [
      { code: "booking_id", label: "ID Prenotazione" },
      { code: "check_in_date", label: "Data Check-in" },
      { code: "check_out_date", label: "Data Check-out" },
      { code: "created_at", label: "Data Creazione" },
      { code: "cancelled_at", label: "Data Cancellazione" },
      { code: "status", label: "Stato" },
      // FIX 13/07/2026: prima qui c'erano "room_type_id" e "rate_id"
      // (minuscoli), che nel dropdown convivevano coi codici storici
      // maiuscoli usati da TUTTE le mappature reservation in DB (Scidoo,
      // BRiG, Bedzzle) creando doppioni confusi. I minuscoli restano
      // legittimi SOLO nelle sezioni anagrafiche room_api/rate_api.
      { code: "ID TIPOLOGIA CAMERA", label: "ID Tipologia Camera" },
      { code: "ID TARIFFA", label: "ID Tariffa" },
      { code: "guests_count", label: "Numero Ospiti" },
      { code: "adults", label: "Adulti" },
      { code: "children", label: "Bambini" },
      { code: "daily_rates", label: "Prezzi Giornalieri" },
      { code: "extras", label: "Extra" },
      { code: "total_amount", label: "Importo Totale" },
      { code: "notes", label: "Note" },
      { code: "channel", label: "Canale" },
      { code: "source", label: "Origine" },
    ],
    guest: [
      { code: "guest_id", label: "ID Ospite" },
      { code: "first_name", label: "Nome" },
      { code: "last_name", label: "Cognome" },
      { code: "email", label: "Email" },
      { code: "phone", label: "Telefono" },
      { code: "mobile", label: "Cellulare" },
      { code: "birth_date", label: "Data Nascita" },
      { code: "birth_place", label: "Luogo Nascita" },
      { code: "nationality", label: "Nazionalità" },
      { code: "country", label: "Paese" },
      { code: "document_type", label: "Tipo Documento" },
      { code: "document_number", label: "Numero Documento" },
      { code: "document_expiry", label: "Scadenza Documento" },
      { code: "address", label: "Indirizzo" },
      { code: "city", label: "Città" },
      { code: "zip_code", label: "CAP" },
      { code: "gender", label: "Sesso" },
    ],
    customer: [
      { code: "customer_id", label: "ID Cliente" },
      { code: "company_name", label: "Ragione Sociale" },
      { code: "vat_number", label: "Partita IVA" },
      { code: "fiscal_code", label: "Codice Fiscale" },
      { code: "sdi_code", label: "Codice SDI" },
      { code: "pec", label: "PEC" },
      { code: "billing_address", label: "Indirizzo Fatturazione" },
      { code: "billing_city", label: "Città Fatturazione" },
      { code: "billing_zip", label: "CAP Fatturazione" },
      { code: "billing_country", label: "Paese Fatturazione" },
      { code: "contact_email", label: "Email Contatto" },
      { code: "contact_phone", label: "Telefono Contatto" },
    ],
    booking_room: [
      { code: "booking_room_id", label: "ID Camera Prenotata" },
      { code: "booking_id", label: "ID Prenotazione" },
      { code: "room_id", label: "ID Camera" },
      { code: "room_type_id", label: "ID Tipologia Camera" },
      { code: "room_number", label: "Numero Camera" },
      { code: "check_in", label: "Check-in" },
      { code: "check_out", label: "Check-out" },
      { code: "adults", label: "Adulti" },
      { code: "children", label: "Bambini" },
      { code: "daily_rate", label: "Tariffa Giornaliera" },
      { code: "total_amount", label: "Importo Totale" },
      { code: "rate_id", label: "ID Tariffa" },
      { code: "meal_plan_id", label: "ID Trattamento" },
    ],
    tax_document: [
      { code: "document_id", label: "ID Documento" },
      { code: "document_number", label: "Numero Documento" },
      { code: "document_type", label: "Tipo Documento" },
      { code: "document_date", label: "Data Documento" },
      { code: "total_amount", label: "Importo Totale" },
      { code: "net_amount", label: "Imponibile" },
      { code: "vat_amount", label: "IVA" },
      { code: "customer_id", label: "ID Cliente" },
      { code: "booking_id", label: "ID Prenotazione" },
      { code: "payment_method", label: "Metodo Pagamento" },
      { code: "is_paid", label: "Pagato" },
    ],
    room_api: [
      { code: "room_id", label: "ID Camera" },
      { code: "room_number", label: "Numero Camera" },
      { code: "room_name", label: "Nome Camera" },
      { code: "room_type_id", label: "ID Tipologia" },
      // 14/07/2026: campi tipologia richiesti dal mapping Slope (lodging
      // types: nominalCapacity/maximumCapacity/quantity). Stessi codici
      // inseriti in rms_canonical_codes (le sezioni SCHEMA pero' leggono
      // SOLO questa lista hardcoded, non la tabella).
      { code: "capacity", label: "Capacita Nominale" },
      { code: "max_capacity", label: "Capacita Massima" },
      { code: "total_rooms", label: "Numero Unita" },
      { code: "floor", label: "Piano" },
      { code: "status", label: "Stato" },
    ],
    rate_api: [
      { code: "rate_id", label: "ID Tariffa" },
      { code: "rate_code", label: "Codice Tariffa" },
      { code: "rate_name", label: "Nome Tariffa" },
      { code: "TARIFFA DERIVATA", label: "Tariffa Derivata (no push)" },
      { code: "room_type_id", label: "ID Tipologia" },
      { code: "date", label: "Data" },
      { code: "price", label: "Prezzo" },
      { code: "min_stay", label: "Soggiorno Minimo" },
      { code: "closed", label: "Chiuso" },
    ],
    // NB: sale_source NON va qui — e' un mapping di VALORI, non di schema.
    // I suoi codici canonici (DIRETTO, OTA, ...) sono in rmsCanonicalCodes
    // dentro app/api/superadmin/connectors/mapping/pms-data/route.ts.
  }
  return susSchemaFields[entityType] || []
}

const handleDownloadPmsData = async (
  isGlobal: boolean,
  selectedProvider: any,
  setIsLoading: any,
  onPmsGlobalDataUpdate: any,
  onPmsHotelDataUpdate: any,
  selectedHotelId?: string, // Added hotelId parameter
  setHotelIntegrationMode?: (mode: string) => void,
  setHotelWarnings?: (warnings: string[]) => void,
) => {
  console.log("[v0] handleDownloadPmsData called:", { isGlobal, selectedProvider, selectedHotelId })
  
  if (!selectedProvider) {
    toast.error("Seleziona un PMS prima di scaricare i dati")
    console.log("[v0] No selectedProvider - aborting")
    return
  }

  if (!isGlobal && !selectedHotelId) {
    toast.error("Seleziona un hotel prima di scaricare i dati hotel-specific")
    return
  }

  setIsLoading(true)
  try {
    const providerCode = selectedProvider.code || selectedProvider.name?.toLowerCase() || ""
    console.log(
      "[v0] Downloading PMS data for provider:",
      providerCode,
      "isGlobal:",
      isGlobal,
      "hotelId:",
      selectedHotelId,
    )

    let url = `/api/superadmin/connectors/mapping/pms-data?provider=${encodeURIComponent(providerCode)}`
    if (!isGlobal && selectedHotelId) {
      url += `&scope=hotel&hotelId=${encodeURIComponent(selectedHotelId)}`
    }

    const response = await fetch(url)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || "Errore nel recupero dati PMS")
    }

    const data = await response.json()

    // Warnings non-bloccanti (es. BRiG 200 con body vuoto, oppure roomtypes 500
    // ma rateplans 200): mostriamoli come toast warning aggiuntivi cosi
    // l'utente capisce perche la lista e vuota invece di vedere "GSheets".
    if (Array.isArray(data.warnings) && data.warnings.length > 0) {
      for (const w of data.warnings) {
        toast.warning(w, { duration: 8000 })
      }
    }

    if (isGlobal) {
      onPmsGlobalDataUpdate(data.values || {})
      toast.success(`Dati PMS caricati: ${Object.keys(data.values || {}).length} tipi di entita`)
    } else {
      onPmsHotelDataUpdate(data.values || {})
      // Salva integration_mode e warnings per il render delle card hotel-level
      if (setHotelIntegrationMode) setHotelIntegrationMode(data.integrationMode || "api")
      if (setHotelWarnings) setHotelWarnings(Array.isArray(data.warnings) ? data.warnings : [])
      toast.success(`Dati Hotel caricati: ${Object.keys(data.values || {}).length} tipi di entita`)
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Errore nel recupero dati PMS")
  } finally {
    setIsLoading(false)
  }
}

export function ConnectorsMappingTable({
  initialMappings,
  hotels,
  pmsData,
  pmsHotelData: externalPmsHotelData,
  rmsCanonicalCodes,
  pmsProviders = [],
  selectedProviderId,
  initialInternalTab = "pms-config",
  criticalEntities = [],
  missingCriticalEntities = [],
  onMappingsUpdate,
  onPmsGlobalDataUpdate,
  onPmsHotelDataUpdate,
}: ConnectorsMappingTableProps) {
  const [activeTab, setActiveTab] = useState(initialInternalTab)
  const [selectedHotel, setSelectedHotel] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [mappings, setMappings] = useState<Mapping[]>(initialMappings || [])

  const isLocalSaveRef = useRef(false)
  const prevMappingsLengthRef = useRef(initialMappings?.length || 0)
  const preSaveSnapshotRef = useRef<{
    mappingsCount: number
    mappingsWithRmsCode: number
    pmsDataKeys: string[]
    pmsDataItemCount: number
  } | null>(null)

  // PMS data loaded from API - read directly from props
  const pmsGlobalData = pmsData?.values || {}
  const pmsHotelData = externalPmsHotelData || {}

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add")
  const [currentEntityType, setCurrentEntityType] = useState("")
  const [currentPmsCode, setCurrentPmsCode] = useState("")
  const [currentPmsLabel, setCurrentPmsLabel] = useState("")
  const [currentRmsCode, setCurrentRmsCode] = useState("")
  const [currentMappingId, setCurrentMappingId] = useState<string | null>(null)
  const [isGlobal, setIsGlobal] = useState(true)
  const [newCustomCode, setNewCustomCode] = useState("")

  // Get selected provider
  const selectedProvider = useMemo(() => {
    return pmsProviders.find((p) => p.id === selectedProviderId)
  }, [pmsProviders, selectedProviderId])

  // Safe object keys helper
  const safeKeys = (obj: any): string[] => {
    if (!obj || typeof obj !== "object") return []
    return Object.keys(obj)
  }

  const selectedProviderCode = selectedProvider?.code || selectedProvider?.name?.toLowerCase() || ""

  // Check if entity type has data
  const hasDataForEntity = (entityType: string, isGlobalTab: boolean): boolean => {
    if (isGlobalTab) {
      return (pmsGlobalData[entityType]?.length || 0) > 0
    }
    return (pmsHotelData[entityType]?.length || 0) > 0
  }

  const getProviderMappings = (): Mapping[] => {
    if (!selectedProviderCode && !selectedProviderId) return mappings
    return mappings.filter(
      (m) =>
        m.pms_provider === selectedProviderCode ||
        m.pms_provider === selectedProvider?.name ||
        m.pms_provider === selectedProviderId,
    )
  }

  const getMappingsForEntity = (entityType: string, hotelId?: string | null): Mapping[] => {
    const providerMappings = getProviderMappings()
    // 19/05/2026: nel tab hotel (hotelId !== null) ereditiamo anche i
    // mapping globali (hotel_id IS NULL) per le entity NON-strettamente
    // hotel-level (es. payment_method, meal_plan), cosi un super admin
    // che ha gia' mappato globalmente NON costringe poi ogni hotel a
    // rimappare gli stessi codici. Pattern: hotel-specific OVERRIDE su
    // globale. Per ogni pms_code preferisci il match hotel-specific se
    // esiste, altrimenti ricadi sul globale.
    const isHotelLevelEntity = HOTEL_LEVEL_ENTITIES.includes(entityType)
    return providerMappings.filter((m) => {
      const matchesEntity = m.pms_entity_type === entityType || m.entity_type === entityType
      if (!matchesEntity) return false
      if (hotelId === null) {
        // Tab globale: solo righe senza hotel_id
        return m.hotel_id === null || m.hotel_id === undefined
      }
      if (!hotelId) return true
      if (isHotelLevelEntity) {
        // room_type, rate_plan, arrangement, room, rate -> sempre per-hotel
        return m.hotel_id === hotelId
      }
      // Entity globalizzabile: includi sia hotel-specific che globali.
      // L'override hotel-specific vincera' nel rendering tramite
      // getExistingMapping che cerca prima il match hotel-specific.
      return m.hotel_id === hotelId || m.hotel_id === null || m.hotel_id === undefined
    })
  }

  const getExistingMapping = (entityType: string, pmsCode: string, hotelId?: string | null): Mapping | undefined => {
    const providerMappings = getProviderMappings()
    if (hotelId === null) {
      // Tab globale: solo righe senza hotel_id
      return providerMappings.find((m) => {
        const matchesEntity = m.pms_entity_type === entityType || m.entity_type === entityType
        return matchesEntity && m.pms_code === pmsCode && (m.hotel_id === null || m.hotel_id === undefined)
      })
    }
    if (hotelId) {
      // Tab hotel: priorita' all'override hotel-specific, fallback al globale
      const isHotelLevelEntity = HOTEL_LEVEL_ENTITIES.includes(entityType)
      const hotelOverride = providerMappings.find((m) => {
        const matchesEntity = m.pms_entity_type === entityType || m.entity_type === entityType
        return matchesEntity && m.pms_code === pmsCode && m.hotel_id === hotelId
      })
      if (hotelOverride) return hotelOverride
      if (isHotelLevelEntity) return undefined
      // Fallback al globale per entity globalizzabili
      return providerMappings.find((m) => {
        const matchesEntity = m.pms_entity_type === entityType || m.entity_type === entityType
        return matchesEntity && m.pms_code === pmsCode && (m.hotel_id === null || m.hotel_id === undefined)
      })
    }
    return providerMappings.find((m) => {
      const matchesEntity = m.pms_entity_type === entityType || m.entity_type === entityType
      return matchesEntity && m.pms_code === pmsCode
    })
  }

  const getRmsCodes = (entityType: string, isGlobalContext = true): Array<{ code: string; label: string }> => {
    const result: Array<{ code: string; label: string }> = []
    const addedCodes = new Set<string>()

    // Get provider-filtered mappings
    const providerMappings = getProviderMappings()

    // First add existing mappings for this entity type (from database)
    // Only use mappings that match the context (global vs hotel)
    const entityMappings = providerMappings.filter((m) => {
      const matchesEntity = m.pms_entity_type === entityType || m.entity_type === entityType
      const matchesContext = isGlobalContext ? m.hotel_id === null || m.hotel_id === undefined : m.hotel_id !== null
      return matchesEntity && matchesContext
    })

    entityMappings.forEach((m) => {
      if (m.rms_code && typeof m.rms_code === "string" && !addedCodes.has(m.rms_code)) {
        addedCodes.add(m.rms_code)
        result.push({ code: m.rms_code, label: String(m.rms_label || m.rms_code) })
      }
    })

    // Then add existing mappings from OTHER entity types (to allow reuse)
    // But ONLY if we're in global context AND exclude hotel-level entity types
    if (isGlobalContext) {
      providerMappings.forEach((m) => {
        // Only include global mappings (no hotel_id)
        // AND exclude hotel-level entity types (room_type, rate_plan, etc.)
        const entityType = m.pms_entity_type || m.entity_type
        const isHotelLevelEntity = HOTEL_LEVEL_ENTITIES.includes(entityType)
        // FIX 13/07/2026: escludi anche le sezioni schema (room_api/rate_api).
        // I loro rms_code sono nomi tecnici di colonna (room_type_id, rate_id,
        // rate_name...) validi solo li'; riusarli altrove creava doppioni
        // confusi accanto ai codici concettuali (ID TIPOLOGIA CAMERA, ...).
        const isSchemaEntity = isSchemaMapping(entityType)

        if (
          (m.hotel_id === null || m.hotel_id === undefined) &&
          !isHotelLevelEntity &&
          !isSchemaEntity &&
          m.rms_code &&
          typeof m.rms_code === "string" &&
          !addedCodes.has(m.rms_code)
        ) {
          addedCodes.add(m.rms_code)
          result.push({ code: m.rms_code, label: String(m.rms_label || m.rms_code) })
        }
      })
    }

    // For schema mappings, add SUS schema fields
    if (isSchemaMapping(entityType)) {
      getRmsSchemaFields(entityType).forEach((field) => {
        if (field && field.code && typeof field.code === "string" && !addedCodes.has(field.code)) {
          addedCodes.add(field.code)
          result.push({ code: field.code, label: String(field.label || field.code) })
        }
      })
    } else {
      // Add canonical codes for value mappings
      const canonicalCodes = rmsCanonicalCodes[entityType] || []
      canonicalCodes.forEach((code) => {
        const codeStr = typeof code === "string" ? code : String(code)
        if (!addedCodes.has(codeStr)) {
          addedCodes.add(codeStr)
          result.push({ code: codeStr, label: codeStr })
        }
      })
    }

    return result
  }

  // Check if this is a schema mapping type
  const isSchemaMapping = (entityType: string): boolean => {
    const entityTypeObj = ENTITY_TYPES.find((t) => t.key === entityType)
    return !!entityTypeObj?.isSchemaMapping
  }

  // Open add/edit dialog
  const openDialog = (
    mode: "add" | "edit",
    entityType: string,
    pmsCode: string,
    pmsLabel: string,
    global: boolean,
    existingMapping?: Mapping,
  ) => {
    setDialogMode(mode)
    setCurrentEntityType(entityType)
    setCurrentPmsCode(pmsCode)
    setCurrentPmsLabel(pmsLabel)
    setIsGlobal(global)
    setCurrentRmsCode(existingMapping?.rms_code || "")
    setCurrentMappingId(existingMapping?.id || null)
    setNewCustomCode("")
    setDialogOpen(true)
  }

  // Save mapping
  const handleSaveMapping = async () => {
    const rmsCodeToSave = newCustomCode || currentRmsCode
    if (!rmsCodeToSave) {
      toast.error("Seleziona o inserisci un codice RMS")
      return
    }

    if (!selectedProviderId) {
      toast.error("Provider PMS non selezionato")
      return
    }

    const validMappingsBefore = mappings.filter((m) => m.rms_code && m.rms_code.trim() !== "")
    preSaveSnapshotRef.current = {
      mappingsCount: mappings.length,
      mappingsWithRmsCode: validMappingsBefore.length,
      pmsDataKeys: safeKeys(pmsGlobalData),
      pmsDataItemCount: Object.values(pmsGlobalData || {}).flat().length,
    }

    setIsLoading(true)

    isLocalSaveRef.current = true

    try {
      // BUG 20/05/2026: si stava passando selectedProviderId (uuid)
      // come pms_provider, ma la colonna pms_rms_mappings.pms_provider
      // e' TEXT e tutto il resto del sistema (can_run_etl, GET API,
      // dispatcher pms/*) confronta con il *code* testuale ('brig',
      // 'scidoo'). Cosi' i mapping BRiG salvati erano "fantasma":
      // esistevano in DB ma con pms_provider = uuid e nessuna query li
      // trovava. Ora forziamo il code.
      const payload = {
        pms_provider: selectedProviderCode || selectedProviderId,
        pms_entity_type: currentEntityType,
        pms_code: currentPmsCode,
        pms_label: currentPmsLabel,
        rms_code: rmsCodeToSave,
        hotel_id: isGlobal ? null : selectedHotel || null,
      }

      if (!payload.pms_code || !payload.rms_code || !payload.pms_entity_type) {
        toast.error("Errore: dati mappatura incompleti. Salvataggio bloccato.")
        console.error("[v0] HARDENING BLOCK: payload incompleto", payload)
        setIsLoading(false)
        isLocalSaveRef.current = false
        return
      }

      const isUpdate = dialogMode === "edit" && currentMappingId
      const method = isUpdate ? "PATCH" : "POST"
      const url = isUpdate
        ? `/api/superadmin/connectors/mapping?id=${currentMappingId}`
        : "/api/superadmin/connectors/mapping"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || "Errore nel salvataggio")
      }

      const responseData = await res.json()
      const savedMapping = responseData.mapping || responseData

      if (!savedMapping || !savedMapping.rms_code) {
        toast.error("Errore: risposta server invalida. Mappatura non salvata.")
        console.error("[v0] HARDENING BLOCK: savedMapping invalido", savedMapping)
        setIsLoading(false)
        isLocalSaveRef.current = false
        return
      }

      let newMappings: Mapping[]
      if (isUpdate) {
        newMappings = mappings.map((m) => (m.id === currentMappingId ? { ...m, ...savedMapping } : m))
      } else {
        newMappings = [...mappings, savedMapping]
      }

      const validMappingsAfter = newMappings.filter((m) => m.rms_code && m.rms_code.trim() !== "")
      const postSaveSnapshot = {
        mappingsCount: newMappings.length,
        mappingsWithRmsCode: validMappingsAfter.length,
        pmsDataKeys: safeKeys(pmsGlobalData),
        pmsDataItemCount: Object.values(pmsGlobalData || {}).flat().length,
      }

      // HARDENING: Blocca se il numero di mappature valide diminuisce
      if (preSaveSnapshotRef.current) {
        const pre = preSaveSnapshotRef.current

        // Verifica 1: il numero di mappature non deve MAI diminuire (a meno di DELETE esplicito)
        if (postSaveSnapshot.mappingsCount < pre.mappingsCount) {
          toast.error("ERRORE CRITICO: Rilevata perdita di mappature. Operazione annullata.", {
            icon: <ShieldAlert className="h-5 w-5 text-destructive" />,
            duration: 10000,
          })
          console.error("[v0] HARDENING CRITICAL: mappings count decreased!", {
            before: pre.mappingsCount,
            after: postSaveSnapshot.mappingsCount,
          })
          // NON aggiornare lo state - mantieni i dati originali
          setIsLoading(false)
          isLocalSaveRef.current = false
          preSaveSnapshotRef.current = null
          return
        }

        // Verifica 2: il numero di mappature con rms_code valido non deve diminuire
        if (postSaveSnapshot.mappingsWithRmsCode < pre.mappingsWithRmsCode) {
          toast.error("ERRORE: Rilevata corruzione dati mappature. Operazione annullata.", {
            icon: <ShieldAlert className="h-5 w-5 text-destructive" />,
            duration: 10000,
          })
          console.error("[v0] HARDENING CRITICAL: valid mappings decreased!", {
            before: pre.mappingsWithRmsCode,
            after: postSaveSnapshot.mappingsWithRmsCode,
          })
          setIsLoading(false)
          isLocalSaveRef.current = false
          preSaveSnapshotRef.current = null
          return
        }

        // Verifica 3: i dati PMS non devono sparire
        if (pre.pmsDataItemCount > 0 && postSaveSnapshot.pmsDataItemCount === 0) {
          toast.error("ERRORE: Rilevata perdita dati PMS. Operazione annullata.", {
            icon: <ShieldAlert className="h-5 w-5 text-destructive" />,
            duration: 10000,
          })
          console.error("[v0] HARDENING CRITICAL: PMS data lost!", {
            before: pre.pmsDataItemCount,
            after: postSaveSnapshot.pmsDataItemCount,
          })
          setIsLoading(false)
          isLocalSaveRef.current = false
          preSaveSnapshotRef.current = null
          return
        }
      }

      // Validazioni passate - aggiorna lo state
      setMappings(newMappings)
      prevMappingsLengthRef.current = newMappings.length

      // Parent should update its state but NOT remount this component
      if (onMappingsUpdate) {
        onMappingsUpdate(newMappings)
      }

      toast.success(isUpdate ? "Mappatura aggiornata con successo" : "Mappatura salvata con successo", {
        icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        duration: 5000,
        description: `Codice PMS "${currentPmsCode}" → RMS "${rmsCodeToSave}"`,
      })

      setCurrentPmsCode("")
      setCurrentPmsLabel("")
      setCurrentRmsCode("")
      setCurrentMappingId(null)

      setTimeout(() => {
        setDialogOpen(false)
      }, 300)
    } catch (error) {
      console.error("[v0] Error saving mapping:", error)
      toast.error(error instanceof Error ? error.message : "Errore nel salvataggio")
    } finally {
      setIsLoading(false)
      // Reset after a delay to avoid race conditions
      setTimeout(() => {
        isLocalSaveRef.current = false
        preSaveSnapshotRef.current = null
      }, 500)
    }
  }

  // Delete mapping
  const handleDeleteMapping = async (mappingId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questa mappatura?")) return

    console.log("[v0] handleDeleteMapping - mappingId:", mappingId)
    setIsLoading(true)
    try {
      const res = await fetch(`/api/superadmin/connectors/mapping?id=${mappingId}`, {
        method: "DELETE",
      })

      const data = await res.json().catch(() => ({}))
      console.log("[v0] handleDeleteMapping - response:", res.status, data)

      if (!res.ok) {
        throw new Error(data.error || `Errore ${res.status}`)
      }

      setMappings((prev) => prev.filter((m) => m.id !== mappingId))
      if (onMappingsUpdate) {
        onMappingsUpdate(mappings.filter((m) => m.id !== mappingId))
      }
      toast.success("Mappatura eliminata")
    } catch (error) {
      console.error("[v0] Error deleting mapping:", error)
      toast.error(error instanceof Error ? error.message : "Errore nell'eliminazione")
    } finally {
      setIsLoading(false)
    }
  }

  // State per aggiungere codice PMS manualmente (per GSheets)
  const [addPmsCodeDialog, setAddPmsCodeDialog] = useState(false)
  const [newPmsCode, setNewPmsCode] = useState("")
  const [newPmsLabel, setNewPmsLabel] = useState("")
  const [addPmsEntityType, setAddPmsEntityType] = useState("")

  // Dopo "Scarica Dati Hotel": memorizziamo l'integration_mode reale e i warning
  // ricevuti, in modo che il sottotitolo delle card non parli sempre di "GSheets".
  const [hotelIntegrationMode, setHotelIntegrationMode] = useState<string>("api")
  const [hotelWarnings, setHotelWarnings] = useState<string[]>([])

  // Render entity card
  const renderEntityCard = (
    entityType: { key: string; label: string; critical?: boolean; isSchemaMapping?: boolean },
    isGlobalTab: boolean,
    allowManualAdd = false, // Per GSheets permetti di aggiungere manualmente
  ) => {
    const entityMappings = getMappingsForEntity(entityType.key, isGlobalTab ? null : selectedHotel)
    const pmsItems = isGlobalTab ? pmsGlobalData[entityType.key] || [] : pmsHotelData[entityType.key] || []
    const rmsCodes = getRmsCodes(entityType.key, isGlobalTab)

    // Hide cards without data (unless manual add is allowed)
    if (pmsItems.length === 0 && !allowManualAdd) return null

    return (
      <Card key={entityType.key} id={`entity-section-${entityType.key}`} className="mb-4">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{entityType.label}</CardTitle>
              {entityType.critical && (
                <Badge variant="destructive" className="text-xs text-white">
                  Critico
                </Badge>
              )}
              {entityType.isSchemaMapping && (
                <Badge variant="outline" className="text-xs">
                  Schema
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {entityMappings.length}/{pmsItems.length} mappati
              </Badge>
              {allowManualAdd && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddPmsEntityType(entityType.key)
                    setNewPmsCode("")
                    setNewPmsLabel("")
                    setAddPmsCodeDialog(true)
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Aggiungi Codice
                </Button>
              )}
            </div>
          </div>
          <CardDescription className="text-xs">
            {allowManualAdd && pmsItems.length === 0 ? (
              hotelIntegrationMode === "gsheets" ? (
                <>Modalita GSheets: Aggiungi manualmente i codici {entityType.label.toLowerCase()} dal tuo Google Sheet</>
              ) : hotelWarnings.length > 0 ? (
                <span className="text-yellow-700">
                  PMS API: il provider non ha ritornato {entityType.label.toLowerCase()} per questo hotel.
                  {" "}Verifica le credenziali / property_id, oppure aggiungi manualmente.
                </span>
              ) : (
                <>PMS API: nessun dato ricevuto dal connector. Puoi aggiungere manualmente in attesa.</>
              )
            ) : (
              <>Mappa i {entityType.isSchemaMapping ? "campi" : "valori"} {entityType.label.toLowerCase()} del PMS con quelli RMS</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pmsItems.length === 0 && allowManualAdd ? (
            <div className="text-center py-6 text-muted-foreground">
              <p>Nessun codice PMS disponibile.</p>
              <p className="text-sm mt-1">
                {hotelIntegrationMode === "gsheets"
                  ? `Clicca "Aggiungi Codice" per inserire manualmente i codici dal tuo Google Sheet.`
                  : `Il PMS non ha ritornato dati per questa entita. Clicca "Aggiungi Codice" per inserirli manualmente.`}
              </p>
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Codice PMS</TableHead>
                <TableHead className="w-1/3">Etichetta</TableHead>
                <TableHead className="w-1/4">Codice RMS</TableHead>
                <TableHead className="w-auto text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pmsItems.map((item) => {
                const existingMapping = getExistingMapping(
                  entityType.key,
                  item.code,
                  isGlobalTab ? null : selectedHotel,
                )
                return (
                  <TableRow key={item.code}>
                    <TableCell className="font-mono text-sm">{item.code}</TableCell>
                    <TableCell>{item.label}</TableCell>
                    <TableCell>
                      {existingMapping ? (
                        <Badge variant="default" className="bg-green-600">
                          {existingMapping.rms_code}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Non mappato
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {existingMapping ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              openDialog("edit", entityType.key, item.code, item.label, isGlobalTab, existingMapping)
                            }
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => existingMapping.id && handleDeleteMapping(existingMapping.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDialog("add", entityType.key, item.code, item.label, isGlobalTab)}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Mappa
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    )
  }

  // Handler per aggiungere codice PMS manualmente (per GSheets)
  const handleAddManualPmsCode = async () => {
    if (!newPmsCode.trim()) {
      toast.error("Inserisci un codice PMS")
      return
    }
    if (!selectedHotel) {
      toast.error("Seleziona prima un hotel")
      return
    }
    if (!selectedProviderId) {
      toast.error("Provider non selezionato")
      return
    }

    setIsLoading(true)
    try {
      // Salva la mappatura con rms_code uguale al pms_code come default.
      // Stesso bug di sopra: pms_provider deve essere il code testuale,
      // non l'UUID, altrimenti can_run_etl non vede nulla e il binding
      // resta non attivabile.
      const payload = {
        pms_provider: selectedProviderCode || selectedProviderId,
        pms_entity_type: addPmsEntityType,
        pms_code: newPmsCode.trim(),
        pms_label: newPmsLabel.trim() || newPmsCode.trim(),
        rms_code: newPmsCode.trim(), // Default: stesso codice
        hotel_id: selectedHotel,
      }

      const res = await fetch("/api/superadmin/connectors/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Errore nel salvataggio")
      }

      const { mapping } = await res.json()
      
      // Aggiorna lo stato locale
      setMappings((prev) => [...prev, mapping])
      if (onMappingsUpdate) {
        onMappingsUpdate([...mappings, mapping])
      }

      // Aggiorna anche i dati PMS hotel per mostrare il nuovo codice
      if (onPmsHotelDataUpdate) {
        const currentItems = pmsHotelData[addPmsEntityType] || []
        const newItem = { code: newPmsCode.trim(), label: newPmsLabel.trim() || newPmsCode.trim() }
        if (!currentItems.find((i: any) => i.code === newItem.code)) {
          onPmsHotelDataUpdate({
            ...pmsHotelData,
            [addPmsEntityType]: [...currentItems, newItem],
          })
        }
      }

      toast.success(`Codice ${newPmsCode} aggiunto e mappato`)
      setAddPmsCodeDialog(false)
      setNewPmsCode("")
      setNewPmsLabel("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nel salvataggio")
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate entities with missing mappings
  // FIX 15/07/2026: il confronto era scope-incoerente: contava SOLO le
  // mappature GLOBALI (hotelId=null) ma le confrontava con i dati PMS di
  // QUALSIASI scope (globale O hotel). Risultato: hotel con room_type/
  // rate_plan mappati al 100% a livello hotel (l'unico livello corretto
  // per quelle entita') mostravano comunque il banner rosso "Mancano
  // mappature". Ora ogni scope e' confrontato con le SUE mappature.
  const entitiesWithMissingMappings = useMemo(() => {
    const allCriticalTypes = ENTITY_TYPES.filter((t) => t.critical)
    return allCriticalTypes
      .filter((et) => {
        const globalItems = pmsGlobalData[et.key] || []
        const hotelItems = pmsHotelData[et.key] || []
        // Scope globale: dati globali vs mappature globali
        if (globalItems.length > 0) {
          const globalMappings = getMappingsForEntity(et.key, null)
          if (globalMappings.length < globalItems.length) return true
        }
        // Scope hotel: dati hotel vs mappature dell'hotel selezionato
        if (hotelItems.length > 0 && selectedHotel) {
          const hotelMappings = getMappingsForEntity(et.key, selectedHotel)
          if (hotelMappings.length < hotelItems.length) return true
        }
        return false
      })
      .map((et) => et.key)
  }, [mappings, pmsGlobalData, pmsHotelData, selectedHotel])

  useEffect(() => {
    // Skip if this is a local save - we already have the updated mappings
    if (isLocalSaveRef.current) {
      isLocalSaveRef.current = false
      return
    }

    // Only update if the count actually changed (new data from server)
    if (initialMappings?.length !== prevMappingsLengthRef.current) {
      setMappings(initialMappings || [])
      prevMappingsLengthRef.current = initialMappings?.length || 0
    }
  }, [initialMappings])

  return (
    <div className="space-y-4">
      {/* Warning for missing critical mappings */}
      {entitiesWithMissingMappings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Attenzione: Mancano mappature per le entità critiche: {entitiesWithMissingMappings.join(", ")}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pms-config">Configurazione PMS</TabsTrigger>
          <TabsTrigger value="hotel-config">Configurazione Hotel</TabsTrigger>
        </TabsList>

        {/* Tab: PMS Config (Global) */}
        <TabsContent value="pms-config" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Mappature globali valide per tutte le strutture collegate a {selectedProvider?.name || "questo PMS"}
            </p>
            <Button
              onClick={async () => {
                try {
                  await handleDownloadPmsData(
                    true,
                    selectedProvider,
                    setIsLoading,
                    onPmsGlobalDataUpdate || (() => {}),
                    onPmsHotelDataUpdate || (() => {}),
                  )
                } catch (err) {
                  toast.error("Errore imprevisto: " + (err instanceof Error ? err.message : String(err)))
                  setIsLoading(false)
                }
              }}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Scarica Dati PMS Globali
            </Button>
          </div>

          {safeKeys(pmsGlobalData).length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <p>Nessun dato PMS caricato. Clicca "Scarica Dati PMS Globali" per iniziare.</p>
            </Card>
          ) : (
            // Iterate over actual data keys from API, not fixed ENTITY_TYPES
            safeKeys(pmsGlobalData).map((key) => {
              // Find matching entity type definition or create one dynamically
              const entityType = GLOBAL_VALUE_TYPES.find((et) => et.key === key) ||
                ENTITY_TYPES.find((et) => et.key === key) ||
                { key, label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }
              return renderEntityCard(entityType, true)
            })
          )}
        </TabsContent>

        {/* Tab: Hotel Config */}
        <TabsContent value="hotel-config" className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            <Select value={selectedHotel} onValueChange={(val) => {
              console.log("[v0] Hotel selezionato:", val)
              setSelectedHotel(val)
            }}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Seleziona una struttura..." />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={async () => {
                console.log("[v0] Scarica Dati Hotel clicked!", { 
                  selectedHotel, 
                  selectedProvider: selectedProvider?.name,
                  selectedProviderId,
                  pmsProvidersCount: pmsProviders.length
                })
                if (!selectedHotel) {
                  toast.error("Seleziona prima una struttura dal menu a tendina")
                  return
                }
                if (!selectedProvider) {
                  toast.error("Nessun PMS selezionato - seleziona prima un PMS dalla lista principale")
                  return
                }
                try {
                  await handleDownloadPmsData(
                    false,
                    selectedProvider,
                    setIsLoading,
                    onPmsGlobalDataUpdate || (() => {}),
                    onPmsHotelDataUpdate || (() => {}),
                    selectedHotel,
                    setHotelIntegrationMode,
                    setHotelWarnings,
                  )
                } catch (err) {
                  console.error("[v0] Scarica Dati Hotel error:", err)
                  toast.error("Errore imprevisto: " + (err instanceof Error ? err.message : String(err)))
                  setIsLoading(false)
                }
              }}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Scarica Dati Hotel
            </Button>
          </div>



          {!selectedHotel ? (
            <Card className="p-8 text-center text-muted-foreground">
              <p>Seleziona una struttura per visualizzare le mappature specifiche.</p>
            </Card>
          ) : safeKeys(pmsHotelData).length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <p>Nessun dato hotel caricato. Clicca "Scarica Dati Hotel" per iniziare.</p>
            </Card>
          ) : (
            <>
              {hotelWarnings.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-yellow-800">
                        Attenzione: il connector PMS ha segnalato {hotelWarnings.length}{" "}
                        {hotelWarnings.length === 1 ? "problema" : "problemi"} durante lo scarico
                      </p>
                      <ul className="text-xs text-yellow-700 list-disc pl-4 space-y-0.5">
                        {hotelWarnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              {/* Iterate over actual hotel data keys, showing only hotel-specific entities */}
              {/* Per GSheets, mostra sempre le entity types critiche anche se vuote */}
              {HOTEL_ENTITY_TYPES.filter(
                (et) => safeKeys(pmsHotelData).includes(et.key) || et.critical,
              ).map((entityType) => {
                // allowManualAdd=true per permettere inserimento manuale (GSheets o fallback API)
                return renderEntityCard(entityType, false, true)
              })}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog for mapping */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{dialogMode === "add" ? "Aggiungi" : "Modifica"} Mappatura</DialogTitle>
            <DialogDescription>
              Mappa il codice PMS "{currentPmsCode}" ({currentPmsLabel}) a un codice RMS
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Codice PMS</Label>
              <Input value={currentPmsCode} disabled />
            </div>

            <div className="grid gap-2">
              <Label>Seleziona Codice RMS</Label>
              <Select value={currentRmsCode} onValueChange={setCurrentRmsCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona codice RMS..." />
                </SelectTrigger>
                <SelectContent>
                  {getRmsCodes(currentEntityType).map((rmsCode, index) => {
                    const codeValue =
                      typeof rmsCode.code === "string" ? rmsCode.code : String(rmsCode.code || `item-${index}`)
                    const labelValue =
                      typeof rmsCode.label === "string" ? rmsCode.label : String(rmsCode.label || codeValue)
                    return (
                      <SelectItem key={codeValue} value={codeValue}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{codeValue}</span>
                          {labelValue !== codeValue && <span className="text-muted-foreground">- {labelValue}</span>}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Oppure crea codice personalizzato</Label>
              <Input
                placeholder="Inserisci nuovo codice RMS..."
                value={newCustomCode}
                onChange={(e) => setNewCustomCode(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSaveMapping}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog per aggiungere codice PMS manualmente (GSheets) */}
      <Dialog open={addPmsCodeDialog} onOpenChange={setAddPmsCodeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi Codice PMS</DialogTitle>
            <DialogDescription>
              Inserisci un codice {addPmsEntityType === "room_type" ? "tipologia camera" : addPmsEntityType === "rate_plan" ? "piano tariffario" : addPmsEntityType} dal tuo Google Sheet
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Codice PMS *</Label>
              <Input 
                placeholder="Es: DOUBLE, SUITE, BB..."
                value={newPmsCode}
                onChange={(e) => setNewPmsCode(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Etichetta (opzionale)</Label>
              <Input 
                placeholder="Es: Camera Doppia, Suite Deluxe..."
                value={newPmsLabel}
                onChange={(e) => setNewPmsLabel(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPmsCodeDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleAddManualPmsCode} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Aggiungi e Mappa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
