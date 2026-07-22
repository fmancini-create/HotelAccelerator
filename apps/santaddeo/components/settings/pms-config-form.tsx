"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileSpreadsheet,
  Wifi,
  Lock,
  ArrowRight,
  ArrowLeft,
  Eye,
  MapPin,
  Save,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Upload,
  Zap,
  Settings,
} from "lucide-react"
import type { IntegrationMode } from "@/lib/types/database"
import { PMS_CONFIGS } from "@/lib/types/pms"
import type { PMSName } from "@/lib/types/database"

const PMS_LABELS: Record<string, string> = {
  scidoo: "Scidoo",
  ericsoft_suite_4: "Ericsoft Suite 4",
  bedzzle: "Bedzzle",
  beddzle: "Beddzle",
  hotel_cinquestelle: "Hotel Cinquestelle",
  room_cloud: "RoomCloud",
  clock_software: "Clock Software",
  wubook: "Wubook",
  hotelappz: "HotelAppz",
  slope: "Slope",
  hoteltime: "HotelTime",
  roomkeys: "RoomKeys",
  passepartout_welcome: "Passepartout Welcome",
  hotel_2000: "Hotel 2000",
  fidelio_suite8: "Fidelio Suite 8",
  hotel_2000_evolution: "Hotel 2000 Evolution",
  hotelcube_smart: "HotelCube Smart",
  leonardo: "Leonardo",
  nuconga: "Nuconga",
  cloud_hotel: "Cloud Hotel",
  ericsoft_suite_3: "Ericsoft Hotel Suite 3",
}

// Data categories we need to map from the spreadsheet
const DATA_CATEGORIES: DataCategory[] = [
  {
    id: "produzione",
    label: "Produzione (Ricavi)",
    description: "Dati di produzione giornaliera: ricavi, revenue per camera, ecc.",
    type: "standard",
    matchKeywords: ["produzione", "revenue", "ricavi", "production", "fatturato"],
    requiredFields: [
      { key: "data", label: "Data", required: true, matchKeywords: ["date", "data", "giorno"] },
      { key: "ricavo_totale", label: "Ricavo totale", required: true, matchKeywords: ["ricavo", "revenue", "totale", "total"] },
      { key: "ricavo_camere", label: "Ricavo camere", required: false, matchKeywords: ["room revenue", "ricavo camere"] },
      { key: "adr", label: "ADR (prezzo medio)", required: false, matchKeywords: ["adr", "average daily rate", "prezzo medio"] },
      { key: "revpar", label: "RevPAR", required: false, matchKeywords: ["revpar"] },
    ],
  },
  {
    id: "disponibilita",
    label: "Disponibilita",
    description: "Camere disponibili per data, camere totali, fuori servizio.",
    type: "standard",
    matchKeywords: ["disponibilita", "availability", "available", "inventory"],
    requiredFields: [
      { key: "data", label: "Data", required: true, matchKeywords: ["date", "data", "giorno"] },
      { key: "camere_disponibili", label: "Camere disponibili", required: true, matchKeywords: ["disponibil", "available", "free"] },
      { key: "camere_totali", label: "Camere totali", required: false, matchKeywords: ["totali", "total rooms"] },
      { key: "camere_fuori_servizio", label: "Camere fuori servizio", required: false, matchKeywords: ["fuori servizio", "out of order", "oos"] },
    ],
  },
  {
    id: "camere_vendute",
    label: "Camere Vendute",
    description: "Numero di camere vendute per data e occupancy.",
    type: "standard",
    matchKeywords: ["vendute", "sold", "occupancy", "occupazione"],
    requiredFields: [
      { key: "data", label: "Data", required: true, matchKeywords: ["date", "data", "giorno"] },
      { key: "camere_vendute", label: "Camere vendute", required: true, matchKeywords: ["vendute", "sold", "rooms sold"] },
      { key: "occupancy_perc", label: "Occupancy %", required: false, matchKeywords: ["occupancy", "occ%", "occupazione"] },
    ],
  },
  {
    id: "produzione_fiscale",
    label: "Produzione Fiscale",
    description: "Dati fiscali: corrispettivi, fatture, IVA.",
    type: "standard",
    matchKeywords: ["fiscale", "fiscal", "iva", "fattura", "corrispettivo"],
    requiredFields: [
      { key: "data", label: "Data", required: true, matchKeywords: ["date", "data", "giorno"] },
      { key: "ricavo_fiscale", label: "Ricavo fiscale (IVA inclusa)", required: true, matchKeywords: ["fiscale", "iva inclusa", "lordo"] },
      { key: "ricavo_netto", label: "Ricavo netto (IVA esclusa)", required: false, matchKeywords: ["netto", "iva esclusa", "net"] },
      { key: "tipo_documento", label: "Tipo documento", required: false, matchKeywords: ["tipo", "document", "fattura", "corrispettivo"] },
    ],
  },
  {
    id: "prenotazioni",
    label: "Prenotazioni",
    description: "Dettaglio prenotazioni: check-in, check-out, ospiti, canale, prezzo.",
    type: "standard",
    matchKeywords: ["prenotazion", "reservation", "booking", "check-in"],
    requiredFields: [
      { key: "id_prenotazione", label: "ID Prenotazione", required: false, matchKeywords: ["id", "booking id", "reservation"] },
      { key: "check_in", label: "Data Check-in", required: true, matchKeywords: ["check-in", "checkin", "arrivo", "arrival"] },
      { key: "check_out", label: "Data Check-out", required: true, matchKeywords: ["check-out", "checkout", "partenza", "departure"] },
      { key: "nome_ospite", label: "Nome ospite", required: false, matchKeywords: ["nome", "guest", "ospite", "name"] },
      { key: "camera", label: "Camera / Tipo camera", required: false, matchKeywords: ["camera", "room", "tipo camera", "room type"] },
      { key: "canale", label: "Canale", required: false, matchKeywords: ["canale", "channel", "source", "booking.com", "airbnb"] },
      { key: "prezzo_totale", label: "Prezzo totale", required: true, matchKeywords: ["prezzo", "price", "total", "importo", "amount"] },
      { key: "num_ospiti", label: "Numero ospiti", required: false, matchKeywords: ["ospiti", "guests", "pax", "persone"] },
      { key: "stato", label: "Stato", required: false, matchKeywords: ["stato", "status", "confermata", "cancellata"] },
    ],
  },
  {
    id: "tariffe_mappa",
    label: "Mappa Tariffe/Camere",
    description: "Anagrafica tariffe: combinazioni camera+tariffa con codici, occupazione, tipo.",
    type: "standard",
    matchKeywords: ["rooms-rates-map", "rate", "tariffa", "rette", "room-rate", "anagrafica"],
    requiredFields: [
      { key: "room_id", label: "ID Camera (ROOM-ID)", required: true, matchKeywords: ["room-id", "room_id", "id camera", "cod camera"] },
      { key: "room_name", label: "Nome Camera (ROOM-NAME)", required: true, matchKeywords: ["room-name", "room_name", "nome camera", "camera"] },
      { key: "rate_id", label: "ID Tariffa (RATE-ID)", required: true, matchKeywords: ["rate-id", "rate_id", "id tariffa", "cod tariffa"] },
      { key: "rate_name", label: "Nome Tariffa (RATE-NAME)", required: true, matchKeywords: ["rate-name", "rate_name", "nome tariffa", "tariffa"] },
      { key: "rate_code", label: "Codice Tariffa (RATE-CODE)", required: false, matchKeywords: ["rate-code", "rate_code", "codice tariffa"] },
      { key: "rate_pax", label: "Occupazione (RATE-PAX)", required: false, matchKeywords: ["rate-pax", "pax", "occupazione", "persone", "occupancy"] },
      { key: "not_refundable", label: "Non Rimborsabile", required: false, matchKeywords: ["not-refundable", "not_refundable", "non rimborsabile", "nr"] },
      { key: "rate_type", label: "Tipo Tariffa (RATE-TYPE)", required: false, matchKeywords: ["rate-type", "rate_type", "tipo tariffa", "bb", "ro"] },
      { key: "base_price", label: "Prezzo Base", required: false, matchKeywords: ["base-price", "base_price", "prezzo base", "rack"] },
      { key: "show_on_pms", label: "Visibile PMS", required: false, matchKeywords: ["show-on-pms", "pms"] },
      { key: "show_on_web", label: "Visibile Web", required: false, matchKeywords: ["show-on-web", "web"] },
      { key: "show_on_chm", label: "Visibile Channel", required: false, matchKeywords: ["show-on-chm", "channel", "chm"] },
      { key: "deleted", label: "Eliminata", required: false, matchKeywords: ["deleted", "eliminat", "cancellat"] },
    ],
  },
  {
    id: "prezzi_matrice",
    label: "Matrice Prezzi (Lettura/Scrittura)",
    description: "Foglio prezzi con struttura multi-colonna: ogni colonna = una combinazione camera+tariffa, righe = date con prezzi.",
    type: "matrix",
    matchKeywords: ["prezzi", "price", "gestione prezzi", "bedzzle rms", "rms"],
    requiredFields: [],
  },
  {
    id: "rooms_production",
    label: "Produzione per Tipologia Camera",
    description: "Ricavi giornalieri suddivisi per ogni tipologia di camera (formato PIVOT: righe=date, colonne=tipologie).",
    type: "standard",
    matchKeywords: ["rooms-production", "room production", "produzione camere", "revenue per room", "bzl-rooms-production"],
    requiredFields: [
      { key: "data", label: "Data", required: true, matchKeywords: ["date", "data", "giorno"] },
    ],
    supportsPivotRoomTypes: true,
  },
  {
    id: "rooms_occupancy",
    label: "Occupancy per Tipologia Camera",
    description: "Occupancy giornaliera suddivisa per ogni tipologia di camera (formato PIVOT: righe=date, colonne=tipologie).",
    type: "standard",
    matchKeywords: ["rooms-occupancy", "room occupancy", "occupancy per room", "bzl-rooms-occupancy", "camere occupate"],
    requiredFields: [
      { key: "data", label: "Data", required: true, matchKeywords: ["date", "data", "giorno"] },
    ],
    supportsPivotRoomTypes: true,
  },
]

type DataCategory = {
  id: string
  label: string
  description: string
  type: "standard" | "matrix"
  matchKeywords: string[]
  requiredFields: { key: string; label: string; required: boolean; matchKeywords: string[] }[]
  supportsPivotRoomTypes?: boolean // Se true, supporta mappatura colonne -> room types
}

type SheetTab = {
  title: string
  headers: string[]
  sampleRows: string[][]
  headerRowIndex?: number | null
  allRows?: string[][] // For matrix analysis (first N rows)
}

type AutoProposal = {
  categoryId: string
  tabTitle: string
  confidence: number // 0-1
  columnMatches: Record<string, { header: string; confidence: number }>
  isMatrix?: boolean
  matrixMeta?: {
    codeRow: number | null // row with "XXXX:YYYY" pattern
    nameRow: number | null // row with room names
    paxRow: number | null  // row with PAX values
    treatmentRow: number | null // row with RO, BB, RO-NR etc.
    dateCol: string | null // column with dates
    dataStartRow: number | null // where price data begins
    rateColumns: { col: number; code: string; roomName: string; pax: string; treatment: string }[]
  }
}

// === AUTO-MATCH ENGINE ===
function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[-_\s]+/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function matchScore(header: string, keywords: string[]): number {
  const h = normalizeStr(header)
  for (const kw of keywords) {
    const k = normalizeStr(kw)
    if (h === k) return 1.0
    if (h.includes(k) || k.includes(h)) return 0.8
  }
  return 0
}

function autoMatchTabToCategory(tab: SheetTab): AutoProposal | null {
  const titleNorm = normalizeStr(tab.title)
  let bestCat: DataCategory | null = null
  let bestScore = 0

  for (const cat of DATA_CATEGORIES) {
    for (const kw of cat.matchKeywords) {
      const score = titleNorm.includes(normalizeStr(kw)) ? 0.9 : 0
      if (score > bestScore) {
        bestScore = score
        bestCat = cat
      }
    }
    // Also check if headers match this category well
    if (tab.headers.length > 0 && cat.requiredFields.length > 0) {
      let headerMatchCount = 0
      for (const field of cat.requiredFields) {
        for (const h of tab.headers) {
          if (matchScore(h, field.matchKeywords) >= 0.7) {
            headerMatchCount++
            break
          }
        }
      }
      const headerScore = headerMatchCount / Math.max(cat.requiredFields.filter(f => f.required).length, 1)
      if (headerScore > bestScore) {
        bestScore = headerScore
        bestCat = cat
      }
    }
  }

  if (!bestCat || bestScore < 0.3) return null

  // For standard categories, auto-match columns
  const columnMatches: Record<string, { header: string; confidence: number }> = {}
  if (bestCat.type === "standard") {
    for (const field of bestCat.requiredFields) {
      let bestH = ""
      let bestHScore = 0
      for (const h of tab.headers) {
        const s = matchScore(h, field.matchKeywords)
        if (s > bestHScore) {
          bestHScore = s
          bestH = h
        }
      }
      if (bestHScore >= 0.5) {
        columnMatches[field.key] = { header: bestH, confidence: bestHScore }
      }
    }
  }

  return {
    categoryId: bestCat.id,
    tabTitle: tab.title,
    confidence: bestScore,
    columnMatches,
    isMatrix: bestCat.type === "matrix",
  }
}

function autoAnalyzeMatrix(tab: SheetTab): AutoProposal["matrixMeta"] {
  const rows = tab.allRows || tab.sampleRows || []
  if (rows.length < 7) return undefined

  let codeRow: number | null = null
  let nameRow: number | null = null
  let paxRow: number | null = null
  let treatmentRow: number | null = null
  let dataStartRow: number | null = null

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] || []
    const cells = row.slice(2) // skip A,B columns
    if (cells.length === 0) continue

    const nonEmpty = cells.filter(c => c && String(c).trim())
    if (nonEmpty.length === 0) continue

    // Check for code pattern "XXXX:YYYY"
    const codePattern = nonEmpty.filter(c => /^\d{3,}:\d{3,}$/.test(String(c).trim()))
    if (codePattern.length > nonEmpty.length * 0.3) {
      codeRow = i + 1 // 1-based
      continue
    }

    // Check for PAX pattern
    const paxPattern = nonEmpty.filter(c => /^PAX\s*\d/i.test(String(c).trim()) || /^\d$/.test(String(c).trim()))
    if (paxPattern.length > nonEmpty.length * 0.4) {
      paxRow = i + 1
      continue
    }

    // Check for treatment pattern (RO, BB, RO-NR, HB, etc.)
    const treatmentPattern = nonEmpty.filter(c => /^(RO|BB|HB|FB|AI|RO-NR|BB-NR|HB-NR)$/i.test(String(c).trim()))
    if (treatmentPattern.length > nonEmpty.length * 0.3) {
      treatmentRow = i + 1
      continue
    }

    // Check for room names (repeated strings like "Appartamento Ciliegio")
    const uniqueNames = new Set(nonEmpty.map(c => String(c).trim()))
    if (uniqueNames.size < nonEmpty.length * 0.5 && uniqueNames.size > 0 && !nameRow) {
      nameRow = i + 1
      continue
    }

    // Check for date pattern (YYYY-MM-DD or DATE header)
    const datePattern = nonEmpty.filter(c => /^\d{4}-\d{2}-\d{2}/.test(String(c).trim()))
    if (datePattern.length > 0 || /date/i.test(String(row[0] || ""))) {
      dataStartRow = i + 1
      break
    }
  }

  // Extract rate columns from code row
  const rateColumns: { col: number; code: string; roomName: string; pax: string; treatment: string }[] = []
  if (codeRow && rows[codeRow - 1]) {
    const codeRowData = rows[codeRow - 1]
    for (let col = 2; col < codeRowData.length; col++) {
      const code = String(codeRowData[col] || "").trim()
      if (/^\d{3,}:\d{3,}$/.test(code)) {
        rateColumns.push({
          col,
          code,
          roomName: nameRow ? String((rows[nameRow - 1] || [])[col] || "").trim() : "",
          pax: paxRow ? String((rows[paxRow - 1] || [])[col] || "").trim() : "",
          treatment: treatmentRow ? String((rows[treatmentRow - 1] || [])[col] || "").trim() : "",
        })
      }
    }
  }

  return {
    codeRow,
    nameRow,
    paxRow,
    treatmentRow,
    dateCol: "A",
    dataStartRow,
    rateColumns,
  }
}

function generateAutoProposals(tabs: SheetTab[]): AutoProposal[] {
  const proposals: AutoProposal[] = []
  const usedCategories = new Set<string>()

  // First pass: match by tab name
  for (const tab of tabs) {
    const match = autoMatchTabToCategory(tab)
    if (match && !usedCategories.has(match.categoryId)) {
      if (match.isMatrix) {
        match.matrixMeta = autoAnalyzeMatrix(tab)
      }
      proposals.push(match)
      usedCategories.add(match.categoryId)
    }
  }

  return proposals
}

type CategoryMapping = {
  enabled: boolean
  sheetTab: string
  orientation: "rows_dates" | "cols_dates"
  columnMap: Record<string, string>
  matrixMeta?: AutoProposal["matrixMeta"]
}

interface PMSConfigFormProps {
  hotelId: string
  pmsName: string
  existingConfig?: any
  readOnly?: boolean
}

export function PMSConfigForm({ hotelId, pmsName, existingConfig, readOnly = false }: PMSConfigFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const pmsConfig = PMS_CONFIGS[pmsName as PMSName]
  const supportsGSheets = pmsConfig?.supportsGSheets ?? true // Default to true for all PMS

  const [integrationMode, setIntegrationMode] = useState<IntegrationMode>(
    existingConfig?.integration_mode || "api"
  )

  const [config, setConfig] = useState(() => {
    const url = existingConfig?.gsheet_spreadsheet_url || ""
    // Always extract ID from URL as fallback (in case gsheet_spreadsheet_id was never saved)
    const idFromUrl = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || ""
    return {
      apiKey: existingConfig?.api_key || "",
      endpointUrl: existingConfig?.endpoint_url || (pmsName === "scidoo" ? "https://www.scidoo.com/api/v1" : ""),
      vatNumber: existingConfig?.vat_number || "",
      propertyId: existingConfig?.property_id || "",
      isActive: existingConfig?.is_active ?? true,
      gsheetSpreadsheetUrl: url,
      gsheetSpreadsheetId: existingConfig?.gsheet_spreadsheet_id || idFromUrl,
    }
  })

  // === GOOGLE SHEETS WIZARD STATE ===
  const [gsWizardStep, setGsWizardStep] = useState<"source" | "proposals" | "mapping" | "summary">("source")
  const [dataSource, setDataSource] = useState<"url" | "upload">("url")
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredTabs, setDiscoveredTabs] = useState<SheetTab[]>([])
  const [expandedTab, setExpandedTab] = useState<string | null>(null)
  const [autoProposals, setAutoProposals] = useState<AutoProposal[]>([])
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [categoryMappings, setCategoryMappings] = useState<Record<string, CategoryMapping>>(() => {
    // Initialize from existing config if available, with safe defaults
    const saved = existingConfig?.config?.gsheets_mapping
    const initial: Record<string, CategoryMapping> = {}
    
    // Always initialize all categories with defaults
    DATA_CATEGORIES.forEach((cat) => {
      const savedCat = saved?.[cat.id]
      initial[cat.id] = {
        enabled: savedCat?.enabled ?? false,
        sheetTab: savedCat?.sheetTab ?? "",
        orientation: savedCat?.orientation ?? "rows_dates",
        columnMap: savedCat?.columnMap ?? {},
        matrixMeta: savedCat?.matrixMeta,
      }
    })
    return initial
  })
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0)
  const [hotelRoomTypes, setHotelRoomTypes] = useState<{id: string; name: string; total_rooms: number}[]>([])

  // 19/05/2026: precompila endpointUrl dal catalogo globale pms_providers
  // se l'hotel non ha gia' un valore esplicito. Cosi quando il super admin
  // imposta una sola volta "URL Base API" su /superadmin/connectors-mapping
  // tutti gli hotel che attivano lo stesso PMS lo ereditano automaticamente.
  // Bug pre-fix: l'utente doveva sempre re-incollare l'URL nel dialog hotel.
  useEffect(() => {
    if (!pmsName) return
    if (config.endpointUrl && config.endpointUrl.length > 0) return // override esistente, non toccare
    let cancelled = false
    fetch(`/api/settings/pms-config?pmsName=${encodeURIComponent(pmsName)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data?.defaultEndpointUrl) {
          setConfig((prev) => (prev.endpointUrl ? prev : { ...prev, endpointUrl: data.defaultEndpointUrl }))
        }
      })
      .catch((err) => console.error("[v0] Error loading provider default URL:", err))
    return () => { cancelled = true }
  }, [pmsName])

  // Load room types for pivot categories
  useEffect(() => {
    fetch(`/api/settings/room-types?hotelId=${hotelId}`)
      .then(res => res.json())
      .then(data => {
        console.log("[v0] Room types loaded:", data.roomTypes?.length, data.roomTypes?.map((rt: any) => rt?.name))
        const validRoomTypes = (data.roomTypes || []).filter((rt: {is_active?: boolean; name?: string}) => rt && rt.name && rt.is_active !== false)
        setHotelRoomTypes(validRoomTypes)
      })
      .catch((err) => console.error("[v0] Error loading room types:", err))
  }, [hotelId])

  // Restore wizard step if we already have discovered tabs in config
  useEffect(() => {
    if (existingConfig?.config?.gsheets_discovered_tabs && integrationMode === "gsheets") {
      setDiscoveredTabs(existingConfig.config.gsheets_discovered_tabs)
      if (existingConfig.config.gsheets_mapping) {
        setGsWizardStep("summary")
      } else {
        const proposals = generateAutoProposals(existingConfig.config.gsheets_discovered_tabs)
        setAutoProposals(proposals)
        setGsWizardStep("proposals")
      }
    }
  }, [existingConfig, integrationMode])

  const pmsLabel = PMS_LABELS[pmsName] || pmsName

  const extractSpreadsheetId = (url: string): string => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return match ? match[1] : ""
  }

  const handleGSheetUrlChange = (url: string) => {
    const id = extractSpreadsheetId(url)
    setConfig({ ...config, gsheetSpreadsheetUrl: url, gsheetSpreadsheetId: id })
    // Reset wizard when URL changes
    setGsWizardStep("source")
    setDiscoveredTabs([])
    setAutoProposals([])
  }

  // === DISCOVER: connect to sheet and read tabs + headers ===
  const handleDiscover = async () => {
    console.log("[v0] handleDiscover called, spreadsheetId:", config.gsheetSpreadsheetId, "url:", config.gsheetSpreadsheetUrl)
    if (!config.gsheetSpreadsheetId) {
      setError("Inserisci l'URL del foglio Google prima di procedere")
      return
    }

    setIsDiscovering(true)
    setError(null)
    setSuccess(null)

    try {
      console.log("[v0] Calling /api/gsheets/discover with URL:", config.gsheetSpreadsheetUrl)
      const res = await fetch("/api/gsheets/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetUrl: config.gsheetSpreadsheetUrl }),
      })
      console.log("[v0] discover fetch completed, status:", res.status)

      const text = await res.text()
      console.log("[v0] discover raw response:", text.substring(0, 300))

      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error("Risposta non valida dal server: " + text.substring(0, 100))
      }

      if (!res.ok) {
        throw new Error(data.error || "Errore nella connessione al foglio Google")
      }

      // Map API response fields (name -> title, previewRows -> sampleRows)
      const mappedTabs: SheetTab[] = (data.tabs || []).map((t: any) => ({
        title: t.name || t.title || "Senza nome",
        headers: Array.isArray(t.headers) ? t.headers : [],
        sampleRows: Array.isArray(t.previewRows) ? t.previewRows : Array.isArray(t.sampleRows) ? t.sampleRows : [],
        headerRowIndex: t.headerRowIndex ?? null,
        allRows: Array.isArray(t.allRows) ? t.allRows : undefined,
      }))
      setDiscoveredTabs(mappedTabs)

      // Generate auto-proposals
      const proposals = generateAutoProposals(mappedTabs)
      setAutoProposals(proposals)

      // Apply auto-proposals to category mappings
      const newMappings = { ...categoryMappings }
      for (const p of proposals) {
        newMappings[p.categoryId] = {
          enabled: true,
          sheetTab: p.tabTitle,
          orientation: "rows_dates",
          columnMap: Object.fromEntries(
            Object.entries(p.columnMatches || {}).map(([k, v]) => [k, v?.header || ""])
          ),
          matrixMeta: p.matrixMeta,
        }
      }
      setCategoryMappings(newMappings)

      setSuccess(`Analisi completata! Trovati ${mappedTabs.length} fogli, ${proposals.length} categorie auto-rilevate.`)
      setGsWizardStep("proposals")
    } catch (err) {
      console.error("[v0] discover error:", err)
      setError(err instanceof Error ? err.message : "Errore di connessione")
    } finally {
      setIsDiscovering(false)
    }
  }

  // === SAVE ===
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const gsheetsConfig = integrationMode === "gsheets"
        ? {
            gsheets_mapping: categoryMappings,
            gsheets_discovered_tabs: discoveredTabs,
          }
        : null

      const res = await fetch("/api/settings/pms-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          pmsName,
          integrationMode,
          apiKey: integrationMode === "api" ? config.apiKey : null,
          endpointUrl: integrationMode === "api" ? config.endpointUrl : null,
          vatNumber: config.vatNumber,
          propertyId: config.propertyId,
          isActive: config.isActive,
          gsheetSpreadsheetId: integrationMode === "gsheets" ? config.gsheetSpreadsheetId : null,
          gsheetSpreadsheetUrl: integrationMode === "gsheets" ? config.gsheetSpreadsheetUrl : null,
          config: gsheetsConfig,
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Errore durante il salvataggio")

      setSuccess("Configurazione salvata con successo!")
      setTimeout(() => window.location.href = "/settings/pms", 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio")
    } finally {
      setIsLoading(false)
    }
  }

  const isDisabled = readOnly
  const activeCategory = DATA_CATEGORIES[activeCategoryIndex]
  const defaultMapping: CategoryMapping = { enabled: false, sheetTab: "", orientation: "rows_dates", columnMap: {} }
  const activeMapping = activeCategory
    ? (categoryMappings[activeCategory.id] ?? defaultMapping)
    : defaultMapping
  const selectedTabHeaders = activeMapping.sheetTab
    ? discoveredTabs.find((t) => t.title === activeMapping.sheetTab)?.headers || []
    : []

  // Ensure all categories exist in mappings (handles newly added categories after config was saved)
  useEffect(() => {
    const missing = DATA_CATEGORIES.filter((cat) => !categoryMappings[cat.id])
    if (missing.length > 0) {
      setCategoryMappings((prev) => {
        const updated = { ...prev }
        for (const cat of missing) {
          updated[cat.id] = { enabled: false, sheetTab: "", orientation: "rows_dates", columnMap: {} }
        }
        return updated
      })
    }
  }, [categoryMappings])

  // Count mapped categories
  const mappedCount = Object.values(categoryMappings || {}).filter((m) => m.enabled && m.sheetTab).length

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {readOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-center gap-2">
          <Lock className="h-4 w-4 flex-shrink-0" />
          <span>Questa configurazione e in sola lettura. Contatta il supporto per modificare le impostazioni PMS.</span>
        </div>
      )}

      <div className="space-y-4">
        {/* PMS Name */}
        <div className="grid gap-2">
          <Label>PMS</Label>
          <Input value={pmsLabel} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground">Per cambiare il PMS associato, contatta il supporto.</p>
        </div>

        {/* Integration Mode */}
        {supportsGSheets && (
          <div className="grid gap-3">
            <Label className="text-base font-semibold">Modalita di Integrazione</Label>
            <RadioGroup
              value={integrationMode}
              onValueChange={(v) => !isDisabled && setIntegrationMode(v as IntegrationMode)}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              disabled={isDisabled}
            >
              <label
                htmlFor="mode-api"
                className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-colors ${
                  integrationMode === "api" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value="api" id="mode-api" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-primary" />
                    <span className="font-medium">API Diretta</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Collegamento diretto via API. Dati in tempo reale.</p>
                </div>
              </label>
              <label
                htmlFor="mode-gsheets"
                className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-colors ${
                  integrationMode === "gsheets" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value="gsheets" id="mode-gsheets" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Google Sheets</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Importa dati dal foglio Google fornito dal PMS.</p>
                </div>
              </label>
            </RadioGroup>
          </div>
        )}

        {/* === API MODE === */}
        {integrationMode === "api" && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder={`Inserisci la tua API Key di ${pmsLabel}`}
                disabled={isDisabled}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endpointUrl">Endpoint URL</Label>
              <Input
                id="endpointUrl"
                value={config.endpointUrl}
                onChange={(e) => setConfig({ ...config, endpointUrl: e.target.value })}
                placeholder="URL endpoint del PMS"
                disabled={isDisabled}
              />
            </div>
          </>
        )}

        {/* === GOOGLE SHEETS WIZARD === */}
        {integrationMode === "gsheets" && (
          <Card className="border-green-200 bg-green-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-green-800">
                <FileSpreadsheet className="h-4 w-4" />
                Configurazione Google Sheets
              </CardTitle>
              <CardDescription className="text-green-700 text-xs">
                Collega il foglio Google fornito dal PMS e mappa i dati alle categorie Santaddeo.
              </CardDescription>
              {/* Progress indicator */}
              <div className="flex items-center gap-2 mt-3">
                {(["source", "proposals", "mapping", "summary"] as const).map((step, i) => {
                  const labels = ["Sorgente Dati", "Proposta Automatica", "Mappatura", "Riepilogo"]
                  const stepOrder = ["source", "proposals", "mapping", "summary"]
                  const currentIndex = stepOrder.indexOf(gsWizardStep)
                  const isActive = i === currentIndex
                  const isDone = i < currentIndex
                  return (
                    <div key={step} className="flex items-center gap-1">
                      <div
                        className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          isActive
                            ? "bg-green-600 text-white"
                            : isDone
                              ? "bg-green-200 text-green-800"
                              : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {isDone ? "\u2713" : i + 1}
                      </div>
                      <span className={`text-xs ${isActive ? "font-semibold text-green-800" : "text-muted-foreground"}`}>
                        {labels[i]}
                      </span>
                      {i < 3 && <ArrowRight className="h-3 w-3 text-muted-foreground mx-1" />}
                    </div>
                  )
                })}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* STEP 1: SOURCE */}
              {gsWizardStep === "source" && (
                <div className="space-y-4">
                  {/* Source type selector */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDataSource("url")}
                      className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                        dataSource === "url" ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-green-300"
                      }`}
                    >
                      <FileSpreadsheet className="h-6 w-6 text-green-600" />
                      <span className="text-sm font-medium">URL Google Sheets</span>
                      <span className="text-[10px] text-muted-foreground">Connetti direttamente il foglio condiviso</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDataSource("upload")}
                      className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                        dataSource === "upload" ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-green-300"
                      }`}
                    >
                      <Upload className="h-6 w-6 text-green-600" />
                      <span className="text-sm font-medium">Carica File</span>
                      <span className="text-[10px] text-muted-foreground">Carica un file CSV o Excel di esempio</span>
                    </button>
                  </div>

                  {/* URL input */}
                  {dataSource === "url" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="gsheetUrl" className="text-sm font-medium">
                          URL del foglio Google
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Incolla l{"'"}URL del foglio Google fornito da {pmsLabel}. Il foglio deve essere condiviso come
                          {" \""}Chiunque con il link puo visualizzare{"\""}
                        </p>
                        <Input
                          id="gsheetUrl"
                          value={config.gsheetSpreadsheetUrl}
                          onChange={(e) => handleGSheetUrlChange(e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/..."
                          disabled={isDisabled}
                        />
                        {config.gsheetSpreadsheetId && (
                          <p className="text-xs text-green-700">
                            ID rilevato: <code className="font-mono bg-green-100 px-1 rounded">{config.gsheetSpreadsheetId}</code>
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        onClick={handleDiscover}
                        disabled={!config.gsheetSpreadsheetId || isDiscovering || isDisabled}
                        className="bg-green-600 hover:bg-green-700 text-white w-full"
                      >
                        {isDiscovering ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Analisi automatica in corso...
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            Analizza e Mappa Automaticamente
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* File upload */}
                  {dataSource === "upload" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Carica file di esempio</Label>
                        <p className="text-xs text-muted-foreground">
                          Scarica il foglio Google come Excel (.xlsx) o CSV e caricalo qui. Il sistema analizzera la struttura automaticamente.
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) setUploadFile(file)
                            }}
                            className="flex-1"
                          />
                        </div>
                        {uploadFile && (
                          <p className="text-xs text-green-700">
                            File selezionato: <span className="font-medium">{uploadFile.name}</span> ({(uploadFile.size / 1024).toFixed(1)} KB)
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        disabled={!uploadFile || isDiscovering}
                        onClick={async () => {
                          if (!uploadFile) return
                          setIsDiscovering(true)
                          setError("")
                          try {
                            const formData = new FormData()
                            formData.append("file", uploadFile)
                            const res = await fetch("/api/gsheets/upload-analyze", { method: "POST", body: formData })
                            const data = await res.json()
                            if (!res.ok) throw new Error(data.error || "Errore upload")
                            const mappedTabs: SheetTab[] = (data.tabs || []).map((t: any) => ({
                              title: t.name || t.title || "Foglio",
                              headers: Array.isArray(t.headers) ? t.headers : [],
                              sampleRows: Array.isArray(t.previewRows) ? t.previewRows : [],
                              headerRowIndex: t.headerRowIndex ?? null,
                              allRows: Array.isArray(t.allRows) ? t.allRows : undefined,
                            }))
                            setDiscoveredTabs(mappedTabs)
                            const proposals = generateAutoProposals(mappedTabs)
                            setAutoProposals(proposals)
                            const newMappings = { ...categoryMappings }
                            for (const p of proposals) {
                              newMappings[p.categoryId] = {
                                enabled: true,
                                sheetTab: p.tabTitle,
                                orientation: "rows_dates",
                                columnMap: Object.fromEntries(
                                  Object.entries(p.columnMatches || {}).map(([k, v]) => [k, v?.header || ""])
                                ),
                                matrixMeta: p.matrixMeta,
                              }
                            }
                            setCategoryMappings(newMappings)
                            setSuccess(`Analisi completata! ${mappedTabs.length} fogli, ${proposals.length} categorie rilevate.`)
                            setGsWizardStep("proposals")
                          } catch (err: any) {
                            setError(err.message)
                          } finally {
                            setIsDiscovering(false)
                          }
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white w-full"
                      >
                        {isDiscovering ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Analisi file in corso...
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            Analizza e Mappa Automaticamente
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: AUTO PROPOSALS */}
              {gsWizardStep === "proposals" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold">Mappatura Automatica</h4>
                      <p className="text-xs text-muted-foreground">
                        Il sistema ha analizzato {discoveredTabs.length} fogli e propone la mappatura seguente. Verifica e correggi se necessario.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDiscoveredTabs([])
                        setAutoProposals([])
                        setGsWizardStep("source")
                      }}
                      className="bg-transparent text-amber-600 border-amber-300 hover:bg-amber-50"
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Ricollega
                    </Button>
                  </div>

                  {/* Auto-matched categories */}
                  {autoProposals.length > 0 && (
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800 text-xs">
                        {autoProposals.length} categorie rilevate automaticamente! Clicca su una categoria per vedere e modificare i dettagli.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    {DATA_CATEGORIES.map((cat) => {
                      const proposal = autoProposals.find((p) => p.categoryId === cat.id)
                      const mapping = categoryMappings[cat.id] || { enabled: false, sheetTab: "", columnMap: {}, orientation: "rows_dates" as const }
                      const isExpanded = expandedTab === `cat-${cat.id}`
                      const matchCount = mapping?.columnMap ? Object.values(mapping.columnMap).filter(Boolean).length : 0

                      return (
                        <Card
                          key={cat.id}
                          className={`transition-colors cursor-pointer ${
                            proposal ? "border-green-300 bg-green-50/30" : "border-gray-200"
                          }`}
                          onClick={() => setExpandedTab(isExpanded ? null : `cat-${cat.id}`)}
                        >
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {proposal ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                                )}
                                <div>
                                  <span className="text-sm font-medium">{cat.label}</span>
                                  {cat.type === "matrix" && (
                                    <Badge variant="outline" className="ml-2 text-[10px]">Matrice</Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {proposal && mapping?.sheetTab && (
                                  <>
                                    <Badge variant="secondary" className="text-xs">{mapping.sheetTab}</Badge>
                                    {cat.type === "standard" && (
                                      <Badge className="text-xs bg-green-100 text-green-800">{matchCount} campi</Badge>
                                    )}
                                    {cat.type === "matrix" && mapping.matrixMeta && (
                                      <Badge className="text-xs bg-blue-100 text-blue-800">
                                        {mapping.matrixMeta.rateColumns?.length || 0} tariffe
                                      </Badge>
                                    )}
                                  </>
                                )}
                                {!proposal && (
                                  <Badge variant="outline" className="text-xs">Non rilevato</Badge>
                                )}
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                                <p className="text-xs text-muted-foreground">{cat.description}</p>

                                {/* Enable toggle */}
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`prop-enable-${cat.id}`}
                                    checked={mapping?.enabled ?? !!proposal}
                                    onChange={(e) => {
                                      setCategoryMappings((prev) => ({
                                        ...prev,
                                        [cat.id]: {
                                          ...prev[cat.id],
                                          enabled: e.target.checked,
                                          sheetTab: prev[cat.id]?.sheetTab || proposal?.tabTitle || "",
                                          orientation: prev[cat.id]?.orientation || "rows_dates",
                                          columnMap: prev[cat.id]?.columnMap || {},
                                        },
                                      }))
                                    }}
                                    className="h-4 w-4 rounded border-gray-300"
                                  />
                                  <Label htmlFor={`prop-enable-${cat.id}`} className="text-xs font-normal cursor-pointer">
                                    Presente nel foglio
                                  </Label>
                                </div>

                                {(mapping?.enabled ?? !!proposal) && (
                                  <>
                                    {/* Tab selector */}
                                    <div className="grid gap-1">
                                      <Label className="text-xs font-medium">Foglio</Label>
                                      <Select
                                        value={mapping?.sheetTab || proposal?.tabTitle || ""}
                                        onValueChange={(v) => {
                                          setCategoryMappings((prev) => ({
                                            ...prev,
                                            [cat.id]: {
                                              ...prev[cat.id],
                                              enabled: true,
                                              sheetTab: v,
                                              orientation: prev[cat.id]?.orientation || "rows_dates",
                                              columnMap: {},
                                            },
                                          }))
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue placeholder="Seleziona foglio..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {discoveredTabs.map((t) => (
                                            <SelectItem key={t.title} value={t.title} className="text-xs">
                                              {t.title} ({(t.headers || []).length} colonne)
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {/* Standard fields mapping */}
                                    {(() => {
                                      const selectedTab = mapping?.sheetTab || proposal?.tabTitle || ""
                                      const tabHeaders = discoveredTabs.find((t) => t.title === selectedTab)?.headers || []
                                      const showFields = cat.type === "standard" && cat.requiredFields.length > 0 && selectedTab
                                      if (!showFields) return null
                                      return (
                                      <div className="space-y-2">
                                        <Label className="text-xs font-medium">Mappatura campi</Label>
                                        <div className="grid gap-1.5">
                                          {cat.requiredFields.map((field) => {
                                            const matchedCol = mapping?.columnMap?.[field.key] || ""
                                            return (
                                              <div key={field.key} className="flex items-center gap-2">
                                                <span className="text-xs w-36 flex-shrink-0">
                                                  {field.label}
                                                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                                                </span>
                                                <Select
                                                  value={matchedCol}
                                                  onValueChange={(v) => {
                                                    setCategoryMappings((prev) => {
                                                      const existing = prev[cat.id] || { enabled: false, sheetTab: "", columnMap: {} }
                                                      return {
                                                        ...prev,
                                                        [cat.id]: {
                                                          ...existing,
                                                          enabled: true,
                                                          sheetTab: existing.sheetTab || proposal?.tabTitle || "",
                                                          columnMap: { ...(existing.columnMap || {}), [field.key]: v },
                                                        },
                                                      }
                                                    })
                                                  }}
                                                >
                                                  <SelectTrigger className={`h-7 text-xs flex-1 ${matchedCol ? "border-green-300 bg-green-50" : ""}`}>
                                                    <SelectValue placeholder="--" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    <SelectItem value="__none__">-- Non mappare --</SelectItem>
                                                    {tabHeaders.map((h) => (
                                                      <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                                {matchedCol && matchedCol !== "__none__" && (
                                                  <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                                                )}
                                              </div>
                                            )
                                          })}
                                          
                                          {/* Room Types columns for pivot categories */}
                                          {(cat.id === "rooms_production" || cat.id === "rooms_occupancy") && hotelRoomTypes.length > 0 && (
                                            <>
                                              <div className="col-span-full border-t border-dashed pt-3 mt-2">
                                                <span className="text-xs font-medium text-muted-foreground">Colonne Tipologie Camera</span>
                                              </div>
                                              {hotelRoomTypes.filter(rt => rt && rt.name).map((rt) => {
                                                // Get mapping from room_types_columns sub-object (format expected by sync service)
                                                const roomTypesColumns = (mapping?.columnMap?.room_types_columns || {}) as Record<string, string>
                                                const rtValue = roomTypesColumns[rt.name] || ""
                                                return (
                                                  <div key={rt.id} className="flex items-center gap-2">
                                                    <span className="text-xs w-36 flex-shrink-0 truncate" title={rt.name}>
                                                      {rt.name} <span className="text-muted-foreground">({rt.total_rooms})</span>
                                                    </span>
                                                    <Select
                                                      value={rtValue || "__none__"}
                                                      onValueChange={(v) => {
                                                        setCategoryMappings((prev) => {
                                                          const existing = prev[cat.id] || { enabled: true, sheetTab: selectedTab, columnMap: {} }
                                                          const existingRtCols = (existing.columnMap?.room_types_columns || {}) as Record<string, string>
                                                          const newRtCols = { ...existingRtCols }
                                                          if (v === "__none__" || !v) {
                                                            delete newRtCols[rt.name]
                                                          } else {
                                                            newRtCols[rt.name] = v
                                                          }
                                                          return {
                                                            ...prev,
                                                            [cat.id]: {
                                                              ...existing,
                                                              enabled: true,
                                                              sheetTab: existing.sheetTab || selectedTab,
                                                              columnMap: { ...(existing.columnMap || {}), room_types_columns: newRtCols },
                                                            },
                                                          }
                                                        })
                                                      }}
                                                    >
                                                      <SelectTrigger className={`h-7 text-xs flex-1 ${rtValue && rtValue !== "__none__" ? "border-green-300 bg-green-50" : ""}`}>
                                                        <SelectValue placeholder="Seleziona colonna..." />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        <SelectItem value="__none__">-- Non mappare --</SelectItem>
                                                        {tabHeaders.map((h) => (
                                                          <SelectItem key={h} value={h}>{h}</SelectItem>
                                                        ))}
                                                      </SelectContent>
                                                    </Select>
                                                    {rtValue && rtValue !== "__none__" && (
                                                      <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                                                    )}
                                                  </div>
                                                )
                                              })}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )})()}

                                    {/* Matrix preview */}
                                    {cat.type === "matrix" && mapping?.matrixMeta && (
                                      <div className="space-y-2">
                                        <Label className="text-xs font-medium">Struttura matrice rilevata</Label>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                          {mapping.matrixMeta.codeRow && (
                                            <div className="flex items-center gap-1">
                                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                                              <span>Codici camera:tariffa (riga {mapping.matrixMeta.codeRow})</span>
                                            </div>
                                          )}
                                          {mapping.matrixMeta.nameRow && (
                                            <div className="flex items-center gap-1">
                                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                                              <span>Nomi camere (riga {mapping.matrixMeta.nameRow})</span>
                                            </div>
                                          )}
                                          {mapping.matrixMeta.paxRow && (
                                            <div className="flex items-center gap-1">
                                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                                              <span>Occupazione PAX (riga {mapping.matrixMeta.paxRow})</span>
                                            </div>
                                          )}
                                          {mapping.matrixMeta.treatmentRow && (
                                            <div className="flex items-center gap-1">
                                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                                              <span>Trattamento (riga {mapping.matrixMeta.treatmentRow})</span>
                                            </div>
                                          )}
                                          {mapping.matrixMeta.dataStartRow && (
                                            <div className="flex items-center gap-1">
                                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                                              <span>Dati da riga {mapping.matrixMeta.dataStartRow}</span>
                                            </div>
                                          )}
                                        </div>
                                        {mapping.matrixMeta.rateColumns && mapping.matrixMeta.rateColumns.length > 0 && (
                                          <div className="rounded border overflow-x-auto max-h-40">
                                            <Table>
                                              <TableHeader>
                                                <TableRow>
                                                  <TableHead className="text-[10px] py-1 px-2">Codice</TableHead>
                                                  <TableHead className="text-[10px] py-1 px-2">Camera</TableHead>
                                                  <TableHead className="text-[10px] py-1 px-2">PAX</TableHead>
                                                  <TableHead className="text-[10px] py-1 px-2">Trattamento</TableHead>
                                                </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                {mapping.matrixMeta.rateColumns.slice(0, 8).map((rc, i) => (
                                                  <TableRow key={i}>
                                                    <TableCell className="text-[10px] py-1 px-2 font-mono">{rc.code}</TableCell>
                                                    <TableCell className="text-[10px] py-1 px-2">{rc.roomName}</TableCell>
                                                    <TableCell className="text-[10px] py-1 px-2">{rc.pax}</TableCell>
                                                    <TableCell className="text-[10px] py-1 px-2">{rc.treatment}</TableCell>
                                                  </TableRow>
                                                ))}
                                              </TableBody>
                                            </Table>
                                            {mapping.matrixMeta.rateColumns.length > 8 && (
                                              <p className="text-[10px] text-muted-foreground text-center py-1">
                                                ... e altre {mapping.matrixMeta.rateColumns.length - 8} tariffe
                                              </p>
                                            )}
                                          </div>
                                        )}
                                        {(!mapping.matrixMeta.rateColumns || mapping.matrixMeta.rateColumns.length === 0) && (
                                          <Alert className="border-amber-200 bg-amber-50">
                                            <AlertCircle className="h-3 w-3 text-amber-600" />
                                            <AlertDescription className="text-amber-800 text-[10px]">
                                              Struttura matrice non rilevata automaticamente. Procedi alla mappatura manuale.
                                            </AlertDescription>
                                          </Alert>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>

                  {/* Continue buttons */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setActiveCategoryIndex(0)
                        setGsWizardStep("mapping")
                      }}
                      className="bg-transparent flex-1"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Mappatura Manuale Dettagliata
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setGsWizardStep("summary")}
                      className="bg-green-600 hover:bg-green-700 text-white flex-1"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Conferma e Vai al Riepilogo
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 3: MANUAL MAPPING (optional deep edit) */}
              {gsWizardStep === "mapping" && activeCategory && activeMapping && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setGsWizardStep("proposals")}
                        className="bg-transparent"
                      >
                        <ArrowLeft className="mr-1 h-3 w-3" />
                        Proposta Auto
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDiscoveredTabs([])
                          setAutoProposals([])
                          setGsWizardStep("source")
                        }}
                        className="bg-transparent text-amber-600 border-amber-300 hover:bg-amber-50"
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Ricollega
                      </Button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Categoria {activeCategoryIndex + 1} di {DATA_CATEGORIES.length}
                    </span>
                  </div>

                  {/* Category header */}
                  <Card className="border-primary/30">
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm">{activeCategory.label}</CardTitle>
                          <CardDescription className="text-xs">{activeCategory.description}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="cat-enabled" className="text-xs">Presente?</Label>
                          <input
                            id="cat-enabled"
                            type="checkbox"
                            checked={activeMapping.enabled}
                            onChange={(e) => {
                              setCategoryMappings((prev) => {
                                const existing = prev[activeCategory.id] || defaultMapping
                                return { ...prev, [activeCategory.id]: { ...existing, enabled: e.target.checked } }
                              })
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </div>
                      </div>
                    </CardHeader>

                    {activeMapping.enabled && activeCategory.type === "standard" && (
                      <CardContent className="space-y-4 pt-0 px-4 pb-4">
                        {/* Tab selection */}
                        <div className="grid gap-2">
                          <Label className="text-xs font-medium">Foglio</Label>
                          <Select
                            value={activeMapping.sheetTab}
                            onValueChange={(v) => {
                              setCategoryMappings((prev) => {
                                const existing = prev[activeCategory.id] || defaultMapping
                                return { ...prev, [activeCategory.id]: { ...existing, sheetTab: v } }
                              })
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Seleziona foglio..." />
                            </SelectTrigger>
                            <SelectContent>
                              {discoveredTabs.map((t) => (
                                <SelectItem key={t.title} value={t.title}>
                                  {t.title} ({(t.headers || []).length} colonne)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Column mapping */}
                        {activeMapping.sheetTab && selectedTabHeaders.length > 0 && activeCategory?.requiredFields && (
                          <div className="grid gap-3">
                            <Label className="text-xs font-medium">Mappatura campi</Label>
                            {(activeCategory.requiredFields || []).map((field) => (
                              <div key={field.key} className="grid grid-cols-2 gap-2 items-center">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs">{field.label}</span>
                                  {field.required && <span className="text-red-500 text-xs">*</span>}
                                </div>
                                <Select
                                  value={activeMapping?.columnMap?.[field.key] || ""}
                                  onValueChange={(v) => {
                                    if (!activeCategory?.id) return
                                    setCategoryMappings((prev) => {
                                      const existing = prev[activeCategory.id] || defaultMapping
                                      return {
                                        ...prev,
                                        [activeCategory.id]: {
                                          ...existing,
                                          columnMap: { ...(existing.columnMap || {}), [field.key]: v },
                                        },
                                      }
                                    })
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Seleziona colonna..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">-- Non mappare --</SelectItem>
                                    {selectedTabHeaders.map((h) => (
                                      <SelectItem key={h} value={h}>{h}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                            
                            {/* Room Types columns for rooms_production and rooms_occupancy */}
                            {(activeCategory.id === "rooms_production" || activeCategory.id === "rooms_occupancy") && hotelRoomTypes.length > 0 && (
                              <>
                                <div className="col-span-2 border-t border-dashed pt-3 mt-2">
                                  <span className="text-xs font-semibold text-muted-foreground">Colonne Tipologie Camera</span>
                                </div>
                                {hotelRoomTypes.filter(rt => rt && rt.name).map((rt) => {
                                  // Get mapping from room_types_columns sub-object (format expected by sync service)
                                  const roomTypesColumns = (activeMapping?.columnMap?.room_types_columns || {}) as Record<string, string>
                                  const rtValue = roomTypesColumns[rt.name] || ""
                                  return (
                                    <div key={rt.id} className="grid grid-cols-2 gap-2 items-center">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs truncate" title={rt.name}>{rt.name}</span>
                                        <span className="text-muted-foreground text-xs">({rt.total_rooms})</span>
                                      </div>
                                      <Select
                                        value={rtValue || "__none__"}
                                        onValueChange={(v) => {
                                          setCategoryMappings((prev) => {
                                            const existing = prev[activeCategory.id] || defaultMapping
                                            const existingRtCols = (existing.columnMap?.room_types_columns || {}) as Record<string, string>
                                            const newRtCols = { ...existingRtCols }
                                            if (v === "__none__" || !v) {
                                              delete newRtCols[rt.name]
                                            } else {
                                              newRtCols[rt.name] = v
                                            }
                                            return {
                                              ...prev,
                                              [activeCategory.id]: {
                                                ...existing,
                                                columnMap: { ...(existing.columnMap || {}), room_types_columns: newRtCols },
                                              },
                                            }
                                          })
                                        }}
                                      >
                                        <SelectTrigger className={`h-8 text-xs ${rtValue && rtValue !== "__none__" ? "border-green-300 bg-green-50" : ""}`}>
                                          <SelectValue placeholder="Seleziona colonna..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__none__">-- Non mappare --</SelectItem>
                                          {selectedTabHeaders.map((h) => (
                                            <SelectItem key={h} value={h}>{h}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )
                                })}
                              </>
                            )}
                          </div>
                        )}

                      </CardContent>
                    )}

                    {activeMapping.enabled && activeCategory.type === "matrix" && (
                      <CardContent className="space-y-4 pt-0 px-4 pb-4">
                        <div className="grid gap-2">
                          <Label className="text-xs font-medium">Foglio matrice prezzi</Label>
                          <Select
                            value={activeMapping.sheetTab}
                            onValueChange={(v) => {
                              const tab = discoveredTabs.find((t) => t.title === v)
                              const meta = tab ? autoAnalyzeMatrix(tab) : undefined
                              setCategoryMappings((prev) => {
                                const existing = prev[activeCategory.id] || defaultMapping
                                return { ...prev, [activeCategory.id]: { ...existing, sheetTab: v, matrixMeta: meta } }
                              })
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Seleziona foglio prezzi..." />
                            </SelectTrigger>
                            <SelectContent>
                              {discoveredTabs.map((t) => (
                                <SelectItem key={t.title} value={t.title}>{t.title}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {activeMapping.matrixMeta && activeMapping.matrixMeta.rateColumns && activeMapping.matrixMeta.rateColumns.length > 0 && (
                          <Alert className="border-green-200 bg-green-50">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800 text-xs">
                              Rilevate {activeMapping.matrixMeta.rateColumns.length} combinazioni camera/tariffa nella matrice prezzi.
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    )}
                  </Card>

                  {/* Navigation buttons */}
                  <div className="flex justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={activeCategoryIndex === 0}
                      onClick={() => setActiveCategoryIndex((i) => Math.max(0, i - 1))}
                      className="bg-transparent"
                    >
                      <ArrowLeft className="mr-1 h-3 w-3" />
                      Precedente
                    </Button>
                    {activeCategoryIndex < DATA_CATEGORIES.length - 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setActiveCategoryIndex((i) => i + 1)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        Prossima
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setGsWizardStep("summary")}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        Riepilogo
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4: SUMMARY */}
              {gsWizardStep === "summary" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setGsWizardStep("proposals")}
                      className="bg-transparent"
                    >
                      <ArrowLeft className="mr-1 h-3 w-3" />
                      Modifica Proposta
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActiveCategoryIndex(0)
                        setGsWizardStep("mapping")
                      }}
                      className="bg-transparent"
                    >
                      <Settings className="mr-1 h-3 w-3" />
                      Mappatura Manuale
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDiscoveredTabs([])
                        setAutoProposals([])
                        setGsWizardStep("source")
                      }}
                      className="bg-transparent text-amber-600 border-amber-300 hover:bg-amber-50"
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Ricollega
                    </Button>
                  </div>

                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800 text-sm">
                      Riepilogo mappatura. Verifica e clicca {"\""}Salva Configurazione{"\""}  in basso.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    {DATA_CATEGORIES.map((cat) => {
                      const m = categoryMappings[cat.id] || { enabled: false, sheetTab: "", columnMap: {} }
                      // FIX 02/05/2026 React #31 crash su rimappatura Casanova:
                      // per le categorie pivot (rooms_production / rooms_occupancy)
                      // il columnMap contiene la chiave speciale `room_types_columns`
                      // che e' un OGGETTO `Record<string,string>` con i nomi delle
                      // camere come keys. Renderizzarlo direttamente in JSX faceva
                      // crashare React (#31 "object with keys {Appartamento Ciliegio,
                      // Appartamento Melograno, ...}"). Ora skippo quella chiave dal
                      // mapping piatto e la conto a parte come pill dedicata.
                      const mappedFields: Array<[string, string]> = []
                      let pivotRoomTypesCount = 0
                      if (m?.columnMap && cat.type === "standard") {
                        for (const [k, v] of Object.entries(m.columnMap)) {
                          if (k === "room_types_columns" && v && typeof v === "object") {
                            pivotRoomTypesCount = Object.values(v as Record<string, string>)
                              .filter((col) => typeof col === "string" && col && col !== "__none__").length
                            continue
                          }
                          if (typeof v === "string" && v && v !== "__none__") {
                            mappedFields.push([k, v])
                          }
                        }
                      }
                      return (
                        <Card
                          key={cat.id}
                          className={m?.enabled && m?.sheetTab ? "border-green-200 bg-green-50/30" : "opacity-60"}
                        >
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {m?.enabled && m?.sheetTab ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                                )}
                                <span className="text-sm font-medium">{cat.label}</span>
                                {cat.type === "matrix" && (
                                  <Badge variant="outline" className="text-[10px]">Matrice</Badge>
                                )}
                              </div>
                              {m?.enabled && m?.sheetTab ? (
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-xs">{m.sheetTab}</Badge>
                                  {cat.type === "standard" && (
                                    <Badge className="text-xs bg-green-100 text-green-800">
                                      {mappedFields.length} campi
                                    </Badge>
                                  )}
                                  {cat.type === "standard" && pivotRoomTypesCount > 0 && (
                                    <Badge className="text-xs bg-blue-100 text-blue-800">
                                      {pivotRoomTypesCount} tipologie camera
                                    </Badge>
                                  )}
                                  {cat.type === "matrix" && m.matrixMeta?.rateColumns && (
                                    <Badge className="text-xs bg-blue-100 text-blue-800">
                                      {m.matrixMeta.rateColumns.length} tariffe
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-xs">Non configurato</Badge>
                              )}
                            </div>
                            {m?.enabled && cat.type === "standard" && mappedFields.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {mappedFields.map(([key, col]) => (
                                  <span
                                    key={key}
                                    className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-800"
                                  >
                                    {cat.requiredFields.find((f) => f.key === key)?.label || key}
                                    <ArrowRight className="h-2 w-2" />
                                    {col}
                                  </span>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>

                  {mappedCount === 0 && (
                    <Alert className="border-amber-200 bg-amber-50">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-800 text-xs">
                        Nessuna categoria mappata. Torna alla proposta automatica per configurare.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Campi comuni */}
        <div className="grid gap-2">
          <Label htmlFor="vatNumber">P.IVA (per produzione fiscale)</Label>
          <Input
            id="vatNumber"
            value={config.vatNumber}
            onChange={(e) => setConfig({ ...config, vatNumber: e.target.value })}
            placeholder="Partita IVA della struttura"
            disabled={isDisabled}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="propertyId">Property ID</Label>
          <Input
            id="propertyId"
            value={config.propertyId}
            onChange={(e) => setConfig({ ...config, propertyId: e.target.value })}
            placeholder="ID della struttura nel PMS"
            disabled={isDisabled}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            checked={config.isActive}
            onChange={(e) => setConfig({ ...config, isActive: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
            disabled={isDisabled}
          />
          <Label htmlFor="isActive" className="font-normal cursor-pointer">
            Abilita sincronizzazione automatica
          </Label>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-green-200 bg-green-50 text-green-900">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {!readOnly && (
        <div className="flex gap-3">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvataggio...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salva Configurazione
              </>
            )}
          </Button>
        </div>
      )}
    </form>
  )
}
