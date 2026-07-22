"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ChevronLeft, ChevronRight, ChevronDown, Eye, Save, Loader2, Users, Info, Star, ExternalLink, Cpu, Settings2, FlaskConical, BarChart3, Zap, Sun, Cloud, CloudRain, Snowflake, CloudLightning, CalendarDays, Tag, Building2, StickyNote, Trash2, Plus } from "lucide-react"
import { PriceHistoryTooltip } from "@/components/accelerator/price-history-tooltip"
import { AutopilotControls } from "@/components/accelerator/autopilot-controls"
import { AlgorithmExplanationDialog } from "@/components/accelerator/algorithm-explanation-dialog"
import Link from "next/link"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns"
import { it } from "date-fns/locale"


import { CalendarScrollContainer } from "@/components/calendar/calendar-scroll-container"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"

// FASE 6 (12/05/2026): fonte di verita centralizzata per l'elenco AUTO/MANUAL.
// Il registry e' lib/pricing/k-variable-registry.ts (single source of truth
// architetturale). Vedi memoria utente "Registry K-driven Santaddeo".
import {
  AUTO_K_VARIABLE_KEYS,
  OFFICIAL_K_VARIABLE_KEYS,
  getKVariableDefinition,
} from "@/lib/pricing/k-variable-registry"
import { resolveKIntensity, type KIntensityRule, K_INTENSITY_BASE_CAP, K_INTENSITY_PRESETS } from "@/lib/pricing/k-intensity"
// 07/07/2026 (drift UI/motore 246 vs 249): il coefficiente K a video DEVE usare
// gli stessi pesi per-data del motore server. Prima il client leggeva solo
// default_weight, ignorando gli override stagionali/spot (es. Barronci:
// k_direct_demand default 0 ma override 4) -> K diverso -> prezzo diverso.
// Riusiamo lo STESSO resolver del server (niente 4a copia della logica).
import { buildWeightOverrideMap, getOverriddenWeight, type WeightOverrideRow } from "@/lib/pricing/k-variable-effective-weight"
import { KIntensityDialog } from "@/components/accelerator/k-intensity-dialog"

// ------- Types & Interfaces -------

interface RoomType {
  id: string
  name: string
  code: string
  capacity: number
  capacity_default: number
  min_occupancy: number
  max_occupancy: number
  additional_beds: number
  total_rooms: number
  is_active: boolean
}

interface Rate {
  id: string
  name: string
  code: string
  is_active: boolean
  room_type_ids?: string[]
  arrangements?: Array<{ code?: string; description?: string; type?: string; pax?: number }>
  raw_data?: { pax?: number; [key: string]: unknown }
  // Rate mapping fields
  rate_type?: "standard" | "nr" | "promo" | "package" | "derived"
  parent_rate_id?: string | null
  discount_percentage?: number | null
  release_days?: number | null
  applicable_room_type_ids?: string[] | null
  min_occupancy?: number
  max_occupancy?: number | null
  is_mapped?: boolean
}

interface DayColumn {
  date: string
  dayOfWeek: string
  dayNum: string
  isToday: boolean
  isWeekend: boolean
  monthShort: string
  isMonthStart: boolean
}

interface OccupancyBand {
  id?: string
  group_id?: string
  band_index: number
  min_pct: number
  max_pct: number
  min_num?: number
  max_num?: number
  label: string
  increment_pct: number
  increment_eur?: number
  increment_mode?: "pct" | "eur"
  occupancy_mode?: "pct" | "num"
}

interface BandGroup {
  id: string
  name: string
  sort_order: number
  bands: OccupancyBand[]
}

interface LastMinuteLevel {
  id: string
  name: string
  sort_order: number
  color: string
  discount_pct: number
  min_occupancy_pct: number
  max_occupancy_pct: number
  occupancy_mode: "pct" | "num"
  min_occupancy_num: number
  max_occupancy_num: number
}

interface RateLimitData {
  room_type_id: string
  room_type_name: string
  bottom_rate: number
  rack_rate: number
}

// ------- Roman numeral helper -------
function toRoman(num: number): string {
  const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
  return romanNumerals[num - 1] || String(num)
}

// ------- Param Row Label + Description helper -------
function ParamLabel({ label, description }: { label: string; description: string }) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help inline-flex items-center gap-1.5">
            {label}
            <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[340px] text-sm p-3 leading-relaxed">
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Whitelist AUTO-SOURCED: chiavi K calcolate automaticamente dal cron
 * `/api/cron/calculate-k-values` (ogni 3h) oppure popolate da bridge OTA
 * (`ota-pricing-bridge.ts`) dopo upload PDF/XLSX/manual KPI.
 *
 * SOURCE OF TRUTH: `lib/pricing/k-variable-registry.ts > AUTO_K_VARIABLE_KEYS`.
 * Non duplicare la lista qui: importarla dal registry mantiene allineata UI,
 * cron (k-variables-service.ts) e motore (calculate-suggested-price.ts).
 *
 * Tutte le altre `variable_key` (custom, eventi, conversioni, gruppi, ecc.)
 * restano MANUALI: il tenant deve scriverne il valore a mano nella griglia.
 *
 * UI: la riga della variabile mostra un badge AUTO (verde) o MANUALE (ambra)
 * accanto al label per rendere esplicito il comportamento.
 */
const AUTO_SOURCED_VARIABLE_KEYS: ReadonlySet<string> = AUTO_K_VARIABLE_KEYS

function VariableSourceBadge({ autoSourced }: { autoSourced: boolean }) {
  if (autoSourced) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-emerald-700 cursor-help shrink-0"
              aria-label="Variabile alimentata automaticamente"
            >
              <Zap className="h-2.5 w-2.5" />
              Auto
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[280px] text-xs p-2.5 leading-relaxed">
            Santaddeo calcola questo valore automaticamente ogni 3 ore dai dati
            del tuo PMS, dalle recensioni o da fonti esterne (meteo). Puoi
            comunque sovrascriverlo manualmente per singolo giorno.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-amber-700 cursor-help shrink-0"
            aria-label="Variabile da compilare manualmente"
          >
            Manuale
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[280px] text-xs p-2.5 leading-relaxed">
          Variabile da compilare manualmente. Santaddeo non ha una fonte dati
          automatica per questo parametro: inserisci tu il valore (0-10) per i
          giorni in cui vuoi che impatti sul coefficiente K.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ------- Component (v2) -------

// Bandiera dell'evento come IMMAGINE (non emoji): le bandiere-emoji basate sui
// caratteri "regional indicator" NON vengono renderizzate da Chrome su Windows
// (mostra solo le due lettere, es. "IT"). Usiamo quindi le PNG di flagcdn.com,
// che funzionano su tutte le piattaforme. Codice ISO 3166-1 alpha-2.
function isValidCountryCode(code: string | null | undefined): code is string {
  return !!code && /^[A-Za-z]{2}$/.test(code)
}

function FlagIcon({ code, className }: { code: string | null | undefined; className?: string }) {
  if (!isValidCountryCode(code)) return null
  const cc = code.toLowerCase()
  return (
    <img
      src={`https://flagcdn.com/${cc}.svg`}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
      loading="lazy"
      className={className}
    />
  )
}

export default function AcceleratorPricingPage() {
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [autopilotMode, setAutopilotMode] = useState<"disabled" | "notify" | "autopilot">("disabled")

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [rates, setRates] = useState<Rate[]>([])
  const [selectedRate, setSelectedRate] = useState<string>("")
  const [currentMonth, setCurrentMonth] = useState(new Date())
  // Quanti mesi mostrare contemporaneamente nel calendario. La griglia diventa
  // una finestra scorrevole orizzontalmente (1/2/3 mesi) senza dover cambiare
  // mese e ricaricare. I dati sono tutti keyed per data, quindi allargare la
  // finestra aggiunge solo colonne; i fetch month-scoped vengono ripetuti per
  // ogni mese della finestra e UNITI in un'unica state-update.
  const [windowMonths, setWindowMonths] = useState<1 | 2 | 3>(1)
  const [referenceRoomTypeId, setReferenceRoomTypeId] = useState<string>("")

  // Pricing grid
  const [gridPrices, setGridPrices] = useState<Record<string, Record<string, number>>>({})
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({})
  const editedPricesRef = useRef<Record<string, string>>({})
  editedPricesRef.current = editedPrices // Always keep ref in sync with state
  const [occupancyData, setOccupancyData] = useState<Record<string, Record<string, { available: number; total: number }>>>({})

  // Cells the user has manually edited during the current session, mapped to
  // the value they last typed. Persists across the auto-save flow so the amber
  // highlight and the "Invia prezzi modificati" push both survive even after
  // `editedPrices` has been cleared by a successful auto-save.
  // Keys use format: `${roomTypeId}_${rateId}_${occ}_${date}`
  const [userEditedCells, setUserEditedCells] = useState<Map<string, number>>(new Map())
  // Dates whose algo-params just changed. An effect below reads this set,
  // recomputes the suggested price for every grid cell of each listed date,
  // and promotes any cell whose suggestion differs from the saved price to
  // userEditedCells so the "Invia prezzi modificati" push picks them up too.
  const pendingAlgoDatesRef = useRef<Set<string>>(new Set())
  // Transient per-cell feedback shown for ~3s after a manual push.
  // "success" = emerald flash, "error" = red flash.
  const [pushFeedback, setPushFeedback] = useState<Record<string, "success" | "error">>({})

  // Production overlay
  const [showAvgProduction, setShowAvgProduction] = useState(false)

  // Previous year data for YoY comparison (keyed by "MM-DD")
  const [prevYearData, setPrevYearData] = useState<Record<string, { occupancy_rate: number; total_revenue: number; adr: number; rooms_occupied: number }>>({})
  // Fetched real booking data from channel-production API (rt.id -> date -> value)
  const [fetchedDailyPrices, setFetchedDailyPrices] = useState<Record<string, Record<string, number>>>({})
  const [fetchedDailyCounts, setFetchedDailyCounts] = useState<Record<string, Record<string, number>>>({})
  
  // Weather forecasts (keyed by date "YYYY-MM-DD")
  const [weatherData, setWeatherData] = useState<Record<string, { weatherScore: number; temperatureMax: number; temperatureMin: number; weatherDescription: string; precipitationProbability: number }>>({})
  // Previous year weather for comparison (keyed by "MM-DD")
  const [prevYearWeather, setPrevYearWeather] = useState<Record<string, { weatherScore: number; temperatureMax: number }>>({})
  // Hotel events (keyed by date "YYYY-MM-DD")
  const [eventsData, setEventsData] = useState<Record<string, { id: string; name: string; type: string; country_code: string | null; impact: string; color: string }[]>>({})
  // Nota di calendario per-giorno (es. "cambiato strategia"): si salva come
  // hotel_events type='note' e resta memorizzata sul giorno, visibile sia in
  // griglia (riga Festivita' & Eventi) sia nel Calendario Eventi.
  const NOTE_COLOR = "#6366f1"
  const [noteDialogDate, setNoteDialogDate] = useState<string | null>(null)
  const [noteText, setNoteText] = useState("")
  const [noteSaving, setNoteSaving] = useState(false)

  // Ricarica gli eventi del mese visualizzato (riusato dopo save/delete nota)
  const reloadEvents = useCallback(async () => {
    if (!hotelId) return
    const monthFrom = format(startOfMonth(currentMonth), "yyyy-MM-dd")
    const monthTo = format(endOfMonth(addMonths(currentMonth, windowMonths - 1)), "yyyy-MM-dd")
    try {
      const res = await fetch(`/api/accelerator/events?hotel_id=${hotelId}&from=${monthFrom}&to=${monthTo}`)
      if (!res.ok) return
      const j = await res.json()
      const evMap: Record<string, { id: string; name: string; type: string; country_code: string | null; impact: string; color: string }[]> = {}
      for (const ev of (j.events || [])) {
        if (!evMap[ev.date]) evMap[ev.date] = []
        evMap[ev.date].push(ev)
      }
      setEventsData(evMap)
    } catch {
      /* noop */
    }
  }, [hotelId, currentMonth, windowMonths])

  const handleSaveNote = useCallback(async () => {
    if (!hotelId || !noteDialogDate || !noteText.trim()) return
    setNoteSaving(true)
    try {
      const res = await fetch("/api/accelerator/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          events: [{ date: noteDialogDate, name: noteText.trim(), type: "note", impact: "low", color: NOTE_COLOR }],
        }),
      })
      if (res.ok) {
        setNoteDialogDate(null)
        setNoteText("")
        await reloadEvents()
        toast.success("Nota salvata nel calendario")
      } else {
        toast.error("Errore nel salvataggio della nota")
      }
    } catch {
      toast.error("Errore di rete nel salvataggio della nota")
    } finally {
      setNoteSaving(false)
    }
  }, [hotelId, noteDialogDate, noteText, reloadEvents])

  const handleDeleteEvent = useCallback(async (id: string) => {
    if (!hotelId) return
    try {
      const res = await fetch(`/api/accelerator/events?hotel_id=${hotelId}&id=${id}`, { method: "DELETE" })
      if (res.ok) {
        await reloadEvents()
        toast.success("Nota eliminata")
      }
    } catch {
      /* noop */
    }
  }, [hotelId, reloadEvents])

  // Algo params: { param_key: { date: value } }
  const [algoParams, setAlgoParams] = useState<Record<string, Record<string, string>>>({})
  const [occupancyBands, setOccupancyBands] = useState<OccupancyBand[]>([])
  const [bandGroups, setBandGroups] = useState<BandGroup[]>([])
  const [lastMinuteLevels, setLastMinuteLevels] = useState<LastMinuteLevel[]>([])
  const [rateLimits, setRateLimits] = useState<RateLimitData[]>([])
  const [pricingVariables, setPricingVariables] = useState<{ id: string; variable_key: string; label: string; description: string; category: string; default_weight: number; weight_min: number; weight_max: number }[]>([])
  // Override di peso (importanza) delle K variabili per periodo/giorno. Servono
  // per replicare esattamente il calcolo del K del motore server nel client.
  const [weightOverrides, setWeightOverrides] = useState<WeightOverrideRow[]>([])
  const [referenceRateId, setReferenceRateId] = useState<string>("")
  const [adjustmentUnit, setAdjustmentUnit] = useState<"%" | "EUR">("%")
  const [baseOccupancy, setBaseOccupancy] = useState<number>(2)
  // Occupancy thresholds for historical scenario classification
  const [occThresholdLow, setOccThresholdLow] = useState<number>(0)
  const [occThresholdHigh, setOccThresholdHigh] = useState<number>(0)
  
  // Display mode for occupancy: "pct" shows percentage, "abs" shows sold/total (absolute).
  // Persisted in localStorage cosi' la scelta dell'utente sopravvive a reload / navigation.
  //
  // BUG FIX (15/05/2026): il pattern `useState(() => readLocalStorage())` non
  // funziona affidabilmente con SSR di Next.js. Durante il render server
  // `window` e' undefined → ritorna "pct" �� l'HTML viene serializzato con
  // "pct". L'idratazione client mantiene il valore SSR e il lazy initializer
  // NON viene rieseguito per leggere localStorage. La useEffect di
  // salvataggio inoltre scriveva immediatamente al primo mount,
  // sovrascrivendo l'eventuale valore salvato con il default "pct".
  //
  // Pattern corretto: stato inizializzato al default lato server, lettura
  // localStorage in una useEffect di sola idratazione, salvataggio
  // condizionato a `hasHydrated` per evitare di sovrascrivere il valore
  // memorizzato con il default al primo render.
  const OCC_DISPLAY_MODE_KEY = "santaddeo:pricing:occDisplayMode"
  const [occDisplayMode, setOccDisplayMode] = useState<"pct" | "abs">("pct")
  const occDisplayHydratedRef = useRef(false)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OCC_DISPLAY_MODE_KEY)
      if (stored === "abs" || stored === "pct") {
        setOccDisplayMode(stored)
      }
    } catch {
      /* localStorage non disponibile (incognito/quota) -> fallback default */
    } finally {
      occDisplayHydratedRef.current = true
    }
  }, [])
  useEffect(() => {
    // Skip al primo mount: il valore corrente potrebbe essere il default
    // "pct" prima che la useEffect di lettura abbia avuto chance di girare.
    // Senza questo guard sovrascriveremmo il "abs" salvato con il "pct"
    // iniziale.
    if (!occDisplayHydratedRef.current) return
    try {
      window.localStorage.setItem(OCC_DISPLAY_MODE_KEY, occDisplayMode)
    } catch {
      /* storage disabled or full - silently ignore, fallback is default */
    }
  }, [occDisplayMode])
  // Algorithm type: "basic" = solo fasce occupazionali, "advanced" = fasce + variabili K (matches DB CHECK constraint)
  const [algorithmType, setAlgorithmType] = useState<"basic" | "advanced">("basic")
  // INTENSIFICATORE K (30/06/2026): regole intensita' per-hotel/periodo/giorno.
  // Vuoto => resolver applica fallback globale (0.3 / 0) = comportamento storico.
  const [kIntensityRules, setKIntensityRules] = useState<KIntensityRule[]>([])
  const [kIntensityOpen, setKIntensityOpen] = useState(false)
  const [pendingAlgoMode, setPendingAlgoMode] = useState<"basic" | "advanced" | null>(null)
  // Conferma cambio unita' (EUR <-> %) sui parametri gia' configurati.
  // L'utente ha segnalato 01/05/2026 di avere accidentalmente flaggato il
  // pulsante e di aver alterato i prezzi senza accorgersene: cambiare l'unita'
  // mantiene i numeri ma cambia radicalmente il significato (es. "10" passa
  // da +10 EUR a +10%). Mostriamo un dialog di conferma se almeno un giorno
  // del calendario ha gia' un valore impostato per questa riga.
  const [pendingUnitToggle, setPendingUnitToggle] = useState<{
    paramKey: string
    label: string
    fromUnit: string
    toUnit: string
    configuredDays: number
  } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Collapse/expand per room type (default: none collapsed)
  const [collapsedRoomTypes, setCollapsedRoomTypes] = useState<Set<string>>(new Set())
  const [collapsedInitialized, setCollapsedInitialized] = useState(false)

  // Filtro VISUALE per tipologia camera (25/05/2026).
  // null = mostra tutte (default sicuro). Set di id = mostra solo quelle.
  // Questo filtro NON tocca i calcoli/aggregati/push: agisce solo sul
  // rendering delle righe della griglia. Tutti i loop che usano roomTypes
  // (autosave, suggerimenti, push prezzi, totali, occupanza struttura)
  // continuano a vedere TUTTE le tipologie -> nessun rischio di alterare
  // pricing/persistenza. Persistito in localStorage per hotelId.
  const ROOM_TYPE_FILTER_KEY_PREFIX = "santaddeo:pricing:visibleRoomTypes:"
  const [visibleRoomTypeIds, setVisibleRoomTypeIds] = useState<Set<string> | null>(null)
  const roomTypeFilterHydratedRef = useRef(false)
  useEffect(() => {
    if (!hotelId) return
    try {
      const stored = window.localStorage.getItem(ROOM_TYPE_FILTER_KEY_PREFIX + hotelId)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleRoomTypeIds(new Set(parsed))
        } else {
          setVisibleRoomTypeIds(null)
        }
      }
    } catch {
      /* ignore */
    } finally {
      roomTypeFilterHydratedRef.current = true
    }
  }, [hotelId])
  useEffect(() => {
    if (!roomTypeFilterHydratedRef.current || !hotelId) return
    try {
      if (visibleRoomTypeIds === null) {
        window.localStorage.removeItem(ROOM_TYPE_FILTER_KEY_PREFIX + hotelId)
      } else {
        window.localStorage.setItem(
          ROOM_TYPE_FILTER_KEY_PREFIX + hotelId,
          JSON.stringify([...visibleRoomTypeIds]),
        )
      }
    } catch {
      /* ignore */
    }
  }, [visibleRoomTypeIds, hotelId])

  const toggleRoomTypeCollapse = (rtId: string) => {
    setCollapsedRoomTypes((prev) => {
      const next = new Set(prev)
      if (next.has(rtId)) next.delete(rtId)
      else next.add(rtId)
      return next
    })
  }

  // Collapsed param sections (algorithm param groups)
  const [collapsedParamSections, setCollapsedParamSections] = useState<Set<string>>(new Set([
    "__section_occ", "__section_rt", "__section_nr", "__section_dm", "__section_variables"
  ]))

  // Drag-fill state (Google Sheets style)
  const [dragFill, setDragFill] = useState<{
    type: "price" | "param"
    value: string
    roomTypeId?: string
    rateId?: string
    occ?: number
    paramKey?: string
    startDate: string
  } | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  // Autosave timer
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "pending" | "saving" | "saved">("idle")

  // Table head ref for sticky scroll sync
  const tableHeadRef = useRef<HTMLTableSectionElement>(null)
  // Tbody dedicato alle righe di riepilogo (Occupazione struttura,
  // Produzione giornaliera, ADR): viene pinnato sotto il thead con lo
  // stesso meccanismo translateY (vedi effect sotto).
  const summaryRowsRef = useRef<HTMLTableSectionElement>(null)

  // Bulk fill dialog
  const [bulkFillOpen, setBulkFillOpen] = useState(false)
  const [bulkFillContext, setBulkFillContext] = useState<{
    type: "price" | "param"
    roomTypeId?: string
    rateId?: string
    occ?: number
    paramKey?: string
  } | null>(null)
  const [bulkFillStartDate, setBulkFillStartDate] = useState("")
  const [bulkFillEndDate, setBulkFillEndDate] = useState("")
  const [bulkFillValue, setBulkFillValue] = useState("")
  // Weekday filter for bulk fill: 0=Sun,1=Mon,...,6=Sat -- all enabled by default
  const [bulkFillDays, setBulkFillDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]))

  // View preferences persistence key
  const [viewPrefsLoaded, setViewPrefsLoaded] = useState(false)

  // Errore di caricamento griglia (es. outage Supabase 522): lo mostriamo
  // esplicitamente con un "Riprova" invece di lasciare la griglia VUOTA in
  // silenzio (che sembra perdita di dati). Vedi incident 23/06/2026.
  const [loadError, setLoadError] = useState<string | null>(null)

  // ------- Auth -------

  useEffect(() => {
    loadUserHotel()
  }, [])

  useEffect(() => {
  if (hotelId && !unauthorized) {
 loadData()
  }
  }, [hotelId, unauthorized, currentMonth, windowMonths])

  // Replica manualmente position:sticky sul <thead>.
  // Il wrapper overflow-x-auto del CalendarScrollContainer crea un
  // contenitore di sticky che scorre via con la pagina, quindi
  // "sticky top-X" sul thead non resta visibile durante lo scroll
  // verticale. Applichiamo un translateY dinamico sul thead per tenerlo
  // pinnato sotto la barra di scorrimento orizzontale.
  useEffect(() => {
    // FIX 15/07/2026: offset DINAMICO, non piu' 108 hardcoded. La soglia di
    // pinning e' il bottom REALE della barra scroll orizzontale (che e' a sua
    // volta pinnata): con zoom/densita'/wrap diversi l'altezza vera di
    // navbar+barra non e' 108 e restava una striscia scoperta sopra il thead
    // dove le righe scrollate (etichette prima colonna) trasparivano.
    const FALLBACK_OFFSET = 108 // navbar + barra scroll orizzontale
    let currentOffset = 0
    let lastThead: HTMLTableSectionElement | null = null
    // Offset separato per il tbody di riepilogo (Occupazione struttura,
    // Produzione giornaliera, ADR), pinnato SUBITO SOTTO il thead.
    let currentSummaryOffset = 0
    let lastSummary: HTMLTableSectionElement | null = null

    const apply = () => {
      const thead = tableHeadRef.current
      if (!thead) return
      const hbar = document.querySelector("[data-calendar-hbar]")
      const STICKY_OFFSET = hbar
        ? hbar.getBoundingClientRect().bottom
        : FALLBACK_OFFSET
      // Se il thead è cambiato (remount su cambio mese/dati), reset offset
      if (thead !== lastThead) {
        if (lastThead) {
          lastThead.style.transform = ""
          lastThead.style.willChange = ""
        }
        currentOffset = 0
        lastThead = thead
        // FIX 15/07/2026: layer di compositing PERMANENTE. Prima willChange
        // veniva messo/tolto insieme al transform: ogni toggle distrugge e
        // ricrea il layer e Chrome ridipinge male il thead traslato (strisce
        // "fantasma" con il contenuto scrollato che trasprariva tra le righe
        // pinnate). Col layer fisso il repaint e' sempre corretto.
        thead.style.willChange = "transform"
      }
      const table = thead.closest("table") as HTMLElement | null
      if (!table) return
      const theadRect = thead.getBoundingClientRect()
      const tableRect = table.getBoundingClientRect()
      // Posizione naturale = rect.top MENO l'offset attualmente applicato
      const naturalTop = theadRect.top - currentOffset
      const theadHeight = theadRect.height
      let next = 0
      if (naturalTop < STICKY_OFFSET) {
        const desired = STICKY_OFFSET - naturalTop
        // Non far uscire il thead dal fondo della tabella
        const maxOffset = tableRect.bottom - naturalTop - theadHeight
        next = Math.min(desired, Math.max(0, maxOffset))
      }
      if (Math.abs(next - currentOffset) >= 0.5) {
        thead.style.transform = next ? `translate3d(0, ${next}px, 0)` : ""
        currentOffset = next
      }

      // ----- Righe di riepilogo: pinnate sotto il thead -----
      const summary = summaryRowsRef.current
      if (summary) {
        if (summary !== lastSummary) {
          if (lastSummary) {
            lastSummary.style.transform = ""
            lastSummary.style.willChange = ""
          }
          currentSummaryOffset = 0
          lastSummary = summary
          // Layer permanente anche qui (vedi commento sul thead sopra).
          summary.style.willChange = "transform"
        }
        const sRect = summary.getBoundingClientRect()
        const sNaturalTop = sRect.top - currentSummaryOffset
        const sHeight = sRect.height
        // Soglia = subito sotto il thead pinnato
        const threshold = STICKY_OFFSET + theadHeight
        let sNext = 0
        if (sNaturalTop < threshold) {
          const desired = threshold - sNaturalTop
          // Non far uscire il blocco dal fondo della tabella
          const maxOffset = tableRect.bottom - sNaturalTop - sHeight
          sNext = Math.min(desired, Math.max(0, maxOffset))
        }
        if (Math.abs(sNext - currentSummaryOffset) >= 0.5) {
          summary.style.transform = sNext ? `translate3d(0, ${sNext}px, 0)` : ""
          currentSummaryOffset = sNext
        }
      }
    }

    window.addEventListener("scroll", apply, { passive: true })
    window.addEventListener("resize", apply)
    // Intercetta anche scroll su eventuali contenitori interni
    document.addEventListener("scroll", apply, { capture: true, passive: true })
    apply()
    // Riapplica anche dopo un frame per coprire il first paint
    const raf = requestAnimationFrame(apply)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", apply)
      window.removeEventListener("resize", apply)
      document.removeEventListener("scroll", apply, { capture: true } as EventListenerOptions)
      if (lastThead) {
        lastThead.style.transform = ""
        lastThead.style.willChange = ""
      }
      if (lastSummary) {
        lastSummary.style.transform = ""
        lastSummary.style.willChange = ""
      }
    }
  }, [])

  // FIX 03/05/2026: auto-select difensivo del primo rate. Ci sono edge
  // case (loadedRoomTypes.length === 0 al primo fetch, fallback su seconda
  // call, prefs corrotte, ecc.) in cui il branch di init in loadData()
  // non riesce a settare selectedRate, lasciando l'utente con il messaggio
  // "Seleziona un piano tariffario..." anche quando rates sono presenti.
  // Questo effect copre tutti questi casi: appena rates e roomTypes sono
  // entrambi >= 1 e selectedRate e' ancora "", forziamo "__all__" come
  // default sicuro (mostra tutte le tariffe nella griglia).
  useEffect(() => {
    if (!loading && !selectedRate && rates.length > 0 && roomTypes.length > 0) {
      setSelectedRate("__all__")
    }
  }, [loading, selectedRate, rates.length, roomTypes.length])

  async function loadUserHotel() {
    try {
      const meRes = await fetch("/api/ui/me")
      const meData = await meRes.json()
      
      // Allow SuperAdmin and any user with an active Accelerator subscription
      const allowedRoles = ["super_admin", "system_admin", "property_admin", "villa_admin"]
      const userRole = meData.role || meData.user?.role
      if (!meData.isSuperAdmin && !allowedRoles.includes(userRole)) {
        setUnauthorized(true)
        setLoading(false)
        return
      }
      
      setIsSuperAdmin(meData.isSuperAdmin || false)
      if (meData.user?.id) setUserId(meData.user.id)

      const res = await fetch("/api/ui/selected-hotel")
      const data = await res.json()
      if (data.error || !data.hotel) {
        setLoading(false)
        return
      }
      setHotelId(data.hotel.id)
      setHotelName(data.hotel.name)
    } catch (error) {
      console.error("Error loading hotel:", error)
      setLoading(false)
    }
  }

  // ------- Data loading -------

  async function loadData() {
    if (!hotelId) return
    setLoading(true)
    setLoadError(null)

    // La griglia e' range-based: chiediamo l'intera finestra (1/3 mesi) in una
    // sola chiamata, cosi' i prezzi/occupancy coprono tutte le colonne visibili.
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd")
    const monthEnd = format(endOfMonth(addMonths(currentMonth, windowMonths - 1)), "yyyy-MM-dd")

    try {
      const params = new URLSearchParams({ hotel_id: hotelId, month_start: monthStart, month_end: monthEnd })

      // Load pricing grid + algo params
      const gridRes = await fetch(`/api/accelerator/pricing-grid?${params}`)
      if (!gridRes.ok) {
        if (gridRes.status === 401) { window.location.href = "/auth/login"; return }
        // 503/522/504 = problema temporaneo (outage o lentezza Supabase/PMS),
        // NON un errore di configurazione: messaggio dedicato + Riprova.
        throw new Error(
          gridRes.status >= 500
            ? "OUTAGE"
            : `Errore ${gridRes.status}`,
        )
      }
      const gridData = await gridRes.json()
      const loadedRoomTypes = gridData.roomTypes || []
      setRoomTypes(loadedRoomTypes)
      setRates(gridData.rates || [])
      setGridPrices(gridData.prices || {})
      setOccupancyData(gridData.occupancy || {})
      setAlgoParams(gridData.algoParams || {})

      setOccupancyBands(gridData.occupancyBands || [])
      setBandGroups(gridData.bandGroups || [])
      setLastMinuteLevels(gridData.lastMinuteLevels || [])

      

      // Load algorithm type from subscription
      try {
        const subRes = await fetch(`/api/accelerator/subscription?hotel_id=${hotelId}`)
        if (subRes.ok) {
          const subData = await subRes.json()
          const sub = subData.subscriptions?.[0] || subData.subscription
          if (sub?.algorithm_type) {
            setAlgorithmType(sub.algorithm_type === "advanced" ? "advanced" : "basic")
          }
        }
      } catch (err) { console.error("[v0] pricing page - error loading subscription:", err) }

      // INTENSIFICATORE K (30/06/2026): carica le regole intensita' dell'hotel.
      // Vuoto/errore => stato [] => resolver applica fallback globale (storico).
      try {
        const kRes = await fetch(`/api/accelerator/k-intensity?hotel_id=${hotelId}`)
        if (kRes.ok) {
          const kData = await kRes.json()
          const loadedRules: KIntensityRule[] = Array.isArray(kData.rules) ? kData.rules : []
          setKIntensityRules(loadedRules)
          // Seed della riga inline "Intensificatore K (prezzo base)": popoliamo
          // algoParams["k_base_intensity"] SOLO con le regole di scope 'day'
          // (override puntuali). I giorni che ereditano da periodo/default
          // restano vuoti (cella "-") per non trasformare l'ereditarieta' in
          // override espliciti. Merge funzionale: viene applicato DOPO il
          // setAlgoParams(gridData.algoParams) sopra, quindi non c'e' race.
          const dayMap: Record<string, string> = {}
          for (const r of loadedRules) {
            if (r.scope === "day" && r.date_from) {
              dayMap[r.date_from] = String(r.base_intensity ?? 0)
            }
          }
          setAlgoParams((prev) => ({ ...prev, k_base_intensity: dayMap }))
        }
      } catch (err) { console.error("[v0] pricing page - error loading k-intensity rules:", err) }

  // Restore view preferences from localStorage, keyed by operator (userId) + hotel
  if (!collapsedInitialized && loadedRoomTypes.length > 0) {
  const prefsKey = userId ? `santaddeo_pricing_view_prefs_${userId}_${hotelId}` : `santaddeo_pricing_view_prefs_${hotelId}`
        let storedPrefs: { selectedRate?: string; showAvgProduction?: boolean; collapsedRoomTypes?: string[]; collapsedParamSections?: string[]; windowMonths?: number } | null = null
        try {
          const raw = localStorage.getItem(prefsKey)
          if (raw) storedPrefs = JSON.parse(raw)
        } catch { /* ignore */ }

        if (storedPrefs) {
          // Restore collapsed room types (validate IDs still exist)
          const validRtIds = new Set(loadedRoomTypes.map((rt: RoomType) => rt.id))
          if (storedPrefs.collapsedRoomTypes) {
            const restored = storedPrefs.collapsedRoomTypes.filter((id: string) => validRtIds.has(id))
            setCollapsedRoomTypes(new Set(restored))
          } else {
            // No stored collapsed preference: default to all expanded
            setCollapsedRoomTypes(new Set())
          }
          // Restore collapsed param sections
          if (storedPrefs.collapsedParamSections) {
            setCollapsedParamSections(new Set(storedPrefs.collapsedParamSections))
          }
          // Restore selected rate (validate still exists)
          const validRateIds = new Set((gridData.rates || []).map((r: Rate) => r.id))
          if (storedPrefs.selectedRate && (storedPrefs.selectedRate === "__all__" || validRateIds.has(storedPrefs.selectedRate))) {
            setSelectedRate(storedPrefs.selectedRate)
          } else if (gridData.rates?.length > 0) {
            setSelectedRate(gridData.rates[0].id)
          }
          // Restore production toggle
          if (typeof storedPrefs.showAvgProduction === "boolean") {
            setShowAvgProduction(storedPrefs.showAvgProduction)
          }
          // Restore finestra calendario (1/2/3 mesi)
          if (storedPrefs.windowMonths === 1 || storedPrefs.windowMonths === 2 || storedPrefs.windowMonths === 3) {
            setWindowMonths(storedPrefs.windowMonths)
          }
          // Always start on the current month — do NOT restore a saved month from localStorage
        } else {
          // No stored prefs: use defaults (all expanded)
          setCollapsedRoomTypes(new Set())
          if (gridData.rates?.length > 0) {
            setSelectedRate(gridData.rates[0].id)
          }
        }

        setCollapsedInitialized(true)
        setViewPrefsLoaded(true)
      } else if (!selectedRate && gridData.rates?.length > 0) {
        setSelectedRate(gridData.rates[0].id)
      }

      // Set default reference room type if not yet set
      if (!referenceRoomTypeId && gridData.roomTypes?.length > 0) {
        const savedRef = gridData.algoParams?.["reference_room_type_id"]
        const refId = savedRef ? Object.values(savedRef)[0] : null
        setReferenceRoomTypeId(refId || gridData.roomTypes[0].id)
      }

      // Production data: channel-production e' month-scoped. Per la finestra
      // (1/3 mesi) facciamo una chiamata per ogni mese e UNIAMO le mappe
      // per-data in un'unica state-update, cosi' nessuna colonna resta vuota.
      // (La vecchia fetch /api/dashboard/production era inutilizzata -> rimossa.)
      const windowMonthsList = Array.from({ length: windowMonths }, (_, i) => addMonths(currentMonth, i))
      const chanResults = await Promise.all(
        windowMonthsList.map((m) =>
          fetch(`/api/accelerator/channel-production?hotelId=${hotelId}&month=${format(m, "yyyy-MM-dd")}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ),
      )

      // Merge helper per mappe annidate rt -> data -> valore.
      const mergeNested = <T,>(
        target: Record<string, Record<string, T>>,
        src: Record<string, Record<string, T>> | undefined,
      ) => {
        if (!src) return
        for (const [rt, byDate] of Object.entries(src)) {
          target[rt] = { ...(target[rt] || {}), ...byDate }
        }
      }

      const mergedCounts: Record<string, Record<string, number>> = {}
      const mergedPrices: Record<string, Record<string, number>> = {}
      // Occupancy: partiamo da quella della griglia (gia' sull'intera finestra)
      // e sovrascriviamo coi dati piu' precisi del channel quando presenti, cosi'
      // un mese il cui channel-fetch fallisce mantiene comunque il fallback grid.
      const mergedOcc: Record<string, Record<string, { available: number; total: number }>> = {}
      mergeNested(mergedOcc, gridData.occupancy || {})
      const mergedPrevYear: Record<string, { occupancy_rate: number; total_revenue: number; adr: number; rooms_occupied: number }> = {}

      for (const chanData of chanResults) {
        if (!chanData) continue
        mergeNested(mergedCounts, chanData.dailyCounts)
        mergeNested(mergedPrices, chanData.dailyPrices)
        mergeNested(mergedOcc, chanData.occupancy)
        if (chanData.prevYear) Object.assign(mergedPrevYear, chanData.prevYear)
      }

      if (Object.keys(mergedCounts).length > 0) setFetchedDailyCounts(mergedCounts)
      if (Object.keys(mergedPrices).length > 0) setFetchedDailyPrices(mergedPrices)
      if (Object.keys(mergedOcc).length > 0) setOccupancyData(mergedOcc)
      if (Object.keys(mergedPrevYear).length > 0) {
        setPrevYearData(mergedPrevYear)
        const roomsValues = Object.values(mergedPrevYear)
          .map((d) => d?.rooms_occupied).filter((v) => v && v > 0).sort((a, b) => (a || 0) - (b || 0))
        if (roomsValues.length > 0) {
          setOccThresholdLow(roomsValues[Math.floor(roomsValues.length * 0.25)])
          setOccThresholdHigh(roomsValues[Math.floor(roomsValues.length * 0.75)])
        }
      }

      // Load rate limits, pricing variables, weather and events in parallel
      // (eventi sull'intera finestra visibile, non solo sul mese corrente).
      const monthFrom = format(startOfMonth(currentMonth), "yyyy-MM-dd")
      const monthTo = format(endOfMonth(addMonths(currentMonth, windowMonths - 1)), "yyyy-MM-dd")
      const [rlRes, pvRes, weatherRes, eventsRes] = await Promise.all([
        fetch("/api/settings/rate-limits"),
        fetch(`/api/settings/pricing-variables?hotelId=${hotelId}`),
        fetch(`/api/accelerator/weather?hotel_id=${hotelId}`),
        fetch(`/api/accelerator/events?hotel_id=${hotelId}&from=${monthFrom}&to=${monthTo}`),
      ])
      if (rlRes.ok) {
        const rlData = await rlRes.json()
        setRateLimits(rlData.rateLimits || [])
      }
      if (pvRes.ok) {
        const pvData = await pvRes.json()
        setPricingVariables(pvData.variables || [])
        setWeightOverrides(pvData.weightOverrides || [])
      }
      // Load weather forecasts
      if (weatherRes.ok) {
        const weatherJson = await weatherRes.json()
        const forecasts = weatherJson.forecasts || []
        const weatherMap: Record<string, { weatherScore: number; temperatureMax: number; temperatureMin: number; weatherDescription: string; precipitationProbability: number }> = {}
        for (const f of forecasts) {
          weatherMap[f.date] = {
            weatherScore: f.weatherScore,
            temperatureMax: f.temperatureMax,
            temperatureMin: f.temperatureMin,
            weatherDescription: f.weatherDescription,
            precipitationProbability: f.precipitationProbability,
          }
        }
        setWeatherData(weatherMap)
        // Also load previous year weather for historical comparison
        const prevYearWeatherMap: Record<string, { weatherScore: number; temperatureMax: number }> = {}
        for (const f of (weatherJson.prevYearWeather || [])) {
          const monthDay = f.date?.slice(5) // "MM-DD"
          if (monthDay) {
            prevYearWeatherMap[monthDay] = { weatherScore: f.weatherScore, temperatureMax: f.temperatureMax }
          }
        }
        setPrevYearWeather(prevYearWeatherMap)
      }

      // Load hotel events
      if (eventsRes.ok) {
        const eventsJson = await eventsRes.json()
        const evMap: Record<string, { id: string; name: string; type: string; country_code: string | null; impact: string; color: string }[]> = {}
        for (const ev of (eventsJson.events || [])) {
          if (!evMap[ev.date]) evMap[ev.date] = []
          evMap[ev.date].push(ev)
        }
        setEventsData(evMap)
      }

      // Set default reference rate if not yet set
      if (!referenceRateId && gridData.rates?.length > 0) {
        const savedRefRate = gridData.algoParams?.["reference_rate_id"]
        const refRateId = savedRefRate ? Object.values(savedRefRate)[0] : null
        setReferenceRateId((refRateId as string) || gridData.rates[0].id)
      }

      // Restore adjustment unit and base occupancy from saved params
      const savedUnit = gridData.algoParams?.["adjustment_unit"]
      if (savedUnit) {
        const unitVal = Object.values(savedUnit)[0] as string
        if (unitVal === "%" || unitVal === "EUR") setAdjustmentUnit(unitVal)
      }
          const savedBaseOcc = gridData.algoParams?.["base_occupancy"]
          if (savedBaseOcc) {
            const occVal = Number(Object.values(savedBaseOcc)[0])
            if (occVal >= 1 && occVal <= 6) setBaseOccupancy(occVal)
          }
          // Occupancy thresholds
          const savedLow = gridData.algoParams?.["occ_threshold_low"]
          if (savedLow) setOccThresholdLow(Number(Object.values(savedLow)[0]) || 0)
          const savedHigh = gridData.algoParams?.["occ_threshold_high"]
          if (savedHigh) setOccThresholdHigh(Number(Object.values(savedHigh)[0]) || 0)
    } catch (error) {
      console.error("Error loading data:", error)
      const msg = error instanceof Error ? error.message : String(error)
      const isOutage = msg === "OUTAGE" || /522|503|504|gateway|timeout|fetch/i.test(msg)
      setLoadError(
        isOutage
          ? "I dati dei prezzi non sono al momento raggiungibili (problema temporaneo di connessione al server). I tuoi prezzi sono al sicuro: riprova tra qualche istante."
          : "Si è verificato un errore nel caricamento dei prezzi. Riprova.",
      )
    } finally {
      setLoading(false)
      setEditedPrices({})
      setHasChanges(false)
    }
  }

  // ------- Autosave (debounced) -------
  // Store handleSaveAll in a ref to avoid stale closure issues
  // Initialized as no-op, will be updated once handleSaveAll is defined
  const handleSaveAllRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Track editedPrices changes count for triggering autosave
  const editedPricesCount = Object.keys(editedPrices).length
  // Version counter that increments on every algoParam edit to trigger autosave
  const [algoParamsVersion, setAlgoParamsVersion] = useState(0)
  
  useEffect(() => {
    // Trigger autosave whenever hasChanges is true
    // hasChanges is set to true by any edit (price or param), reset to false after save
    if (!hasChanges || !hotelId) return
    
    setAutoSaveStatus("pending")
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      handleSaveAllRef.current()
    }, 2000)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [hasChanges, hotelId, editedPricesCount, algoParamsVersion])

  // ------- Persist view preferences to localStorage -------
  useEffect(() => {
  if (!viewPrefsLoaded || !hotelId) return
  const prefsKey = userId ? `santaddeo_pricing_view_prefs_${userId}_${hotelId}` : `santaddeo_pricing_view_prefs_${hotelId}`
    const prefs = {
      selectedRate,
      showAvgProduction,
      collapsedRoomTypes: Array.from(collapsedRoomTypes),
      collapsedParamSections: Array.from(collapsedParamSections),
      currentMonth: format(currentMonth, "yyyy-MM"),
      windowMonths,
    }
    try {
      localStorage.setItem(prefsKey, JSON.stringify(prefs))
    } catch { /* quota exceeded or private mode */ }
  }, [viewPrefsLoaded, hotelId, userId, selectedRate, showAvgProduction, collapsedRoomTypes, collapsedParamSections, currentMonth, windowMonths])

  // ------- Day columns -------

  const todayStr = format(new Date(), "yyyy-MM-dd")


  const production: DayColumn[] = useMemo(() => {
    const start = startOfMonth(currentMonth)
    // La finestra parte dal mese corrente e copre `windowMonths` mesi pieni.
    const end = endOfMonth(addMonths(currentMonth, windowMonths - 1))
    return eachDayOfInterval({ start, end }).map((d, i) => ({
      date: format(d, "yyyy-MM-dd"),
      dayOfWeek: format(d, "EEE", { locale: it }),
      dayNum: format(d, "d"),
      isToday: format(d, "yyyy-MM-dd") === todayStr,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      monthShort: format(d, "MMM", { locale: it }),
      // Primo giorno del mese OPPURE prima colonna in assoluto: qui mostriamo
      // l'abbreviazione del mese direttamente nell'header dei giorni, cosi' il
      // mese resta leggibile anche quando la banda mese in cima scorre via.
      isMonthStart: i === 0 || d.getDate() === 1,
    }))
  }, [currentMonth, windowMonths, todayStr])

  const todayIdx = production.findIndex((d) => d.isToday)

  // Raggruppa i giorni visibili per mese, cosi' con la finestra multi-mese una
  // banda in cima all'header mostra a quale mese appartiene ogni blocco di
  // colonne (scorre insieme ai giorni).
  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; span: number }[] = []
    for (const day of production) {
      const key = day.date.slice(0, 7) // "yyyy-MM"
      const last = groups[groups.length - 1]
      if (last && last.key === key) {
        last.span += 1
      } else {
        const label = format(parseISO(day.date), "MMMM yyyy", { locale: it })
        groups.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), span: 1 })
      }
    }
    return groups
  }, [production])

  // ------- Helpers -------

  const selectedRateObj = rates.find((r) => r.id === selectedRate)
  const referenceRoomType = roomTypes.find((rt) => rt.id === referenceRoomTypeId)
  const referenceRoomTypeIndex = roomTypes.findIndex((rt) => rt.id === referenceRoomTypeId)

  function getOccupancy(roomTypeId: string, dateStr: string) {
    const data = occupancyData[roomTypeId]?.[dateStr]
    if (!data || !data.total) return null
    const sold = data.total - data.available
    return Math.round((sold / data.total) * 100)
  }

  function getAvgProduction(code: string, dateStr: string) {
    const total = dailyPrices[code]?.[dateStr]
    const count = dailyCounts[code]?.[dateStr]
    if (!total || !count) return null
    return total / count
  }

  function getOccBgColor(occ: number) {
    if (occ >= 90) return "bg-red-100"
    if (occ >= 70) return "bg-orange-100"
    if (occ >= 50) return "bg-yellow-100"
    if (occ >= 30) return "bg-emerald-100"
    return "bg-gray-50"
  }

  function getOccTextColor(occ: number) {
    if (occ >= 90) return "text-red-700"
    if (occ >= 70) return "text-orange-700"
    if (occ >= 50) return "text-yellow-700"
    if (occ >= 30) return "text-emerald-700"
    return "text-gray-500"
  }

  const formatShort = (amount: number) => {
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`
    return amount.toFixed(0)
  }

  const formatEuro = (amount: number) =>
    amount.toLocaleString("it-IT", { style: "currency", currency: "EUR" })

  // 07/07/2026: mappa { variable_id: { dateStr: weight } } costruita con lo
  // STESSO resolver del server (buildWeightOverrideMap). Copre l'intera finestra
  // visibile della griglia. Serve a calculateK per usare il peso per-data
  // (override stagionale/spot) invece del solo default_weight -> allinea il K a
  // video con quello del motore server (fix drift 246 vs 249).
  const weightOverrideMap = useMemo(() => {
    if (weightOverrides.length === 0 || production.length === 0) return {}
    const rangeStart = production[0].date
    const rangeEnd = production[production.length - 1].date
    return buildWeightOverrideMap(weightOverrides, rangeStart, rangeEnd)
  }, [weightOverrides, production])

  // ------- Coefficiente K: media pesata normalizzata delle variabili di pressione -------
  // Scala input: 0-10 dove 5 = neutro. Output: [-1, +1] dove 0 = neutro
  // K > 0: domanda alta -> incrementi piu' aggressivi
  // K < 0: domanda bassa -> incrementi smorzati
  // NB (30/06/2026): l'ex costante K_INTENSITY=0.3 e' ora risolta per-data
  // dall'intensificatore (resolveKIntensity); fallback globale = 0.3.

  function calculateK(dateStr: string): { k: number; details: { key: string; label: string; value: number; weight: number }[] } {
    if (!pricingVariables || pricingVariables.length === 0) return { k: 0, details: [] }
    const activeVars = pricingVariables.filter(v => v.is_active !== false)
    if (activeVars.length === 0) return { k: 0, details: [] }

    let sumWeighted = 0
    let sumWeightsMax = 0
    const details: { key: string; label: string; value: number; weight: number }[] = []

    for (const v of activeVars) {
      const paramVal = getAlgoParam(`var_${v.variable_key}`, dateStr)
      const value = paramVal !== "" ? Number(paramVal) : (v.default_weight ?? 5)
      // Peso per-data: se esiste un override stagionale/spot per questa data lo
      // usiamo, altrimenti default_weight. IDENTICO al motore server (vedi
      // calculate-suggested-price.ts calculateK).
      const overrideWeight = getOverriddenWeight(weightOverrideMap, v.id, dateStr)
      const weight = overrideWeight !== undefined ? overrideWeight : (v.default_weight ?? 5)
      if (isNaN(value) || weight <= 0) continue
      // value e' su scala 0-10, weight e' l'importanza relativa
      sumWeighted += value * weight
      sumWeightsMax += 10 * weight // max possibile: tutti a 10
      details.push({ key: v.variable_key, label: v.label, value, weight })
    }

    if (sumWeightsMax === 0) return { k: 0, details }
    // K_raw [0, 1] -> K_norm [-1, +1] centrato su 0.5 (= valore 5/10)
    const kRaw = sumWeighted / sumWeightsMax // [0, 1]
    const kNorm = (kRaw - 0.5) * 2 // [-1, +1]
    return { k: Math.max(-1, Math.min(1, kNorm)), details }
  }

  // ------- Pricing Engine: calculates suggested price per room type per day -------

  const getRateLimit = useCallback(
    (roomTypeId: string) => rateLimits.find((rl) => rl.room_type_id === roomTypeId),
    [rateLimits]
  )

  // Helper: get occupancies configured for a rate, INTERSECATE col range della camera.
  //
  // FIX (29/04/2026): la tariffa puo' avere arrangements per pax 1-6 (tipico
  // listino multi-camera), ma una camera doppia (max=2) non puo' accettare
  // occ 3-6. Prima la UI mostrava tutte le pax dell'arrangement schiacciando
  // qualunque vincolo della camera: l'utente compilava prezzi per occ fuori
  // range, il push li mandava a Scidoo che li scartava silenziosamente.
  //
  // FIX (30/04/2026): se la tariffa ha arrangements ESPLICITAMENTE definiti
  // (array popolato), e l'intersezione col range della camera e' vuota,
  // ritorniamo [] invece di cadere sul fallback wide. Questo nasconde
  // automaticamente le combo (rate, camera, occ) che non sono mappate
  // (es. tariffa "Family" con arrangements pax 2-6 applicata a una camera
  // singola: prima generavamo erroneamente la riga occ=1, ora skippata).
  // Il fallback wide resta SOLO quando la tariffa non ha arrangements
  // affatto, per non rompere hotel legacy con dati incompleti.
  function getOccupanciesForRate(rate: Rate, roomType: RoomType): number[] {
    const minOcc = roomType.min_occupancy ?? 1
    const maxOcc = roomType.max_occupancy ?? roomType.capacity ?? roomType.capacity_default ?? 2
    const inRoomRange = (p: number) => p >= minOcc && p <= maxOcc

    // First check arrangements.pax — strict path: if arrangements are
    // explicitly defined we trust them as the source of truth.
    if (rate.arrangements && Array.isArray(rate.arrangements) && rate.arrangements.length > 0) {
      const paxValues = rate.arrangements
        .map(arr => arr.pax)
        .filter((p): p is number => typeof p === "number" && p > 0)
      if (paxValues.length > 0) {
        const clamped = [...new Set(paxValues)].filter(inRoomRange).sort((a, b) => a - b)
        // Return clamped result EVEN IF EMPTY: an explicit-but-empty
        // intersection signals "this rate is not configured for this
        // room type" and the row should not be rendered.
        return clamped
      }
      // Arrangements exist but none have a numeric pax: treat as
      // misconfigured rate and skip rendering.
      return []
    }

    // Fallback to raw_data.pax (legacy single-pax shape)
    if (rate.raw_data?.pax && typeof rate.raw_data.pax === "number" && rate.raw_data.pax > 0) {
      const p = rate.raw_data.pax
      if (inRoomRange(p)) return [p]
      // Single explicit pax outside the room range: rate not applicable.
      return []
    }

    // Final fallback: rate has NO arrangements info AND no raw_data.pax —
    // generate occupancies from min to max of the room type. Mantained for
    // backward compat with hotels imported before arrangements existed.
    return Array.from({ length: maxOcc - minOcc + 1 }, (_, i) => minOcc + i)
  }

  // Compute daily production (revenue) and booking counts.
  // Priority: real booking data from channel-production API (fetchedDailyPrices),
  // fallback to projected data from grid prices × occupancy.
  const dailyPrices = useMemo(() => {
    // If we have real fetched data, prefer it
    if (Object.keys(fetchedDailyPrices).length > 0) return fetchedDailyPrices
    // Fallback: project from grid prices × sold rooms
    const result: Record<string, Record<string, number>> = {}
    for (const rt of roomTypes) {
      result[rt.id] = {}
      for (const day of production) {
        const occData = occupancyData[rt.id]?.[day.date]
        if (!occData) continue
        const sold = occData.total - occData.available
        if (sold <= 0) continue
        let avgPrice = 0
        let priceCount = 0
        for (const rate of rates) {
          const occs = getOccupanciesForRate(rate, rt)
          for (const occ of occs) {
            const key = `${rt.id}|${rate.id}|${occ}|${day.date}`
            const val = gridPrices[key]
            if (val !== undefined && val !== null && val !== "") {
              avgPrice += Number(val) || 0
              priceCount++
            }
          }
        }
        if (priceCount > 0) {
          result[rt.id][day.date] = (avgPrice / priceCount) * sold
        }
      }
    }
    return result
  }, [fetchedDailyPrices, roomTypes, production, occupancyData, rates, gridPrices])

  const dailyCounts = useMemo(() => {
    // If we have real fetched data, prefer it
    if (Object.keys(fetchedDailyCounts).length > 0) return fetchedDailyCounts
    // Fallback: use sold rooms from availability
    const result: Record<string, Record<string, number>> = {}
    for (const rt of roomTypes) {
      result[rt.id] = {}
      for (const day of production) {
        const occData = occupancyData[rt.id]?.[day.date]
        if (!occData) continue
        const sold = occData.total - occData.available
        if (sold > 0) {
          result[rt.id][day.date] = sold
        }
      }
    }
    return result
  }, [fetchedDailyCounts, roomTypes, production, occupancyData])

  // Helper to read algo param value for a specific key and date
  function getAlgoParam(paramKey: string, date: string): string {
    return algoParams[paramKey]?.[date] ?? ""
  }

  // Handler to update algo param and mark changes
  function handleAlgoParamChange(paramKey: string, date: string, value: string) {
    // Remember the affected date so the effect (keyed off algoParamsVersion)
    // can recompute suggestions for that day and mark impacted cells as
    // user-modified for the "Invia prezzi modificati" push.
    pendingAlgoDatesRef.current.add(date)
    setAlgoParams((prev) => ({
      ...prev,
      [paramKey]: {
        ...(prev[paramKey] || {}),
        [date]: value,
      },
    }))
    setAlgoParamsVersion((v) => v + 1)
    setHasChanges(true)
  }

  /**
   * calculateSuggestedPrice
   * Formula (faithful to user spec):
   *   1. Start with base_rate for the day (= reference room type, base occupancy)
   *   2. Apply occupancy band increment (hotel-level occupancy for that day)
   *   3. Apply room type adjustment (relative to reference room type)
   *   4. Apply market demand weight as global multiplier
   *   5. Apply last-minute discount if within window
   *   6. Apply occupancy-camera chain adjustment (per-pax pricing)
   *   7. Clamp to [bottom_rate, rack_rate]
   *
   * Occupancy camera is CHAIN-BASED:
   *   base (e.g. doppia) = refPrice
   *   tripla = doppia + occ_adj_3
   *   quadrupla = tripla + occ_adj_4
   *   singola = doppia - |occ_adj_1|
   */
  function calculateSuggestedPrice(roomTypeId: string, dateStr: string, forOccupancy?: number, forRateId?: string): number | null {
    // Note: we calculate suggested prices for ALL dates (past and future).
    // Past dates are shown read-only in the grid as historical reference.
    // The "save" action already skips past dates via disabled inputs.

    // 1. Base rate
    const baseRateStr = getAlgoParam("base_rate", dateStr)
    if (!baseRateStr || isNaN(Number(baseRateStr))) return null
    const baseRate = Number(baseRateStr)
    if (baseRate <= 0) return null

    let price = baseRate

    // INTENSIFICATORE K (30/06/2026): intensita' risolte per-data (incremento +
    // base). Se non ci sono regole, resolver -> fallback globale (0.3 / 0) =
    // comportamento storico identico.
    const { incrementIntensity, baseIntensity } = resolveKIntensity(kIntensityRules, dateStr)
    // Override INLINE (griglia): se per questo giorno e' stato inserito un valore
    // nella riga "Intensificatore K (prezzo base)", quello vince sull'ereditato
    // (anteprima reattiva mentre l'utente digita, prima del salvataggio). Cella
    // vuota => si usa il valore risolto da periodo/default.
    const inlineBaseStr = getAlgoParam("k_base_intensity", dateStr)
    const baseIntensityEff =
      inlineBaseStr !== "" && !isNaN(Number(inlineBaseStr))
        ? Math.max(0, Math.min(K_INTENSITY_BASE_CAP, Number(inlineBaseStr)))
        : baseIntensity
    // NUOVO canale: K modula DIRETTAMENTE il prezzo base. baseIntensity=0
    // (default/fallback) o K=0 (modalita' BASE) => fattore (1+0) = no-op.
    const kBase = algorithmType === "advanced" ? calculateK(dateStr).k : 0
    price = price * (1 + kBase * baseIntensityEff)

    // 1b. Scenario storico (ALTA/BASSA anno precedente) — RIMOSSO DAL CALCOLO
    // (22/07/2026, decisione utente). Il motore server (calculate-suggested-price
    // .ts, usato da cron/push) non ha MAI caricato prevYearData e quindi non ha
    // mai applicato l'amplificazione ALTA (x1.15) / smorzamento BASSA (x0.5-0.8)
    // sugli incrementi: solo la UI lo faceva, creando drift UI vs prezzo
    // realmente pushato (caso Barronci Economy 22/07: UI 179 vs Scidoo 176,
    // giorno ALTA). Si e' scelto di allineare la UI al motore: la riga
    // "SCENARIO STORICO" in griglia resta puramente informativa.

    // 2. Occupancy band increment (hotel-level)
    let totalSold = 0
    let totalCap = 0
    for (const rt of roomTypes) {
      const data = occupancyData[rt.id]?.[dateStr]
      if (data && data.total > 0) {
        // 21/07/2026: allineato al motore server (calculate-suggested-price.ts):
        // totalSold = total - available. Il campo `occupied` non esiste
        // nell'occupancyData della UI (tipo { available, total }), quindi l'ex
        // `data.occupied ?? ...` era comunque un no-op; qui lo rendiamo esplicito
        // e identico al motore per evitare qualsiasi drift futuro.
        totalSold += data.total - data.available
        totalCap += data.total
      }
    }
    const hotelOcc = totalCap > 0 ? Math.round((totalSold / totalCap) * 100) : null

    // Helper: resolve per-row unit (EUR or %) from algoParam or fallback to global.
    // occ_adj defaults to EUR (fixed per-guest supplement/discount) if not explicitly set.
    const getRowUnit = (paramKey: string): "EUR" | "%" => {
      const u = getAlgoParam(`unit_${paramKey}`, dateStr)
      if (u === "EUR" || u === "%") return u
      if (paramKey.startsWith("occ_adj_")) return "EUR"
      return adjustmentUnit
    }

    // Resolve which band group to use for this day
    const dayGroupId = getAlgoParam("band_group_id", dateStr)
    // 21/07/2026: allineato al motore server. PRIMA la UI faceva
    // `bandGroups.find(...) || bandGroups[0]`: se `band_group_id` puntava a un
    // gruppo NON presente tra quelli caricati, la UI ripiegava sul primo gruppo
    // e applicava il suo incremento, mentre il motore (find senza fallback)
    // otteneva undefined -> nessuna banda -> nessun incremento. Da qui il drift
    // UI (206) vs motore (203). Ora il comportamento e' identico: se l'id non si
    // trova, bandsForDay resta vuoto come nel motore.
    const activeBandGroup = dayGroupId
      ? bandGroups.find((g) => g.id === dayGroupId)
      : bandGroups[0]
    const bandsForDay = activeBandGroup?.bands ?? []

    if (hotelOcc !== null && bandsForDay.length > 0) {
      const occMode = bandsForDay[0]?.occupancy_mode || "pct"
      const incMode = bandsForDay[0]?.increment_mode || "pct"
      const occValue = occMode === "num" ? totalSold : hotelOcc

      const band = bandsForDay.find((b) =>
        occMode === "pct"
          ? occValue >= b.min_pct && occValue <= b.max_pct
          : occValue >= (b.min_num ?? 0) && occValue <= (b.max_num ?? 0) // 21/07/2026: fallback ?? 0 come nel motore server (era ?? 999)
      )
      if (band) {
        const bandIdx = bandsForDay.indexOf(band)
        const manualIncStr = getAlgoParam(`increment_band_${bandIdx}`, dateStr)
        const defaultInc = incMode === "eur" ? Number(band.increment_eur ?? 0) : Number(band.increment_pct ?? 0)
        let incrementVal = manualIncStr !== "" ? Number(manualIncStr) : defaultInc
        // In modalità "basic" usa incremento puro della fascia, in "advanced" applica K
        // (identico al motore server: nessuno scenarioModifier, vedi nota 1b)
        if (algorithmType === "advanced") {
          const kCoeff = calculateK(dateStr).k
          incrementVal = incrementVal * (1 + kCoeff * incrementIntensity)
        }
        // In basic mode: incrementVal rimane puro senza modificatori
        if (!isNaN(incrementVal) && incrementVal !== 0) {
          const bandRowUnit = getRowUnit(`increment_band_${bandIdx}`)
          price = incMode === "eur" || bandRowUnit === "EUR"
            ? price + incrementVal
            : price * (1 + incrementVal / 100)
        }
      }
    }

    // 3. Room type adjustment (chain-based from reference)
    const targetRtIndex = roomTypes.findIndex((rt) => rt.id === roomTypeId)
    if (targetRtIndex !== -1 && targetRtIndex !== referenceRoomTypeIndex) {
      if (targetRtIndex > referenceRoomTypeIndex) {
        for (let ri = referenceRoomTypeIndex + 1; ri <= targetRtIndex; ri++) {
          const rtKey = `room_type_adj_${roomTypes[ri].id}`
          const rtAdjStr = getAlgoParam(rtKey, dateStr)
          if (rtAdjStr && !isNaN(Number(rtAdjStr))) {
            const rtAdj = Number(rtAdjStr)
            price = getRowUnit(rtKey) === "EUR" ? price + rtAdj : price * (1 + rtAdj / 100)
          }
        }
      } else {
        for (let ri = referenceRoomTypeIndex - 1; ri >= targetRtIndex; ri--) {
          const rtKey = `room_type_adj_${roomTypes[ri].id}`
          const rtAdjStr = getAlgoParam(rtKey, dateStr)
          if (rtAdjStr && !isNaN(Number(rtAdjStr))) {
            const rtAdj = Number(rtAdjStr)
            price = getRowUnit(rtKey) === "EUR" ? price - Math.abs(rtAdj) : price * (1 - Math.abs(rtAdj) / 100)
          }
        }
      }
    }

    // 4. Market demand weight (global multiplier, modulated da K solo in K-driven;
    // nessuno scenarioModifier, identico al motore server — vedi nota 1b)
    const demandStr = getAlgoParam("market_demand_weight", dateStr)
    if (demandStr && !isNaN(Number(demandStr))) {
      let demandPct = Number(demandStr)
      if (algorithmType === "advanced") {
        const kDemand = calculateK(dateStr).k
        demandPct = demandPct * (1 + kDemand * incrementIntensity)
      }
      // In basic mode: demandPct rimane puro
      price = price * (1 + demandPct / 100)
    }

    // 5. Last minute discount (level-based) — DUAL-MODE FIX 30/04/2026
    //
    // BUG: prima qui si guardava solo `level.discount_pct > 0` e
    // `level.min/max_occupancy_pct`. Da aprile 2026 i livelli last_minute
    // sono dual-mode (`discount_mode='pct'|'eur'`, `occupancy_mode='pct'|'num'`,
    // colonne `discount_eur`, `min/max_occupancy_num`). Il server applicava
    // correttamente lo sconto in tutte le modalità ma la UI lo ignorava
    // quando l'utente aveva configurato sconto in EURO o range basato sul
    // numero di camere — l'utente vedeva "il last minute non si attiva".
    //
    // NUOVA STRUTTURA (09/05/2026): fasce di occupazione CONDIVISE per hotel.
    // Quando scegli un livello (es. "Forte"), il sistema cerca la fascia che
    // contiene il numero di camere libere e applica lo sconto configurato.
    const lmDaysStr = getAlgoParam("last_minute_days", dateStr)
    const lmLevelId = getAlgoParam("last_minute_level_id", dateStr)
    if (lmDaysStr && lmLevelId) {
      const lmDays = Number(lmDaysStr)
      const level = lastMinuteLevels.find((l) => l.id === lmLevelId) as
        | (typeof lastMinuteLevels[number] & {
            shared_bands?: Array<{
              band_id: string
              min_rooms: number
              max_rooms: number
              sort_order: number
              discount_pct: number
              discount_eur?: number | null
              discount_mode: string
            }>
          })
        | undefined
      
      if (level && !isNaN(lmDays) && lmDays > 0) {
        // Day-count window: usa UTC midnight su entrambi i lati
        const now = new Date()
        const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        const checkInUtcMs = new Date(dateStr + "T00:00:00Z").getTime()
        const daysUntil = Math.floor((checkInUtcMs - todayUtcMs) / 86400000)
        
        if (daysUntil >= 0 && daysUntil <= lmDays) {
          const availableRooms = totalCap - totalSold // 21/07/2026: senza Math.max, identico al motore server
          
          // NUOVA LOGICA: usa shared_bands (fasce condivise per hotel)
          let appliedDiscount = false
          const sharedBands = level.shared_bands || []
          
          if (sharedBands.length > 0) {
            // Cerca la fascia che contiene il numero di camere libere
            for (const band of sharedBands) {
              if (availableRooms >= band.min_rooms && availableRooms <= band.max_rooms) {
                // Trovata la fascia corretta - applica lo sconto
                const discountMode = band.discount_mode === "eur" ? "eur" : "pct"
                if (discountMode === "eur" && (band.discount_eur ?? 0) > 0) {
                  price = Math.max(0, price - (band.discount_eur ?? 0))
                  appliedDiscount = true
                } else if (discountMode === "pct" && band.discount_pct > 0) {
                  price = price * (1 - band.discount_pct / 100)
                  appliedDiscount = true
                }
                break // Applica solo la prima fascia che matcha
              }
            }
          }
          
          // Fallback legacy: usa lo sconto principale del livello
          if (!appliedDiscount) {
            const availabilityPct = totalCap > 0 ? Math.round((availableRooms / totalCap) * 100) : 0
            const occMode: "pct" | "num" =
              (level as { occupancy_mode?: string }).occupancy_mode === "num" ? "num" : "pct"
            const occValue = occMode === "num" ? availableRooms : availabilityPct
            const minOcc = Number(
              (occMode === "num"
                ? (level as { min_occupancy_num?: unknown }).min_occupancy_num
                : level.min_occupancy_pct) ?? 0,
            )
            const maxOcc = Number(
              (occMode === "num"
                ? (level as { max_occupancy_num?: unknown }).max_occupancy_num
                : level.max_occupancy_pct) ?? (occMode === "num" ? totalCap : 100),
            )
            const occInRange = occValue >= minOcc && occValue <= maxOcc
            
            if (occInRange) {
              const discountMode: "pct" | "eur" =
                (level as { discount_mode?: string }).discount_mode === "eur" ? "eur" : "pct"
              const discountEur = Number((level as { discount_eur?: unknown }).discount_eur ?? 0)
              const discountPct = Number(level.discount_pct ?? 0)
              
              if (discountMode === "eur" && discountEur > 0) {
                price = Math.max(0, price - discountEur)
              } else if (discountMode === "pct" && discountPct > 0) {
                price = price * (1 - discountPct / 100)
              }
            }
          }
        }
      }
    }

    // 6. Occupancy-camera adjustment (singola/tripla/quadrupla)
    // Il prezzo base e' per l'occupazione di riferimento (es. doppia = 2).
    // Per le altre occupazioni si applica il supplemento/sconto configurato.
    const targetOcc = forOccupancy ?? baseOccupancy
    if (targetOcc !== baseOccupancy) {
      if (targetOcc > baseOccupancy) {
        // Tripla, Quadrupla: aggiungi supplemento a cascata
        for (let occ = baseOccupancy + 1; occ <= targetOcc; occ++) {
          const occKey = `occ_adj_${occ}`
          const adjStr = getAlgoParam(occKey, dateStr)
          if (adjStr && !isNaN(Number(adjStr))) {
            price = getRowUnit(occKey) === "EUR"
              ? price + Number(adjStr)
              : price * (1 + Number(adjStr) / 100)
          }
        }
      } else {
        // Singola: sottrai sconto a cascata
        for (let occ = baseOccupancy - 1; occ >= targetOcc; occ--) {
          const occKey = `occ_adj_${occ}`
          const adjStr = getAlgoParam(occKey, dateStr)
          if (adjStr && !isNaN(Number(adjStr))) {
            price = getRowUnit(occKey) === "EUR"
              ? price - Math.abs(Number(adjStr))
              : price * (1 - Math.abs(Number(adjStr)) / 100)
          }
        }
      }
    }

    // 6b. Rate plan adjustment (derived rates vs reference rate)
    const targetRateId = forRateId || referenceRateId
    if (targetRateId && targetRateId !== referenceRateId) {
      const rateKey = `rate_adj_${targetRateId}`
      const rateAdjStr = getAlgoParam(rateKey, dateStr)
      if (rateAdjStr && !isNaN(Number(rateAdjStr))) {
        const rateAdj = Number(rateAdjStr)
        price = getRowUnit(rateKey) === "EUR" ? price + rateAdj : price * (1 + rateAdj / 100)
      }
    }

    // 6c. NR / Derived rate discount - uses rate mapping from database
    // Priority: 1) rate.discount_percentage from mapping, 2) fallback to algo params
    const targetRate = rates.find(r => r.id === targetRateId)
    const isNrRate = targetRate?.rate_type === "nr" || 
                     targetRate?.name?.toUpperCase().includes("NR") || 
                     targetRate?.name?.toLowerCase().includes("non rimb")
    const isDerivedRate = targetRate?.rate_type === "derived" || targetRate?.rate_type === "promo"
    
    if (isNrRate || isDerivedRate) {
      // Get discount from rate mapping (preferred) or fallback to algo params
      let nrDiscountPct: number | null = null
      let nrReleaseDays: number = 0
      
      if (targetRate?.discount_percentage != null) {
        // Use discount from rate mapping (already stored as negative, e.g., -10)
        nrDiscountPct = targetRate.discount_percentage
        nrReleaseDays = targetRate.release_days ?? 0
      } else {
        // Fallback to algo params for backward compatibility
        const nrDiscountPctStr = getAlgoParam("nr_release_pct", dateStr)
        const nrReleaseDaysStr = getAlgoParam("nr_release_days", dateStr)
        if (nrDiscountPctStr && !isNaN(Number(nrDiscountPctStr)) && Number(nrDiscountPctStr) !== 0) {
          nrDiscountPct = Number(nrDiscountPctStr)
          nrReleaseDays = nrReleaseDaysStr && !isNaN(Number(nrReleaseDaysStr)) ? Number(nrReleaseDaysStr) : 0
        }
      }
      
      if (nrDiscountPct !== null && nrDiscountPct !== 0) {
        // Check if we're within the release window (NR available until X days before check-in)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const checkInDate = new Date(dateStr + "T00:00:00Z")
        const daysUntil = Math.floor((checkInDate.getTime() - today.getTime()) / 86400000)
        
        // NR is available if days until check-in is greater than release days
        // For non-NR derived rates, always apply (no release restriction)
        const withinReleaseWindow = !isNrRate || daysUntil > nrReleaseDays
        
        if (withinReleaseWindow) {
          // Apply discount (use Math.abs to handle negative values like -10)
          price = price * (1 - Math.abs(nrDiscountPct) / 100)
        }
      }
    }

    // 7. Clamp to [bottom_rate, rack_rate]
    const rl = getRateLimit(roomTypeId)
    if (rl) {
      if (rl.bottom_rate > 0 && price < rl.bottom_rate) price = rl.bottom_rate
      if (rl.rack_rate > 0 && price > rl.rack_rate) price = rl.rack_rate
    }

    return Math.round(price)
  }

  /**
   * isLastMinuteActive(dateStr)
   * Returns true if, for the given check-in date, the last-minute discount is
   * currently being applied in the pricing calculation. Mirrors the logic at
   * step 5 of calculateSuggestedPrice so a small visual badge can be shown in
   * the grid without recomputing the whole price.
   *
   * FIX 09/05/2026: aggiornato per il nuovo sistema con fasce di occupazione.
   * Ora ritorna true se trova una banda corrispondente O se il fallback del
   * livello principale matcha.
   */
  const isLastMinuteActive = (dateStr: string): boolean => {
    const lmDaysStr = getAlgoParam("last_minute_days", dateStr)
    const lmLevelId = getAlgoParam("last_minute_level_id", dateStr)
    if (!lmDaysStr || !lmLevelId) return false
    const lmDays = Number(lmDaysStr)
    if (!Number.isFinite(lmDays) || lmDays <= 0) return false

    const level = lastMinuteLevels.find((l) => l.id === lmLevelId) as
      | (typeof lastMinuteLevels[number] & {
          shared_bands?: Array<{
            band_id: string
            min_rooms: number
            max_rooms: number
            discount_pct: number
            discount_eur?: number | null
            discount_mode: string
          }>
        })
      | undefined
    if (!level) return false

    // Day-count window con UTC midnight su entrambi i lati (timezone-safe)
    const now = new Date()
    const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const checkInUtcMs = new Date(dateStr + "T00:00:00Z").getTime()
    const daysUntil = Math.floor((checkInUtcMs - todayUtcMs) / 86400000)
    if (daysUntil < 0 || daysUntil > lmDays) return false

    // Calcola occupazione hotel
    let totalSold = 0
    let totalCap = 0
    for (const rt of roomTypes) {
      const data = occupancyData[rt.id]?.[dateStr]
      if (data && data.total > 0) {
        totalSold += data.total - data.available
        totalCap += data.total
      }
    }
    const availableRooms = Math.max(0, totalCap - totalSold)

    // NUOVA STRUTTURA: cerca nelle shared_bands
    const sharedBands = level.shared_bands || []
    if (sharedBands.length > 0) {
      for (const band of sharedBands) {
        if (availableRooms >= band.min_rooms && availableRooms <= band.max_rooms) {
          // Verifica che la fascia abbia uno sconto configurato
          const discountMode = band.discount_mode === "eur" ? "eur" : "pct"
          if (discountMode === "eur" && (band.discount_eur ?? 0) > 0) return true
          if (discountMode === "pct" && band.discount_pct > 0) return true
        }
      }
    }

    // Fallback legacy: controlla lo sconto principale del livello
    const availabilityPct = totalCap > 0 ? Math.round((availableRooms / totalCap) * 100) : 0
    const occMode: "pct" | "num" =
      (level as { occupancy_mode?: string }).occupancy_mode === "num" ? "num" : "pct"
    const occValue = occMode === "num" ? availableRooms : availabilityPct
    const minOcc = Number(
      (occMode === "num"
        ? (level as { min_occupancy_num?: unknown }).min_occupancy_num
        : level.min_occupancy_pct) ?? 0,
    )
    const maxOcc = Number(
      (occMode === "num"
        ? (level as { max_occupancy_num?: unknown }).max_occupancy_num
        : level.max_occupancy_pct) ?? (occMode === "num" ? totalCap : 100),
    )
    if (occValue >= minOcc && occValue <= maxOcc) {
      const discountMode: "pct" | "eur" =
        (level as { discount_mode?: string }).discount_mode === "eur" ? "eur" : "pct"
      const discountEur = Number((level as { discount_eur?: unknown }).discount_eur ?? 0)
      const discountPct = Number(level.discount_pct ?? 0)
      if (discountMode === "eur" && discountEur > 0) return true
      if (discountMode === "pct" && discountPct > 0) return true
    }

    return false
  }

  /**
   * getLmInfo(dateStr)
   * Restituisce stato + metadati del last-minute per la data: livello e
   * sconto formattato. Riusato in due contesti:
   *   1. Riga "Prezzo suggerito" (label native title + dot rosso).
   *   2. Celle Rate x Occupanza (anello rosso + banner nel
   *      `PriceHistoryTooltip`).
   * Stessa attivazione di `isLastMinuteActive` per evitare divergenze.
   *
   * FIX 09/05/2026: mostra lo sconto della banda di occupazione effettivamente
   * applicata, non lo sconto principale del livello.
   */
  const getLmInfo = (dateStr: string): { active: boolean; levelName: string; discountLabel: string } => {
    if (!isLastMinuteActive(dateStr)) {
      return { active: false, levelName: "", discountLabel: "" }
    }
    const lmLevelId = getAlgoParam("last_minute_level_id", dateStr)
    const lvl = lastMinuteLevels.find((l) => l.id === lmLevelId) as
      | (typeof lastMinuteLevels[number] & {
          discount_mode?: string
          discount_eur?: number
          shared_bands?: Array<{
            band_id: string
            min_rooms: number
            max_rooms: number
            discount_pct: number
            discount_eur?: number | null
            discount_mode: string
          }>
        })
      | undefined
    
    if (!lvl) {
      return { active: true, levelName: "", discountLabel: "" }
    }
    
    // Calcola l'occupazione hotel per trovare la fascia corretta
    let totalSold = 0
    let totalCap = 0
    for (const rt of roomTypes) {
      const data = occupancyData[rt.id]?.[dateStr]
      if (data && data.total > 0) {
        totalSold += data.total - data.available
        totalCap += data.total
      }
    }
    const availableRooms = Math.max(0, totalCap - totalSold)
    
    // NUOVA STRUTTURA: cerca nelle shared_bands
    const sharedBands = lvl.shared_bands || []
    let appliedDiscount: { mode: "pct" | "eur"; value: number } | null = null
    
    if (sharedBands.length > 0) {
      for (const band of sharedBands) {
        if (availableRooms >= band.min_rooms && availableRooms <= band.max_rooms) {
          const discountMode = band.discount_mode === "eur" ? "eur" : "pct"
          if (discountMode === "eur" && (band.discount_eur ?? 0) > 0) {
            appliedDiscount = { mode: "eur", value: band.discount_eur ?? 0 }
          } else if (discountMode === "pct" && band.discount_pct > 0) {
            appliedDiscount = { mode: "pct", value: band.discount_pct }
          }
          break
        }
      }
    }
    
    // Fallback legacy: usa lo sconto principale del livello
    if (!appliedDiscount) {
      const mode = lvl.discount_mode === "eur" ? "eur" : "pct"
      appliedDiscount = { 
        mode, 
        value: mode === "eur" ? (lvl.discount_eur ?? 0) : (lvl.discount_pct ?? 0) 
      }
    }
    
    const discountLabel =
      appliedDiscount.mode === "eur"
        ? `${appliedDiscount.value.toFixed(2)} EUR`
        : `${appliedDiscount.value}%`
    
    return {
      active: true,
      levelName: lvl.name ?? "",
      discountLabel,
    }
  }

  /**
   * lastMinuteActivationLabel(dateStr, lmDays)
   * Given a check-in date and the configured "anticipo" (N days), returns a
   * human-readable sentence describing when the last-minute window opens for
   * that specific date. Used in the cell tooltip.
   */
  const lastMinuteActivationLabel = (dateStr: string, lmDays: number): string => {
    if (!Number.isFinite(lmDays) || lmDays < 0) return ""
    const checkIn = new Date(dateStr + "T00:00:00")
    const activation = new Date(checkIn)
    activation.setDate(activation.getDate() - lmDays)
    const fmt = new Intl.DateTimeFormat("it-IT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    const checkInLabel = fmt.format(checkIn)
    const activationLabel = fmt.format(activation)
    return `Check-in: ${checkInLabel}\nLast minute si attiva il ${activationLabel} alle 00:00\n(= ${lmDays} ${lmDays === 1 ? "giorno" : "giorni"} prima del check-in)`
  }

  // When algo params change (e.g. "Prezzo di partenza"), recompute suggestions
  // for the affected dates and flag any cell whose suggestion differs from the
  // currently saved price as user-modified. This way "Invia prezzi modificati"
  // will also push those cells even though the user never typed into them.
  useEffect(() => {
    const dates = Array.from(pendingAlgoDatesRef.current)
    if (dates.length === 0) return
    pendingAlgoDatesRef.current.clear()
    if (rates.length === 0 || roomTypes.length === 0) return
    setUserEditedCells(prev => {
      const next = new Map(prev)
      let changed = false
      for (const date of dates) {
        for (const rt of roomTypes) {
          for (const rate of rates) {
            // Only consider rates active for this room type, following the
            // same eligibility rule used when rendering the grid rows.
            const occs = getOccupanciesForRate(rate, rt)
            for (const occ of occs) {
              const suggested = calculateSuggestedPrice(rt.id, date, occ, rate.id)
              if (suggested == null) continue
              const rounded = Math.round(suggested)
              const gridKeyFlat = `${rt.id}_${rate.id}_${occ}`
              const current = gridPrices[gridKeyFlat]?.[date]
              // Flag cell only if the suggestion actually differs from saved.
              if (current == null || Math.abs(rounded - current) >= 1) {
                const fullKey = `${rt.id}_${rate.id}_${occ}_${date}`
                const existing = next.get(fullKey)
                if (existing !== rounded) {
                  next.set(fullKey, rounded)
                  changed = true
                }
              }
            }
          }
        }
      }
      return changed ? next : prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [algoParamsVersion])

  // ------- Price edit handlers -------

  // Track out-of-range warnings for UI display
  const [priceWarnings, setPriceWarnings] = useState<Record<string, string>>({})

  function handlePriceChange(key: string, value: string) {
    // Track every user edit (including clears and out-of-range corrections)
    // so the amber "modified" highlight and the "Invia prezzi modificati"
    // button know which cells are pending a manual push. We store the numeric
    // value the user last typed so the push works even AFTER auto-save has
    // cleared `editedPrices`. Empty strings are stored as NaN and filtered
    // out at push time.
    const numericVal = value === "" ? NaN : parseFloat(value)
    setUserEditedCells(prev => {
      const next = new Map(prev)
      next.set(key, numericVal)
      return next
    })
    // Any new edit clears a previous push-feedback flash on that cell
    setPushFeedback(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    // Allow clearing
    if (value === "") {
      setEditedPrices((prev) => ({ ...prev, [key]: value }))
      setPriceWarnings((prev) => { const n = { ...prev }; delete n[key]; return n })
      setHasChanges(true)
      return
    }

    const numVal = parseFloat(value)
    if (isNaN(numVal)) {
      setEditedPrices((prev) => ({ ...prev, [key]: value }))
      setHasChanges(true)
      return
    }

    // Extract roomTypeId from key (roomTypeId_rateId_occ_date)
    const parts = key.split("_")
    parts.pop() // date
    parts.pop() // occ
    parts.pop() // rateId
    const roomTypeId = parts.join("_")
    const rl = getRateLimit(roomTypeId)

    if (rl) {
      if (rl.bottom_rate > 0 && numVal < rl.bottom_rate) {
        setPriceWarnings((prev) => ({ ...prev, [key]: `Sotto il minimo (${rl.bottom_rate})` }))
        setEditedPrices((prev) => ({ ...prev, [key]: String(rl.bottom_rate) }))
        toast.warning(`Prezzo corretto a ${rl.bottom_rate} (tariffa minima)`, { duration: 3000 })
        setHasChanges(true)
        return
      }
      if (rl.rack_rate > 0 && numVal > rl.rack_rate) {
        setPriceWarnings((prev) => ({ ...prev, [key]: `Sopra il massimo (${rl.rack_rate})` }))
        setEditedPrices((prev) => ({ ...prev, [key]: String(rl.rack_rate) }))
        toast.warning(`Prezzo corretto a ${rl.rack_rate} (tariffa massima)`, { duration: 3000 })
        setHasChanges(true)
        return
      }
      // In range - clear warning
      setPriceWarnings((prev) => { const n = { ...prev }; delete n[key]; return n })
    }

    setEditedPrices((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  function getDisplayPrice(roomTypeId: string, rateId: string, occ: number, dateStr: string): string {
  const editKey = `${roomTypeId}_${rateId}_${occ}_${dateStr}`
  if (editedPrices[editKey] !== undefined) return editedPrices[editKey]
  // Use algorithm-calculated price when algo params exist (base_rate set for this day)
  const baseRateStr = algoParams["base_rate"]?.[dateStr]
  if (baseRateStr && !isNaN(Number(baseRateStr)) && Number(baseRateStr) > 0) {
  const suggested = calculateSuggestedPrice(roomTypeId, dateStr, occ, rateId)
  if (suggested !== null) return String(suggested)
  }
  // Fallback to DB-saved price
  const gridKey = `${roomTypeId}_${rateId}_${occ}`
  const saved = gridPrices[gridKey]?.[dateStr]
  return saved !== undefined ? saved.toString() : ""
  }

  // ------- Algo param edit handlers -------

  function getAlgoParam(paramKey: string, dateStr: string): string {
    return algoParams[paramKey]?.[dateStr] ?? ""
  }

  function openBulkFill(ctx: typeof bulkFillContext, startDate?: string, prefillValue?: string) {
    setBulkFillContext(ctx)
    // Data di inizio: se l'utente ha fatto doppio click su una cella specifica
    // partiamo da quella data, altrimenti dall'inizio del mese visualizzato.
    setBulkFillStartDate(startDate || production[0]?.date || "")
    setBulkFillEndDate(production[production.length - 1]?.date || "")
    // Se la cella cliccata ha gia' un valore, lo riportiamo nel popup.
    setBulkFillValue(prefillValue != null && prefillValue !== "" ? prefillValue : "")
    setBulkFillDays(new Set([0, 1, 2, 3, 4, 5, 6]))
    setBulkFillOpen(true)
  }

  function applyBulkFill() {
    if (!bulkFillContext) return
    // For dropdown params, allow empty value (means "none" for LM)
    const isDropdownParam = bulkFillContext.paramKey === "band_group_id" || bulkFillContext.paramKey === "last_minute_level_id"
    if (!isDropdownParam && bulkFillValue === "") return
    if (!bulkFillStartDate || !bulkFillEndDate) return
    if (bulkFillStartDate > bulkFillEndDate) return

    // FIX (29/04/2026): iterare per DATA invece che per `production`. Il vecchio
    // loop usava `production` (giorni del mese visualizzato): se l'utente
    // selezionava una data di fine nel mese successivo, quei giorni venivano
    // silenziosamente skippati. Ora generiamo le date direttamente dal range.
    // Sia editedPrices che algoParams sono Map indipendenti dal mese in vista
    // (l'autosave itera su Object.entries del payload completo) quindi le
    // scritture fuori-mese vengono persistite correttamente.
    const start = new Date(bulkFillStartDate + "T12:00:00")
    const end = new Date(bulkFillEndDate + "T12:00:00")
    const MAX_DAYS = 366 // cap difensivo: niente range esorbitanti per typo
    const cursor = new Date(start)
    let written = 0
    while (cursor <= end && written < MAX_DAYS) {
      const yyyy = cursor.getFullYear()
      const mm = String(cursor.getMonth() + 1).padStart(2, "0")
      const dd = String(cursor.getDate()).padStart(2, "0")
      const dateStr = `${yyyy}-${mm}-${dd}`
      const dayOfWeek = cursor.getDay() // 0=Sun..6=Sat
      if (bulkFillDays.has(dayOfWeek)) {
        if (bulkFillContext.type === "price" && bulkFillContext.roomTypeId && bulkFillContext.rateId && bulkFillContext.occ !== undefined) {
          handlePriceChange(`${bulkFillContext.roomTypeId}_${bulkFillContext.rateId}_${bulkFillContext.occ}_${dateStr}`, bulkFillValue)
        } else if (bulkFillContext.type === "param" && bulkFillContext.paramKey) {
          handleAlgoParamChange(bulkFillContext.paramKey, dateStr, bulkFillValue)
        }
        written++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    setBulkFillOpen(false)
  }

  // NOTE: handleAlgoParamChange is defined above (near line 790) and correctly
  // increments algoParamsVersion so the autosave useEffect re-schedules its
  // 2s debounce on every edit. A duplicate definition here was shadowing the
  // first one and caused two regressions:
  //   1. algoParamsVersion never incremented -> autosave timer was not reset
  //      between successive edits, so the save fired 2s after the FIRST edit
  //      and any edits queued after that (e.g. on the last day(s) of the
  //      month) ended up being written to state but not included in the POST.
  //   2. After the save completed, setHasChanges(false) made the useEffect
  //      guard skip the next run -> those queued edits became "zombie" and
  //      were never persisted. This explained why edits on 29/30 Apr stayed
  //      at the old DB value while 6-28 Apr saved correctly.

  // ------- Drag-fill (Google Sheets style) -------

  function handleDragFillStart(
    e: React.MouseEvent,
    type: "price" | "param",
    value: string,
    startDate: string,
    opts?: { roomTypeId?: string; rateId?: string; occ?: number; paramKey?: string }
  ) {
    e.preventDefault()
    if (value === "") return
    setDragFill({ type, value, startDate, ...opts })
    setDragOverDate(startDate)
  }

  function handleDragFillEnter(dateStr: string) {
    if (dragFill) setDragOverDate(dateStr)
  }

  function handleDragFillEnd() {
    if (!dragFill || !dragOverDate) {
      setDragFill(null)
      setDragOverDate(null)
      return
    }
    // Determine date range (startDate -> dragOverDate inclusive)
    const startIdx = production.findIndex((d) => d.date === dragFill.startDate)
    const endIdx = production.findIndex((d) => d.date === dragOverDate)
    if (startIdx === -1 || endIdx === -1) {
      setDragFill(null)
      setDragOverDate(null)
      return
    }
    const fromIdx = Math.min(startIdx, endIdx)
    const toIdx = Math.max(startIdx, endIdx)

    for (let i = fromIdx; i <= toIdx; i++) {
      const dayDate = production[i].date
      if (dragFill.type === "price" && dragFill.roomTypeId && dragFill.rateId && dragFill.occ !== undefined) {
        handlePriceChange(`${dragFill.roomTypeId}_${dragFill.rateId}_${dragFill.occ}_${dayDate}`, dragFill.value)
      } else if (dragFill.type === "param" && dragFill.paramKey) {
        handleAlgoParamChange(dragFill.paramKey, dayDate, dragFill.value)
      }
    }

    setDragFill(null)
    setDragOverDate(null)
  }

  // Check if a date is in the drag-fill range
  function isInDragRange(dateStr: string): boolean {
    if (!dragFill || !dragOverDate) return false
    const startIdx = production.findIndex((d) => d.date === dragFill.startDate)
    const endIdx = production.findIndex((d) => d.date === dragOverDate)
    const cellIdx = production.findIndex((d) => d.date === dateStr)
    if (startIdx === -1 || endIdx === -1 || cellIdx === -1) return false
    const fromIdx = Math.min(startIdx, endIdx)
    const toIdx = Math.max(startIdx, endIdx)
    return cellIdx >= fromIdx && cellIdx <= toIdx
  }

  // Global mouseup listener for drag-fill
  useEffect(() => {
    function onMouseUp() {
      if (dragFill) handleDragFillEnd()
    }
    window.addEventListener("mouseup", onMouseUp)
    return () => window.removeEventListener("mouseup", onMouseUp)
  }, [dragFill, dragOverDate])

  // ------- Publish all suggestions: bulk-save all calculated prices to DB -------

  const handlePublishAllSuggestions = useCallback(async () => {
    if (!hotelId) return
    setSaving(true)
    setAutoSaveStatus("saving")
    try {
      const today = new Date().toISOString().split("T")[0]
      const priceEntries: { room_type_id: string; rate_id: string; occupancy: number; date: string; price: number }[] = []

      // Determine which occupancy levels are configured for this hotel
      const configuredOccs = new Set<number>()
      configuredOccs.add(baseOccupancy) // always include base
      for (const key of Object.keys(algoParams)) {
        const m = key.match(/^occ_adj_(\d+)$/)
        if (m) configuredOccs.add(Number(m[1]))
      }
      const occList = Array.from(configuredOccs).sort()

      for (const rt of roomTypes) {
        const ratesToUse = selectedRate === "__all__" ? rates : rates.filter(r => r.id === selectedRate)
        for (const rate of ratesToUse) {
          for (const occ of occList) {
            for (const day of production) {
              // Skip if already has a saved price in the DB
              const gridKey = `${rt.id}_${rate.id}_${occ}`
              if (gridPrices[gridKey]?.[day.date] !== undefined) continue
              const suggested = calculateSuggestedPrice(rt.id, day.date, occ, rate.id)
              if (suggested === null || suggested <= 0) continue
              priceEntries.push({ room_type_id: rt.id, rate_id: rate.id, occupancy: occ, date: day.date, price: suggested })
            }
          }
        }
      }

      if (priceEntries.length === 0) {
        setAutoSaveStatus("saved")
        setTimeout(() => setAutoSaveStatus((p) => p === "saved" ? "idle" : p), 3000)
        setSaving(false)
        return
      }

      const res = await fetch("/api/accelerator/pricing-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, entries: priceEntries, source: "publish_suggested" }),
      })
      if (!res.ok) throw new Error("Errore salvataggio")

      // Reload grid to show newly saved prices
      await loadData()
      setAutoSaveStatus("saved")
      setTimeout(() => setAutoSaveStatus((p) => p === "saved" ? "idle" : p), 3000)

      // Storicizza le variazioni (SEMPRE, indipendentemente dal modo autopilot)
      if (priceEntries.length > 0) {
        try {
          const changes = priceEntries.map(entry => {
            const rt = roomTypes.find(r => r.id === entry.room_type_id)
            const gridKey = `${entry.room_type_id}_${entry.rate_id}_${entry.occupancy}_${entry.date}`
            const prevPrice = gridPrices[gridKey] ?? null
            return {
              date: entry.date,
              roomTypeId: entry.room_type_id,
              roomTypeName: rt?.name || "",
              rateId: entry.rate_id,
              occupancy: entry.occupancy,
              currentPrice: prevPrice,
              suggestedPrice: entry.price,
            }
          })

          // Storicizza via /api/autopilot/trigger:
          // - SEMPRE salva in price_change_log
          // - "notify"/"autopilot": manda anche email
          // - "disabled": solo storicizza
          await fetch("/api/autopilot/trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hotelId, changes, source: "publish_suggested" }),
          })
        } catch (triggerError) {
          console.error("[v0] Storicizzazione error:", triggerError)
          // Non blocca: i prezzi sono gia' salvati nel DB
        }
      }
    } catch (err) {
      console.error("Error publishing suggestions:", err)
      setAutoSaveStatus("idle")
    } finally {
      setSaving(false)
    }
  // eslint-disable-next-line react-hooks-deps
  }, [hotelId, roomTypes, rates, production, gridPrices, selectedRate, baseOccupancy, algoParams, autopilotMode])

  // ------- Save all -------
  
  const handleSaveAll = useCallback(async () => {
    // Use ref to get the latest editedPrices (avoids stale closure issues)
    const currentEditedPrices = editedPricesRef.current
  if (!hotelId) return
  if (!hasChanges) return
  setSaving(true)
  setAutoSaveStatus("saving")
  
  try {
    // 1. Save pricing grid entries
    // Determine source: if drag_fill or bulk_fill state exists, use those; otherwise manual_grid
    let source = "manual_grid"
    if (dragFill && dragFill.type === "price") {
      source = "drag_fill"
    } else if (bulkFillContext && bulkFillContext.type === "price" && bulkFillValue && bulkFillStartDate && bulkFillEndDate) {
      source = "bulk_fill"
    }

    const priceEntries: { room_type_id: string; rate_id: string; occupancy: number; date: string; price: number }[] = []
    const saveWarnings: string[] = []
    for (const [key, value] of Object.entries(currentEditedPrices)) {
      if (value === "") continue
      const parts = key.split("_")
      const date = parts.pop()!
      const occ = parseInt(parts.pop()!, 10)
      const rateId = parts.pop()!
      const roomTypeId = parts.join("_")
      let price = parseFloat(value)

      // Clamp to [bottom_rate, rack_rate] before saving
      const rl = getRateLimit(roomTypeId)
      if (rl) {
        if (rl.bottom_rate > 0 && price < rl.bottom_rate) {
          saveWarnings.push(`${date} occ ${occ}: ${price} -> ${rl.bottom_rate} (min)`)
          price = rl.bottom_rate
        }
        if (rl.rack_rate > 0 && price > rl.rack_rate) {
          saveWarnings.push(`${date} occ ${occ}: ${price} -> ${rl.rack_rate} (max)`)
          price = rl.rack_rate
        }
      }

      priceEntries.push({ room_type_id: roomTypeId, rate_id: rateId, occupancy: occ, date, price })
    }

    // Auto-include occupancy prices based on rate configuration (from arrangements/raw_data)
    // This ensures price_change_log is written for all configured occupancies
    const existingKeys = new Set(priceEntries.map(e => `${e.room_type_id}_${e.rate_id}_${e.occupancy}_${e.date}`))
    const processedCombos = new Set<string>()
    for (const entry of [...priceEntries]) {
      const comboKey = `${entry.room_type_id}_${entry.rate_id}_${entry.date}`
      if (processedCombos.has(comboKey)) continue
      processedCombos.add(comboKey)
      const rt = roomTypes.find(r => r.id === entry.room_type_id)
      const rate = rates.find(r => r.id === entry.rate_id)
      if (!rt || !rate) continue
      // Use occupancies from rate config instead of generating 1 to maxOcc
      const rateOccupancies = getOccupanciesForRate(rate, rt)
      for (const derivedOcc of rateOccupancies) {
        const derivedKey = `${entry.room_type_id}_${entry.rate_id}_${derivedOcc}_${entry.date}`
        if (existingKeys.has(derivedKey)) continue // already in batch (manually edited)
        const suggested = calculateSuggestedPrice(entry.room_type_id, entry.date, derivedOcc, entry.rate_id)
        if (suggested === null) continue
        let price = suggested
        const rl = getRateLimit(entry.room_type_id)
        if (rl) {
          if (rl.bottom_rate > 0 && price < rl.bottom_rate) price = rl.bottom_rate
          if (rl.rack_rate > 0 && price > rl.rack_rate) price = rl.rack_rate
        }
        priceEntries.push({ room_type_id: entry.room_type_id, rate_id: entry.rate_id, occupancy: derivedOcc, date: entry.date, price })
        existingKeys.add(derivedKey)
      }
    }

    // When algo params changed but no manual price edits, generate all algorithm-calculated prices
    // This ensures prices are persisted in pricing_grid even without manual edits
    if (priceEntries.length === 0 && Object.keys(currentEditedPrices).length === 0 && production.length > 0) {
      source = "algorithm"
      for (const rt of roomTypes) {
        for (const rate of rates) {
          const rateOccupancies = getOccupanciesForRate(rate, rt)
          for (const day of production) {
            const baseRateStr = algoParams["base_rate"]?.[day.date]
            if (!baseRateStr || isNaN(Number(baseRateStr)) || Number(baseRateStr) <= 0) continue
            for (const occ of rateOccupancies) {
              const entryKey = `${rt.id}_${rate.id}_${occ}_${day.date}`
              if (existingKeys.has(entryKey)) continue
              const suggested = calculateSuggestedPrice(rt.id, day.date, occ, rate.id)
              if (suggested === null) continue
              let price = suggested
              const rl = getRateLimit(rt.id)
              if (rl) {
                if (rl.bottom_rate > 0 && price < rl.bottom_rate) price = rl.bottom_rate
                if (rl.rack_rate > 0 && price > rl.rack_rate) price = rl.rack_rate
              }
              priceEntries.push({ room_type_id: rt.id, rate_id: rate.id, occupancy: occ, date: day.date, price })
              existingKeys.add(entryKey)
            }
          }
        }
      }
    }

    if (saveWarnings.length > 0) {
      console.warn("[pricing] Clamped prices at save:", saveWarnings)
    }

    if (priceEntries.length > 0) {
      const res = await fetch("/api/accelerator/pricing-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, entries: priceEntries, source }),
      })
      const resData = await res.json()
      
      if (!res.ok) {
        console.error("[pricing] pricing-grid POST FAILED - status:", res.status, "error:", resData.error)
        setAutoSaveStatus("error")
        setTimeout(() => setAutoSaveStatus("idle"), 3000)
        throw new Error(`Salvataggio prezzi fallito: ${resData.error || res.statusText}`)
      }
    }

    // 2. Save algo params (daily) -- base settings (ref room type, rate, occ, unit) are managed in /accelerator/pricing/settings
    // Convert algoParams object { paramKey: { date: value } } to array [{ param_key, date, value }]
    // FIX 15/07/2026 (incidente wipe parametri): il server ora fa UPSERT
    // mirato e cancella SOLO le coppie (key, date) inviate con value === ""
    // (niente piu' DELETE a prodotto cartesiano che spazzava chiavi mai
    // inviate). Quindi il client manda: valori pieni + marker "" per OGNI
    // cella presente nello stato come stringa vuota (= svuotata dall'utente
    // o azzerata da un fill). Le coppie ASSENTI dallo stato (mai caricate o
    // mai toccate) non vengono inviate e il server non le tocca.
    const paramsArray: { param_key: string; date: string; value: string }[] = []
    for (const [paramKey, dateMap] of Object.entries(algoParams)) {
      if (!dateMap || typeof dateMap !== "object") continue
      // `k_base_intensity` e' una chiave SINTETICA della griglia: NON e' un algo
      // param, viene persistita separatamente come regole 'day' in
      // hotel_k_intensity_rules (vedi diversione piu' sotto). Saltala qui.
      if (paramKey === "k_base_intensity") continue
      for (const [date, value] of Object.entries(dateMap)) {
        if (value === undefined) continue
        paramsArray.push({ param_key: paramKey, date, value: String(value) })
      }
    }

    // Collect all bands from bandGroups (preserves group_id) or fallback to flat occupancyBands
    const allBands = bandGroups.length > 0
      ? bandGroups.flatMap(g => (g.bands || []).map(b => ({ ...b, group_id: g.id })))
      : occupancyBands

    

    const paramsRes = await fetch("/api/accelerator/pricing-params", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotel_id: hotelId,
        params: paramsArray,
        occupancy_bands: allBands,
      }),
    })

    const paramsResData = await paramsRes.json()
    
    if (!paramsRes.ok) {
      console.error("[v0] algo-params POST FAILED - status:", paramsResData.error)
      throw new Error(`Salvataggio parametri fallito: ${paramsResData.error || paramsRes.statusText}`)
    }

    // 2b. INTENSIFICATORE K: diversione della riga inline verso le REGOLE.
    // I valori della riga "Intensificatore K (prezzo base)" sono override di
    // scope 'day'. Li persistiamo in hotel_k_intensity_rules (stessa fonte letta
    // dal motore), PRESERVANDO le regole default/periodo del dialog.
    // GUARDIA ANTI-WIPE: agiamo solo se la chiave esiste in algoParams (cioe' il
    // load delle regole era andato a buon fine e ha fatto il seed). Se il fetch
    // iniziale fosse fallito, kIntensityRules sarebbe stale e un replace-all
    // cancellerebbe default/periodo: in quel caso NON tocchiamo nulla.
    const inlineDayMap = algoParams["k_base_intensity"]
    if (inlineDayMap !== undefined) {
      try {
        // Regole esistenti NON-day (default + periodi dal dialog): preservate.
        const preserved = kIntensityRules.filter((r) => r.scope !== "day")
        // Mappa delle regole 'day' esistenti per preservarne l'increment_intensity.
        const existingDayByDate = new Map<string, KIntensityRule>()
        for (const r of kIntensityRules) {
          if (r.scope === "day" && r.date_from) existingDayByDate.set(r.date_from, r)
        }
        const dayRules: KIntensityRule[] = []
        for (const [date, raw] of Object.entries(inlineDayMap)) {
          if (raw === undefined || raw === "" || isNaN(Number(raw))) continue // vuoto => eredita
          const base = Math.max(0, Math.min(K_INTENSITY_BASE_CAP, Number(raw)))
          // increment_intensity del giorno: preserva quello eventualmente gia'
          // impostato (dialog), altrimenti eredita il valore risolto per la data.
          const existing = existingDayByDate.get(date)
          const inc = existing
            ? existing.increment_intensity
            : resolveKIntensity(kIntensityRules, date).incrementIntensity
          dayRules.push({
            scope: "day",
            date_from: date,
            date_to: date,
            increment_intensity: inc,
            base_intensity: base,
            is_active: true,
          } as KIntensityRule)
        }
        const mergedRules = [...preserved, ...dayRules]
        const kPut = await fetch("/api/accelerator/k-intensity", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotel_id: hotelId, rules: mergedRules }),
        })
        if (kPut.ok) {
          const kData = await kPut.json()
          if (Array.isArray(kData.rules)) setKIntensityRules(kData.rules)
        } else {
          console.error("[v0] k-intensity PUT failed:", (await kPut.json().catch(() => ({}))).error)
        }
      } catch (kErr) {
        console.error("[v0] k-intensity diversion error:", kErr)
        // Non blocca il resto del salvataggio: i prezzi/param sono gia' salvati.
      }
    }

    setHasChanges(false)
    
    // Merge editedPrices into gridPrices so they remain visible
    // editedPrices key format: "${roomTypeId}_${rateId}_${occ}_${date}" => price string
    // gridPrices key format: "${roomTypeId}_${rateId}_${occ}" => { date: price number }
    if (Object.keys(editedPrices).length > 0) {
      setGridPrices(prev => {
        const updated = { ...prev }
        for (const [fullKey, priceStr] of Object.entries(editedPrices)) {
          // Parse the fullKey to extract components
          const parts = fullKey.split("_")
          if (parts.length >= 4) {
            const dateStr = parts.pop()! // Last part is the date
            const occ = parts.pop()! // Second to last is occupancy
            const rateId = parts.pop()! // Third to last is rateId
            const roomTypeId = parts.join("_") // Rest is roomTypeId (may contain underscores)
            const gridKey = `${roomTypeId}_${rateId}_${occ}`
            
            if (!updated[gridKey]) updated[gridKey] = {}
            const priceNum = parseFloat(priceStr as string)
            if (!isNaN(priceNum)) {
              updated[gridKey][dateStr] = priceNum
            }
          }
        }
        return updated
      })
    }
    setEditedPrices({})
    // Don't reset algoParams - values stay in local state until page refresh
    setAutoSaveStatus("saved")
    
    // Clear "saved" indicator after 3s
    setTimeout(() => setAutoSaveStatus((prev) => prev === "saved" ? "idle" : prev), 3000)

    // AUTO-ACTION: Based on autopilot mode, either push to PMS or send notification email.
    // Only consider cells from today onward: past dates are never pushed even if edited,
    // because the booking window is already closed for those nights.
    if ((autopilotMode === "autopilot" || autopilotMode === "notify") && priceEntries.length > 0) {
      const futureEntries = priceEntries.filter(entry => entry.date >= todayStr)
      if (futureEntries.length === 0) {
        // nothing to do: edits were all in the past
      } else {
      try {
        // Build changes array with the format expected by autopilot/trigger
        const changes = futureEntries.map(entry => {
          const rt = roomTypes.find(r => r.id === entry.room_type_id)
          // Get the old price from gridPrices before the edit
          const priceKey = `${entry.room_type_id}_${entry.rate_id}_${entry.occupancy}`
          const currentPrice = gridPrices[priceKey]?.[entry.date] || null
          return {
            date: entry.date,
            roomTypeId: entry.room_type_id,
            roomTypeName: rt?.name || "",
            rateId: entry.rate_id,
            occupancy: entry.occupancy,
            currentPrice: currentPrice,
            suggestedPrice: entry.price,
          }
        })

        // Call /api/autopilot/trigger which handles both "notify" (email) and "autopilot" (push) modes
        const triggerRes = await fetch("/api/autopilot/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelId, changes }),
        })
        const triggerData = await triggerRes.json()
        
          
        
        if (triggerData.action === "notified") {
          toast.success(`Email di notifica inviata (${changes.length} variazioni)`)
        } else if (triggerData.action === "pushed") {
          if (triggerData.pushResult?.success) {
            toast.success(`Prezzi inviati a Scidoo (${triggerData.pushResult.cellsOrRecords} record)`)
          } else if (triggerData.pushResult?.deferred) {
            // Non è un errore: un altro invio verso il PMS era già in corso e il
            // lock di concorrenza per-hotel ha rimandato questo push. I prezzi
            // sono salvati e verranno inviati automaticamente al ciclo successivo.
            toast.warning("Invio prezzi in coda: un altro invio al PMS è già in corso. I prezzi sono salvati e verranno inviati a breve.", { duration: 5000 })
          } else {
            toast.error(`Errore invio PMS: ${triggerData.pushResult?.errors?.join(", ") || "Errore sconosciuto"}`)
          }
        } else if (triggerData.action === "deduplicated") {
            
        } else if (triggerData.error) {
          console.error("[v0] Autopilot trigger error:", triggerData.error)
          toast.error(`Errore autopilot: ${triggerData.error}`)
        }
      } catch (triggerError) {
        console.error("[v0] Autopilot trigger error:", triggerError)
        toast.error("Errore durante l'esecuzione autopilot")
      }
      } // end else (futureEntries.length > 0)
    }
    } catch (error) {
      console.error("Error saving:", error)
      setAutoSaveStatus("idle")
    } finally {
      setSaving(false)
    }
  }, [hotelId, hasChanges, algoParams, kIntensityRules, occupancyBands, bandGroups, dragFill, bulkFillValue, bulkFillStartDate, bulkFillEndDate, selectedRate, roomTypes, baseOccupancy, gridPrices, rates, calculateSuggestedPrice, autopilotMode])

  // Update the ref so autosave useEffect can access the latest handleSaveAll
  useEffect(() => {
    handleSaveAllRef.current = handleSaveAll
  }, [handleSaveAll])

  // Build param rows
  const adjUnitLabel = adjustmentUnit === "%" ? "percentuale" : "in euro"
  const refRoomType = roomTypes.find(rt => rt.id === referenceRoomTypeId)
  const refRoomTypeIdx = roomTypes.findIndex(rt => rt.id === referenceRoomTypeId)

  const paramRows: { key: string; label: string; description: string; section?: string; unit: string; indent?: boolean; readOnly?: boolean; isCalculated?: boolean; autoSourced?: boolean; isVariable?: boolean }[] = []

  const occNames: Record<number, string> = {
    1: "Singola", 2: "Doppia", 3: "Tripla", 4: "Quadrupla", 5: "Quintupla", 6: "Sestupla",
  }
  const baseOccName = occNames[baseOccupancy] || `${baseOccupancy} pax`

  // --- Sezione: Aggiustamenti occupazione camera ---
  paramRows.push({
    key: "__section_occ",
    label: "AGGIUSTAMENTI OCCUPAZIONE CAMERA",
    description: `Aggiustamenti ${adjUnitLabel} in base al numero di persone in camera rispetto alla base (${baseOccName}).`,
    section: "__divider__",
    unit: "",
  })

  // 23/05/2026: prima qui si leggeva solo `rt.capacity || rt.capacity_default`,
  // ignorando `max_occupancy`. Risultato: se l'utente alzava la capienza dei
  // Trilocali a 5-6 pax via SuperAdmin (che scrive su `max_occupancy`), le
  // righe tariffa pax 5 e 6 comparivano (perche' getOccupanciesForRate usa il
  // fallback completo) ma le righe "Incremento Quintupla/Sestupla" della
  // sezione AGGIUSTAMENTI OCCUPAZIONE CAMERA NO, perche' maxCap restava 4 e
  // il filtro `item.occ > maxCap` le saltava. Allineo al fallback usato
  // altrove: max_occupancy -> capacity -> capacity_default -> 2.
  const maxCap =
    roomTypes.length > 0
      ? Math.max(
          ...roomTypes.map(
            (rt) => rt.max_occupancy || rt.capacity || rt.capacity_default || 2,
          ),
        )
      : 2
  const allOccLevels = [
    { key: "occ_adj_1", label: "Singola", occ: 1 },
    { key: "occ_adj_2", label: "Doppia", occ: 2 },
    { key: "occ_adj_3", label: "Tripla", occ: 3 },
    { key: "occ_adj_4", label: "Quadrupla", occ: 4 },
    { key: "occ_adj_5", label: "Quintupla", occ: 5 },
    { key: "occ_adj_6", label: "Sestupla", occ: 6 },
  ]

  for (const item of allOccLevels) {
    if (item.occ > maxCap) continue
    if (item.occ === baseOccupancy) {
      paramRows.push({
        key: item.key,
        label: `${item.label} (BASE)`,
        description: `Occupazione di riferimento (${item.occ} pax). Le altre sono calcolate a catena a partire da questa.`,
        unit: "",
        indent: true,
        readOnly: true,
      })
    } else if (item.occ < baseOccupancy) {
      const upperOcc = item.occ + 1
      const upperName = occNames[upperOcc] || `${upperOcc} pax`
      paramRows.push({
        key: item.key,
        label: `Decremento ${item.label}`,
        description: `Riduzione ${adjUnitLabel} per occupazione ${item.label.toLowerCase()} (${item.occ} pax) rispetto alla ${upperName.toLowerCase()} (${upperOcc} pax)`,
        unit: adjustmentUnit,
        indent: true,
      })
    } else {
      const lowerOcc = item.occ - 1
      const lowerName = occNames[lowerOcc] || `${lowerOcc} pax`
      paramRows.push({
        key: item.key,
        label: `Incremento ${item.label}`,
        description: `Incremento ${adjUnitLabel} per occupazione ${item.label.toLowerCase()} (${item.occ} pax) rispetto alla ${lowerName.toLowerCase()} (${lowerOcc} pax)`,
        unit: adjustmentUnit,
        indent: true,
      })
    }
  }

  // --- Sezione: Incremento/decremento per tipologia ---
  const refName = refRoomType?.name || "riferimento"
  paramRows.push({
    key: "__section_rt",
    label: `INCREMENTO/DECREMENTO PER TIPOLOGIA (rif. ${refName})`,
    description: `Aggiustamenti % per tipologia relativi alla tipologia di riferimento "${refName}"`,
    section: "__divider__",
    unit: "",
  })
  for (let i = 0; i < roomTypes.length; i++) {
    const rt = roomTypes[i]
    const isRef = rt.id === referenceRoomTypeId

    let label: string
    let description: string
    if (isRef) {
      label = `${rt.name} (RIFERIMENTO)`
      description = `Tipologia di riferimento. Le altre tipologie sono calcolate relativamente a questa.`
    } else if (i < refRoomTypeIdx) {
      const upperRt = roomTypes[i + 1]
      const upperName = upperRt?.name || refName
      label = `Decremento ${rt.name} rispetto a ${upperName}`
      description = `Riduzione ${adjUnitLabel} della tipologia "${rt.name}" rispetto alla categoria superiore "${upperName}"`
    } else {
      const lowerRt = roomTypes[i - 1]
      const lowerName = lowerRt?.name || refName
      label = `Incremento ${rt.name} rispetto a ${lowerName}`
      description = `Maggiorazione ${adjUnitLabel} della tipologia "${rt.name}" rispetto alla categoria inferiore "${lowerName}"`
    }

    paramRows.push({
      key: `room_type_adj_${rt.id}`,
      label,
      description,
      unit: isRef ? "" : adjustmentUnit,
      indent: true,
      section: isRef ? "__ref_room_type__" : undefined,
    })
  }

  // --- Sezione: Incremento/decremento per piano tariffario ---
  const refRate = rates.find((r) => r.id === referenceRateId)
  const refRateName = refRate?.name || "riferimento"
  paramRows.push({
    key: "__section_rate",
    label: `INCREMENTO/DECREMENTO PER PIANO TARIFFARIO (rif. ${refRateName})`,
    description: `Aggiustamenti ${adjustmentUnit} per piano tariffario rispetto alla tariffa di riferimento "${refRateName}"`,
    section: "__divider__",
    unit: "",
  })
  for (const rate of rates) {
    const isRef = rate.id === referenceRateId
    if (isRef) {
      paramRows.push({
        key: `rate_adj_${rate.id}`,
        label: `${rate.name} (Riferimento)`,
        description: `Tariffa di riferimento: i prezzi base partono da questa tariffa. Gli aggiustamenti delle altre tariffe sono calcolati rispetto a questa.`,
        unit: "",
        indent: true,
        section: "__ref_rate__",
      })
    } else {
      paramRows.push({
        key: `rate_adj_${rate.id}`,
        label: `${rate.name} vs ${refRateName}`,
        description: `Aggiustamento ${adjustmentUnit} della tariffa "${rate.name}" rispetto alla tariffa di riferimento "${refRateName}". Valori positivi = supplemento, negativi = sconto.`,
        unit: adjustmentUnit,
        indent: true,
      })
    }
  }

  // --- Sezione: Last minute ---
  paramRows.push({
    key: "__section_lm",
    label: "LAST MINUTE",
    description: "Parametri per la gestione dei prezzi last minute",
    section: "__divider__",
    unit: "",
  })
  paramRows.push({ key: "last_minute_days", label: "Giorni anticipo Last Minute", description: "N. giorni prima del check-in entro i quali si attiva il pricing last minute", unit: "gg", indent: true })
  if (lastMinuteLevels.length > 0) {
    paramRows.push({
      key: "last_minute_level_id",
      label: "Livello Last Minute",
      description: "Seleziona il livello di last minute da applicare. Ogni livello ha sconto % e condizione di occupazione configurati nella pagina Impostazioni > Last Minute.",
      section: "__lm_level_selector__",
      unit: "",
      indent: true,
    })
  }

  // --- Sezione: Non rimborsabile (only show if NR rates exist) ---
  const hasNrRates = rates.some(r => 
    r.rate_type === "nr" || 
    r.name?.toUpperCase().includes("NR") || 
    r.name?.toLowerCase().includes("non rimborsabile")
  )
  
  if (hasNrRates) {
    paramRows.push({
      key: "__section_nr",
      label: "NON RIMBORSABILE",
      description: "Sconto per tariffa non rimborsabile",
      section: "__divider__",
      unit: "",
    })
    paramRows.push({ key: "nr_release_pct", label: "Sconto NR (%)", description: "Percentuale di sconto della tariffa Non Rimborsabile rispetto alla tariffa di riferimento. Se 0% la tariffa NR e' chiusa (non disponibile). Se valorizzata, il prezzo NR = tariffa di riferimento meno questa %.", unit: "%", indent: true })
    paramRows.push({ key: "nr_release_days", label: "Release (giorni)", description: "Numero di giorni prima del check-in in cui la tariffa NR si chiude e non e' piu' prenotabile. Es: 7 = la NR si chiude 7 giorni prima della data.", unit: "gg", indent: true })
  }

  // --- Sezione: Domanda di mercato (fasce di occupazione) ---
  // Visibile sia in basic che in K-Driven: il motore K-Driven usa
  // l'incremento della banda come base e lo modula con il coefficiente K
  // (lo scenario storico NON modula piu' nulla, vedi nota 1b). Nasconderle in
  // K-Driven era un bug: l'utente non vedeva una variabile in uso.
  {
    paramRows.push({
      key: "__section_bands",
      label: "DOMANDA DI MERCATO",
      description: algorithmType === "advanced"
        ? "Fasce di occupazione struttura -- in K-Driven gli incrementi vengono modulati dal coefficiente K"
        : "Fasce di occupazione struttura -- rappresentano la domanda di mercato",
      section: "__divider_bands__",
      unit: "",
    })

    if (bandGroups.length > 1) {
      paramRows.push({
        key: "band_group_id",
        label: "Livello domanda (stagione)",
        description: "Seleziona il livello di domanda di mercato da applicare per ogni giorno. Ogni livello rappresenta una stagione con regole diverse.",
        section: "__band_group_selector__",
        unit: "",
        indent: true,
      })
    }

    const firstDayDate = production.length > 0 ? production[0].date : ""
    const firstDayBandGroupId = firstDayDate ? (algoParams["band_group_id"]?.[firstDayDate] || "") : ""
    const previewGroup = (firstDayBandGroupId && bandGroups.length > 0)
      ? (bandGroups.find(g => g.id === firstDayBandGroupId) || bandGroups[0])
      : (bandGroups.length > 0 ? bandGroups[0] : null)
    const previewBands = (previewGroup && previewGroup.bands) ? previewGroup.bands : occupancyBands

    for (let i = 0; i < previewBands.length; i++) {
      const band = previewBands[i]
      const occMode = band.occupancy_mode || "pct"
      const rangeLabel = occMode === "num"
        ? `${band.min_num ?? 0} - ${band.max_num ?? 0} camere`
        : `${band.min_pct}% - ${band.max_pct}%`

      paramRows.push({
        key: `band_range_${i}`,
        label: `Fascia Occupazione ${toRoman(i + 1)}`,
        description: `Range di occupazione struttura: ${rangeLabel}`,
        section: "__band_occupancy__",
        unit: occMode === "num" ? "cam" : "%",
        indent: true,
      })
    }

    for (let i = 0; i < previewBands.length; i++) {
      const band = previewBands[i]
      const incMode = band.increment_mode || "eur"
      const incUnit = incMode === "eur" ? "EUR" : "%"
      paramRows.push({
        key: `increment_band_${i}`,
        label: `Incremento Fascia ${toRoman(i + 1)}`,
        description: `Incremento/decremento quando occupazione della struttura rientra in questa fascia`,
        section: "__band_increment__",
        unit: incUnit,
        indent: true,
      })
    }

    paramRows.push({
      key: "__avg_increment__",
      label: "Media incrementi giorno",
      description: "Media degli incrementi di tutte le fasce attive per quel giorno, in base al livello di domanda selezionato.",
      section: "__avg_increment__",
      unit: "",
      indent: false,
    })
  }

  // --- Sezione: Variabili di pricing (solo in modalita K-Driven) ---
  if (algorithmType === "advanced" && pricingVariables.length > 0) {
    paramRows.push({
      key: "__section_variables",
      label: "VARIABILI",
      description: "Variabili esterne che influenzano la domanda di mercato. Il peso (0-10) regola l'impatto sulla fascia di occupazione.",
      section: "__divider__",
      unit: "",
    })
    for (const v of pricingVariables) {
      const isAuto = AUTO_SOURCED_VARIABLE_KEYS.has(v.variable_key)
      paramRows.push({
        key: `var_${v.variable_key}`,
        label: v.label,
        description: isAuto
          ? `${v.description || v.label}. Alimentata automaticamente da Santaddeo (cron ogni 3h, dati PMS/recensioni/meteo). Peso da ${v.weight_min ?? 0} a ${v.weight_max ?? 10}. Default ${v.default_weight ?? 5}. Puoi sovrascrivere il valore per singolo giorno.`
          : `${v.description || v.label}. Da compilare manualmente: Santaddeo non ha una fonte dati automatica per questo parametro. Peso da ${v.weight_min ?? 0} a ${v.weight_max ?? 10}. Default ${v.default_weight ?? 5}.`,
        unit: "/10",
        indent: true,
        autoSourced: isAuto,
        isVariable: true,
      })
    }
    paramRows.push({
      key: "__k_coefficient",
      label: "Coefficiente K",
      description: "Media pesata normalizzata [-1, +1] delle variabili di pressione attive. K>0: domanda alta. K<0: domanda bassa. K=0: neutro.",
      unit: "",
      isCalculated: true,
    })
  }

  // --- INTENSIFICATORE K sul prezzo base (giorno per giorno, solo K-Driven) ---
  // Override PUNTUALE per data: quanto il coefficiente K muove direttamente il
  // prezzo base (base * (1 + K * intensita')). Cella vuota = il giorno EREDITA
  // dal periodo/default impostati nel dialog "Intensificatore K". I valori qui
  // inseriti vengono salvati come regole di scope 'day' in hotel_k_intensity_rules
  // (stessa fonte letta dal motore) -- NON in pricing_algo_params.
  if (algorithmType === "advanced") {
    paramRows.push({
      key: "k_base_intensity",
      label: "Intensificatore K (prezzo base)",
      description: `Quanto il coefficiente K muove DIRETTAMENTE il prezzo base, per questo giorno. Scegli un LIVELLO dal menù a tendina (Standard 0% → Massimo ${Math.round(K_INTENSITY_BASE_CAP * 100)}%). "Eredita" = usa il valore di periodo/default impostato nel dialog "Intensificatore K".`,
      unit: "livello",
    })
  }

  // Render Section
  if (unauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">Accesso non autorizzato</h2>
          <p className="text-muted-foreground mt-2">Non hai i permessi per accedere a questa pagina.</p>
        </Card>
      </div>
    )
  }

  // Render
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col">
      <main className="flex-1 p-6">
        <div className="space-y-4">

          {/* ========== COMPACT UNIT & ALGO BOXES ========== */}
          <div className="flex items-center justify-center gap-6 py-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Unita:</span>
              <div className="flex gap-2">
                <div
                  className={`
                    w-12 h-9 rounded-lg border-2 shadow-sm flex items-center justify-center cursor-default transition-all
                    ${adjustmentUnit === "%"
                      ? "bg-blue-600 border-blue-700 text-white"
                      : "bg-gray-100 border-gray-300 text-gray-400"
                    }
                  `}
                >
                  <span className="text-lg font-black">%</span>
                </div>
                <div
                  className={`
                    w-12 h-9 rounded-lg border-2 shadow-sm flex items-center justify-center cursor-default transition-all
                    ${adjustmentUnit === "EUR"
                      ? "bg-emerald-600 border-emerald-700 text-white"
                      : "bg-gray-100 border-gray-300 text-gray-400"
                    }
                  `}
                >
                  <span className="text-sm font-black">EUR</span>
                </div>
              </div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Algoritmo:</span>
                <div className="flex gap-1 p-1 bg-muted rounded-lg border">
                  <button
                    onClick={() => { if (algorithmType !== "basic") setPendingAlgoMode("basic") }}
                    title="Modalita' Base: usa fasce di occupazione per calcolare il prezzo"
                    className={`
                      px-3 h-7 rounded-md text-xs font-bold transition-all
                      ${algorithmType === "basic"
                        ? "bg-orange-500 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background"
                      }
                    `}
                  >
                    BASIC
                  </button>
                  <button
                    onClick={() => { if (algorithmType !== "advanced") setPendingAlgoMode("advanced") }}
                    title="Modalita' K-Driven: usa variabili di mercato per calcolare il coefficiente K"
                    className={`
                      px-3 h-7 rounded-md text-xs font-bold transition-all
                      ${algorithmType === "advanced"
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background"
                      }
                    `}
                  >
                    K-DRIVEN
                  </button>
                </div>

                {/* INTENSIFICATORE K (30/06/2026): visibile solo in K-Driven.
                    Apre il dialog per regolare l'intensita' del K per periodo/giorno. */}
                {algorithmType === "advanced" && (
                  <button
                    onClick={() => setKIntensityOpen(true)}
                    title="Regola quanto il coefficiente K influisce sul prezzo, per periodo o giorno"
                    className="flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-bold border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Intensificatore K
                  </button>
                )}

                {/* Confirmation dialog for algorithm mode change */}
                {pendingAlgoMode && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-background border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">
                            Cambio algoritmo: {pendingAlgoMode === "basic" ? "BASIC" : "K-DRIVEN"}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {pendingAlgoMode === "basic"
                              ? "Passerai alla modalita' BASIC che calcola i prezzi tramite le fasce di occupazione. Le variabili di mercato K non saranno piu' considerate."
                              : "Passerai alla modalita' K-DRIVEN che usa variabili di mercato (eventi, meteo, stagionalita') per calcolare un coefficiente dinamico. Le fasce di occupazione non saranno piu' utilizzate."
                            }
                          </p>
                          {/* FIX 02/05/2026: avviso esplicito che il cambio algoritmo NON
                              ricalcola subito i prezzi gia' presenti in tabella. Vengono
                              riscritti SOLO al prossimo evento che tocca la cella
                              (salva impostazioni, modifica manuale, sync ETL, drag/bulk fill).
                              Senza questo avviso l'utente confonde il toggle con un
                              "ricalcola tutto" e rischia di restare in stato ibrido. */}
                          <p className="text-xs font-semibold text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 leading-relaxed">
                            <span className="font-bold">Importante:</span> i prezzi gia&apos; presenti in tabella <span className="underline">NON</span> verranno ricalcolati subito. Restano i valori attuali finche&apos; non salvi le impostazioni dell&apos;algoritmo, modifichi una cella o cambia l&apos;occupazione. Per applicare davvero il nuovo motore vai in <span className="font-bold">Impostazioni</span> e premi <span className="font-bold">Salva</span>.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setPendingAlgoMode(null)}
                          className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
                        >
                          Annulla
                        </button>
                        <button
                          onClick={async () => {
                            const newMode = pendingAlgoMode
                            setPendingAlgoMode(null)
                            setAlgorithmType(newMode)
                            await fetch("/api/accelerator/subscription", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ hotel_id: hotelId, algorithm_type: newMode }),
                            })
                          }}
                          className={`px-4 py-2 text-xs font-bold rounded-lg text-white transition-colors ${
                            pendingAlgoMode === "basic"
                              ? "bg-orange-500 hover:bg-orange-600"
                              : "bg-purple-600 hover:bg-purple-700"
                          }`}
                        >
                          Confermo, cambia in {pendingAlgoMode === "basic" ? "BASIC" : "K-DRIVEN"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Confirmation dialog for unit toggle (EUR <-> %) on
                    rows that already have values configured. Stesso stile
                    visivo del dialog cambio algoritmo per coerenza UI. */}
                {pendingUnitToggle && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-background border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-foreground">
                            Cambio unita' di misura: {pendingUnitToggle.fromUnit} {"->"} {pendingUnitToggle.toUnit}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            Stai cambiando l&apos;unita&apos; di
                            {" "}
                            <span className="font-semibold text-foreground">{pendingUnitToggle.label}</span>{" "}
                            da <span className="font-semibold">{pendingUnitToggle.fromUnit}</span> a <span className="font-semibold">{pendingUnitToggle.toUnit}</span>.
                            I valori numerici gia&apos; impostati su <span className="font-semibold">{pendingUnitToggle.configuredDays} giorni</span> NON verranno convertiti: cambia solo il loro significato.
                          </p>
                          <p className="text-xs font-semibold text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                            {pendingUnitToggle.toUnit === "%"
                              ? `Esempio: un valore di "10" diventera' +10% sul prezzo invece di +10 EUR. I prezzi suggeriti cambieranno significativamente.`
                              : `Esempio: un valore di "10" diventera' +10 EUR sul prezzo invece di +10%. I prezzi suggeriti cambieranno significativamente.`
                            }
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setPendingUnitToggle(null)}
                          className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
                        >
                          Annulla
                        </button>
                        <button
                          onClick={() => {
                            const { paramKey, toUnit } = pendingUnitToggle
                            setPendingUnitToggle(null)
                            for (const day of production) {
                              handleAlgoParamChange(`unit_${paramKey}`, day.date, toUnit)
                            }
                          }}
                          className={`px-4 py-2 text-xs font-bold rounded-lg text-white transition-colors ${
                            pendingUnitToggle.toUnit === "%"
                              ? "bg-blue-600 hover:bg-blue-500"
                              : "bg-emerald-600 hover:bg-emerald-500"
                          }`}
                        >
                          Confermo, cambia in {pendingUnitToggle.toUnit}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            <Link href="/accelerator/pricing/settings">
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
                <Settings2 className="h-3.5 w-3.5" />
                Impostazioni
              </Button>
            </Link>
          </div>

          {/* ========== ROW 1: FILTRI VISUALIZZAZIONE ========== */}
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                  {/* Month nav: chevron sx/dx + click sull'etichetta per
                      saltare a una data precisa via calendario popover. */}
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 px-2 font-semibold text-foreground min-w-[150px] capitalize text-sm gap-1.5"
                          aria-label="Vai a un mese specifico"
                        >
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                          {format(currentMonth, "MMMM yyyy", { locale: it })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          locale={it}
                          selected={currentMonth}
                          defaultMonth={currentMonth}
                          onSelect={(d) => {
                            if (d) setCurrentMonth(startOfMonth(d))
                          }}
                          initialFocus
                        />
                        <div className="border-t p-2 flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setCurrentMonth(startOfMonth(new Date()))}
                          >
                            Oggi
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Finestra calendario: mostra 1/2/3 mesi insieme. Con piu'
                      mesi la griglia scorre orizzontalmente senza ricaricare. */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Vista</span>
                    <div className="flex items-center rounded-md border border-border overflow-hidden">
                      {([1, 2, 3] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setWindowMonths(n)}
                          aria-pressed={windowMonths === n}
                          className={`h-8 px-2.5 text-xs font-medium transition-colors ${
                            windowMonths === n
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {n === 1 ? "1 mese" : `${n} mesi`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-px h-6 bg-border" />

                  {/* Rate display filter */}
                  <div className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Filtri Vista</span>
                  </div>
                  <Select value={selectedRate} onValueChange={setSelectedRate}>
                    <SelectTrigger className="w-[190px] h-8 text-xs">
                      <SelectValue placeholder="Piano tariffario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Tutte le tariffe</SelectItem>
                      {rates.map((rate) => (
                        <SelectItem key={rate.id} value={rate.id}>
                          {rate.name}
                          {rate.id === referenceRateId ? " (Principale)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Filtro tipologie camera (25/05/2026) - solo visualizzazione */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 min-w-[170px] justify-between font-normal">
                        <span className="flex items-center gap-1.5 truncate">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {visibleRoomTypeIds === null
                            ? "Tutte le tipologie"
                            : visibleRoomTypeIds.size === roomTypes.length
                              ? "Tutte le tipologie"
                              : visibleRoomTypeIds.size === 1
                                ? roomTypes.find((rt) => visibleRoomTypeIds.has(rt.id))?.name ?? "1 tipologia"
                                : `${visibleRoomTypeIds.size} tipologie`}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[260px] p-0" align="start">
                      <div className="p-2 border-b flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Tipologie visibili
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="text-[10px] text-primary hover:underline px-1"
                            onClick={() => setVisibleRoomTypeIds(null)}
                          >
                            Tutte
                          </button>
                          <span className="text-muted-foreground/40">|</span>
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground hover:underline px-1"
                            onClick={() => setVisibleRoomTypeIds(new Set())}
                          >
                            Nessuna
                          </button>
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-1">
                        {roomTypes.length === 0 && (
                          <div className="text-xs text-muted-foreground p-3 text-center">
                            Nessuna tipologia configurata
                          </div>
                        )}
                        {roomTypes.map((rt) => {
                          const isChecked = visibleRoomTypeIds === null || visibleRoomTypeIds.has(rt.id)
                          return (
                            <label
                              key={rt.id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
                            >
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 accent-primary cursor-pointer"
                                checked={isChecked}
                                onChange={(e) => {
                                  setVisibleRoomTypeIds((prev) => {
                                    // Inizializza dal "tutte selezionate" alla prima
                                    // interazione: se prev e' null e l'utente toglie
                                    // un check, si parte da tutte e si rimuove la tipologia.
                                    const base = prev === null ? new Set(roomTypes.map((r) => r.id)) : new Set(prev)
                                    if (e.target.checked) {
                                      base.add(rt.id)
                                    } else {
                                      base.delete(rt.id)
                                    }
                                    // Se sono di nuovo tutte selezionate, torna a null
                                    // per non occupare storage e per UX coerente.
                                    if (base.size === roomTypes.length) return null
                                    return base
                                  })
                                }}
                              />
                              <span className="flex-1 truncate">{rt.name}</span>
                              {rt.id === referenceRoomTypeId && (
                                <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                              )}
                              <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                                {rt.max_occupancy || rt.capacity || rt.capacity_default || 2}p
                              </Badge>
                            </label>
                          )
                        })}
                      </div>
                      {visibleRoomTypeIds !== null && visibleRoomTypeIds.size < roomTypes.length && (
                        <div className="border-t p-2 text-[10px] text-muted-foreground leading-relaxed">
                          Filtro solo visivo: calcoli, salvataggio prezzi e push al
                          PMS continuano a includere tutte le tipologie.
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>

                  <div className="flex items-center gap-1.5">
                    <Switch id="avg-prod" checked={showAvgProduction} onCheckedChange={setShowAvgProduction} className="scale-90" />
                    <Label htmlFor="avg-prod" className="text-xs cursor-pointer flex items-center gap-1">
                      Produzione
                    </Label>
                  </div>
                  <Link href="/settings/rate-limits">
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                      <Settings2 className="h-3 w-3" />
                      <span className="hidden lg:inline">Limiti tariffari</span>
                    </Button>
                  </Link>
                  <Link href="/accelerator/pricing/test">
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs border-purple-200 text-purple-700 hover:bg-purple-50">
                      <FlaskConical className="h-3 w-3" />
                      <span className="hidden lg:inline">Simulatore</span>
                    </Button>
                  </Link>
                  {/* Spiegazione algoritmo (02/05/2026): apre un dialog con
                      la guida completa di entrambi i motori (Base e K-driven)
                      ed evidenzia automaticamente quello attivo per la struttura. */}
                  <AlgorithmExplanationDialog
                    currentAlgorithm={algorithmType}
                    compact
                    triggerLabel="Algoritmo"
                  />

                  <div className="w-px h-6 bg-border" />

                  {/* Compact base settings summary + link */}
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href="/accelerator/pricing/settings">
                          <Badge variant="outline" className="h-8 gap-1.5 text-[11px] cursor-pointer hover:bg-blue-50 border-blue-200 text-blue-700 transition-colors">
                            <Cpu className="h-3 w-3" />
                            <span className="hidden xl:inline">Base:</span>
                            {referenceRoomType?.name || "..."} / {rates.find((r) => r.id === referenceRateId)?.name || "..."} / {baseOccupancy}p / {adjustmentUnit}
                            <Settings2 className="h-3 w-3 ml-0.5 text-blue-400" />
                          </Badge>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Configura la cella base dell'algoritmo
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Autosave status */}
                <div className="flex items-center gap-2">
                  {autoSaveStatus === "pending" && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                      Non salvato
                    </span>
                  )}
                  {autoSaveStatus === "saving" && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      Salvataggio...
                    </span>
                  )}
                  {autoSaveStatus === "saved" && (
                    <span className="text-xs text-emerald-600 flex items-center gap-1.5">
                      <Save className="h-3 w-3" />
                      Salvato
                    </span>
                  )}
                  {hasChanges && (
                    <Button onClick={handleSaveAll} disabled={saving} size="sm" variant="outline" className="gap-1 h-7 text-[11px]">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Salva ora
                    </Button>
                  )}
                  {/* Autopilot Controls + Invia al PMS */}
                  {hotelId && (
                    <>
                      <div className="h-5 w-px bg-border" />
                      <AutopilotControls
                        hotelId={hotelId}
                        onModeChange={setAutopilotMode}
                        onBeforePush={async () => {
                          // Save all suggested prices to DB before pushing to PMS
                          try {
                            await handlePublishAllSuggestions()
                            return true
                          } catch {
                            return false
                          }
                        }}
                        // First-sync: collect every price from today for the
                        // next N days across all room types, rates, and their
                        // configured occupancies. Prefers the suggested price
                        // from the algorithm; falls back to the saved grid
                        // price so cells without algo params still get sent.
                        getAllFutureChanges={(daysAhead: number) => {
                          const out: { date: string; roomTypeId: string; roomTypeName: string; rateId: string; occupancy: number; currentPrice: number; suggestedPrice: number }[] = []
                          const today = new Date()
                          today.setHours(0, 0, 0, 0)
                          for (let i = 0; i < daysAhead; i++) {
                            const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000)
                            const y = d.getFullYear()
                            const m = String(d.getMonth() + 1).padStart(2, "0")
                            const day = String(d.getDate()).padStart(2, "0")
                            const dateStr = `${y}-${m}-${day}`
                            for (const rt of roomTypes) {
                              for (const rate of rates) {
                                const occs = getOccupanciesForRate(rate, rt)
                                for (const occ of occs) {
                                  // Prefer algo-computed suggestion, fall back to saved price.
                                  let priceNum: number | null = null
                                  const suggested = calculateSuggestedPrice(rt.id, dateStr, occ, rate.id)
                                  if (suggested != null && Number.isFinite(suggested) && suggested > 0) {
                                    priceNum = Math.round(suggested)
                                  } else {
                                    const gridKeyFlat = `${rt.id}_${rate.id}_${occ}`
                                    const saved = gridPrices[gridKeyFlat]?.[dateStr]
                                    if (saved != null && Number.isFinite(saved) && saved > 0) {
                                      priceNum = Math.round(saved)
                                    }
                                  }
                                  if (priceNum == null) continue
                                  const gridKeyFlat = `${rt.id}_${rate.id}_${occ}`
                                  const currentPrice = gridPrices[gridKeyFlat]?.[dateStr] ?? 0
                                  out.push({
                                    date: dateStr,
                                    roomTypeId: rt.id,
                                    roomTypeName: rt.name,
                                    rateId: rate.id,
                                    occupancy: occ,
                                    currentPrice,
                                    suggestedPrice: priceNum,
                                  })
                                }
                              }
                            }
                          }
                          return out
                        }}
                        getChanges={() => {
                          const changes: { date: string; roomTypeId: string; roomTypeName: string; rateId: string; occupancy: number; currentPrice: number; suggestedPrice: number }[] = []
                          const rateId = selectedRate || rates[0]?.id || ""
                          for (const rt of roomTypes) {
                            for (const day of production) {
                              const suggested = calculateSuggestedPrice(rt.id, day.date)
                              if (suggested == null) continue
                              const gridKey = `${rt.id}_${rateId}_${baseOccupancy}_${day.date}`
                              const currentPrice = gridPrices[gridKey] ?? 0
                              const suggestedRounded = Math.round(suggested)
                              if (Math.abs(suggestedRounded - currentPrice) >= 1) {
                                changes.push({
                                  date: day.date,
                                  roomTypeId: rt.id,
                                  roomTypeName: rt.name,
                                  rateId,
                                  occupancy: baseOccupancy,
                                  currentPrice,
                                  suggestedPrice: suggestedRounded,
                                })
                              }
                            }
                          }
                          return changes
                        }}
                        // Collect only the cells the user has explicitly edited
                        // during this session. We read from editedPrices and
                        // gridPrices so the "suggested" price sent is exactly
                        // what is shown in the textbox right now.
                        getModifiedChanges={() => {
                          const out: { date: string; roomTypeId: string; roomTypeName: string; rateId: string; occupancy: number; currentPrice: number; suggestedPrice: number }[] = []
                          for (const [fullKey, userVal] of userEditedCells.entries()) {
                            const parts = fullKey.split("_")
                            if (parts.length < 4) continue
                            const dateStr = parts.pop() as string
                            const occStr = parts.pop() as string
                            const rateId = parts.pop() as string
                            const roomTypeId = parts.join("_")
                            const occ = Number(occStr)
                            if (!Number.isFinite(occ)) continue
                            const rt = roomTypes.find(r => r.id === roomTypeId)
                            if (!rt) continue
                            // The user value in the Map is the source of truth, it survives
                            // auto-save. We fall back to any unsaved edit, then to the last
                            // saved DB price only as a last resort.
                            const displayRaw = editedPrices[fullKey]
                            const edited = displayRaw !== undefined ? parseFloat(displayRaw) : NaN
                            const gridKeyFlat = `${roomTypeId}_${rateId}_${occ}`
                            const savedPrice = gridPrices[gridKeyFlat]?.[dateStr]
                            const newPrice = Number.isFinite(userVal) ? userVal : Number.isFinite(edited) ? edited : (savedPrice ?? NaN)
                            if (!Number.isFinite(newPrice) || newPrice <= 0) continue
                            out.push({
                              date: dateStr,
                              roomTypeId,
                              roomTypeName: rt.name,
                              rateId,
                              occupancy: occ,
                              currentPrice: savedPrice ?? 0,
                              suggestedPrice: Math.round(newPrice),
                            })
                          }
                          return out
                        }}
                        onPushComplete={(result) => {
                          const keys = result.pushedKeys || []
                          if (keys.length === 0) return
                          // Flash feedback on every cell that was pushed
                          const flash: Record<string, "success" | "error"> = {}
                          const outcome = result.success ? "success" : "error"
                          for (const k of keys) flash[k] = outcome
                          setPushFeedback(prev => ({ ...prev, ...flash }))
                          // On success, clear the amber "modified" mark so the
                          // cells stop showing as pending once the flash ends.
                          if (result.success) {
                            setUserEditedCells(prev => {
                              const next = new Map(prev)
                              for (const k of keys) next.delete(k)
                              return next
                            })
                          }
                          // Clear the transient flash after 3 seconds
                          window.setTimeout(() => {
                            setPushFeedback(prev => {
                              const next = { ...prev }
                              for (const k of keys) {
                                if (next[k] === outcome) delete next[k]
                              }
                              return next
                            })
                          }, 3000)
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Caricamento dati...</span>
            </div>
          ) : loadError ? (
            // Errore di caricamento (es. outage Supabase): messaggio chiaro +
            // Riprova, MAI una griglia vuota silenziosa. Vedi incident 23/06/2026.
            <div className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="font-semibold text-amber-900">Prezzi temporaneamente non disponibili</p>
              <p className="mt-2 text-sm text-amber-800 text-pretty">{loadError}</p>
              <Button onClick={() => loadData()} variant="outline" className="mt-4">
                <Loader2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Riprova
              </Button>
            </div>
          ) : !selectedRate ? (
            // Distinguiamo i casi reali per non mostrare un messaggio fuorviante
            // (vedi incident 03/05/2026: hotel "Mai sincronizzato" in dev/staging
            // arrivava qui con rates=[] e l'utente vedeva "Seleziona un piano..."
            // ma il dropdown era vuoto). Mostriamo guida operativa specifica.
            rates.length === 0 || roomTypes.length === 0 ? (
              <div className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                <p className="font-semibold text-amber-900">
                  Nessuna tariffa o tipologia di camera configurata.
                </p>
                <p className="mt-2 text-sm text-amber-800">
                  Sincronizza il PMS oppure verifica le mappature in
                  {" "}
                  <a href="/settings/mappings" className="font-semibold underline">
                    Impostazioni → Mappature
                  </a>
                  {" "}
                  per popolare le tariffe e le camere disponibili.
                </p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Seleziona un piano tariffario o &quot;Tutte le tariffe&quot; per visualizzare la griglia.
              </div>
            )
          ) : (
            <Card>
              <CardContent className="p-0">
                <CalendarScrollContainer columnCount={production.length} todayIndex={todayIdx}>
                  <table className="border-collapse text-xs w-full">
                    <thead ref={tableHeadRef} className="relative z-30 bg-white [&>tr>th]:bg-inherit">
                      {/* Month band row: indica il mese di ogni blocco di colonne
                          (necessario con la finestra multi-mese, dove l'header in
                          alto mostra solo il mese di partenza). Scorre coi giorni. */}
                      {/* FIX 15/07/2026: sfondi del thead OPACHI. Chrome non
                          trasla il background del <thead> insieme al transform
                          del pinning JS: con sfondi semitrasparenti (/40, /60)
                          il contenuto scrollato sotto traspariva rendendo
                          illeggibili etichette e valori. Gli hex sono gli
                          equivalenti esatti dei vecchi alpha su fondo bianco. */}
                      {/* FIX 15/07/2026 (bis): bg opaco anche sulle CELLE,
                          non solo sul tr. Chrome non trasla il background
                          del tr col transform del pinning: l'angolo aveva
                          bg-muted/60 (alpha) e i th mese NESSUN bg, quindi
                          le etichette scrollate trasparivano da sotto. */}
                      {windowMonths > 1 && (
                        <tr className="z-30 bg-[#f7f9fb]">
                          <th className="border border-border p-1 text-left min-w-[180px] sticky left-0 bg-[#f7f9fb] z-40 text-foreground" />
                          {monthGroups.map((g) => (
                            <th
                              key={g.key}
                              colSpan={g.span}
                              className="border border-border p-1 text-center text-[11px] font-bold uppercase tracking-wider text-foreground/80 whitespace-nowrap bg-[#f7f9fb]"
                            >
                              <span className="sticky left-[188px] inline-block px-1">{g.label}</span>
                            </th>
                          ))}
                          <th className="border border-border bg-slate-100 sticky right-0 z-40" />
                        </tr>
                      )}
                      {/* Day of week row */}
                      <tr className="z-30 bg-muted">
                        <th className="border border-border p-2 text-left min-w-[180px] sticky left-0 bg-muted z-40 text-foreground font-semibold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)]">
                          Tipologia / Parametro
                        </th>
                        {production.map((day) => (
                          <th
                            key={day.date}
                            className={`border border-border p-1 text-center min-w-[58px] font-medium ${
                              day.isMonthStart ? "border-l-2 border-l-primary" : ""
                            } ${
                              day.isToday ? "bg-primary/10 text-primary" : day.isWeekend ? "bg-amber-50 text-amber-700" : "text-muted-foreground"
                            }`}
                          >
                            {/* Marca l'inizio di ogni mese direttamente qui: la
                                banda mese in cima puo' scorrere via, questa riga
                                (header giorni) e' sempre pinnata e leggibile. */}
                            {day.isMonthStart && (
                              <div className="text-[9px] font-bold uppercase text-primary leading-none mb-0.5">
                                {day.monthShort}
                              </div>
                            )}
                            <div className="text-[10px] uppercase">{day.dayOfWeek}</div>
                            <div className="font-bold text-sm">{day.dayNum}</div>
                          </th>
                        ))}
                        <th className="border border-border p-1 text-center min-w-[68px] bg-slate-100 text-foreground font-bold sticky right-0 z-40">
                          <div className="text-[10px] uppercase">Totale</div>
                        </th>
                      </tr>

                      {/* ===== FESTIVITÀ & EVENTI (in thead to scroll with dates) ===== */}
                      <tr className="bg-gradient-to-r from-amber-50 to-[#fffdf7]">
                        <td className="border border-border p-2 sticky left-0 bg-amber-50 z-20 text-xs font-semibold text-amber-800 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-[10px] uppercase tracking-wider">Festivita' & Eventi</span>
                          </div>
                          <a href="/accelerator/events" className="text-[9px] font-normal text-amber-600 hover:underline block mt-0.5">
                            Gestisci calendario
                          </a>
                        </td>
                        {production.map((day) => {
                          const dayEvents = eventsData[day.date] || []
                          return (
                            <td
                              key={day.date}
                              role="button"
                              tabIndex={0}
                              title="Clicca per aggiungere una nota a questo giorno"
                              onClick={() => { setNoteDialogDate(day.date); setNoteText("") }}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setNoteDialogDate(day.date); setNoteText("") } }}
                              className={`group/note border border-border p-0.5 text-center align-top w-[58px] max-w-[58px] overflow-hidden cursor-pointer bg-[#fffdf7] hover:bg-amber-100 transition-colors ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                            >
                              {dayEvents.length > 0 ? (
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex flex-col gap-0.5 py-0.5 cursor-help w-full">
                                        {dayEvents.slice(0, 2).map(ev => (
                                          <div
                                            key={ev.id}
                                            className="text-[8px] text-white font-medium rounded px-0.5 py-px leading-tight whitespace-normal break-words [overflow-wrap:anywhere] [word-break:break-word] hyphens-auto"
                                            style={{ backgroundColor: ev.color }}
                                          >
                                            <span className="inline-flex items-center gap-0.5">
                                              <FlagIcon code={ev.country_code} className="inline-block h-2 w-auto rounded-[1px] shrink-0" />
                                              <span>{ev.name}</span>
                                            </span>
                                          </div>
                                        ))}
                                        {dayEvents.length > 2 && (
                                          <div className="text-[8px] text-amber-600">+{dayEvents.length - 2}</div>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-[240px] p-2" onClick={(e) => e.stopPropagation()}>
                                      <div className="space-y-1.5">
                                        {dayEvents.map(ev => (
                                          <div key={ev.id} className="flex items-start gap-1.5">
                                            <div className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: ev.color }} />
                                            <div className="min-w-0 flex-1">
                                              <div className="text-xs font-semibold break-words">{ev.name}</div>
                                              <div className="text-[10px] text-muted-foreground">
                                                {ev.type === "note"
                                                  ? "Nota"
                                                  : <span className="inline-flex items-center gap-1">{ev.country_code && <FlagIcon code={ev.country_code} className="inline-block h-2.5 w-auto rounded-[1px]" />}{ev.country_code ? `${ev.country_code} · ` : ""}Impatto {ev.impact === "high" ? "Alto" : ev.impact === "medium" ? "Medio" : "Basso"}</span>}
                                              </div>
                                              {ev.type === "note" && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id) }}
                                                  className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700"
                                                >
                                                  <Trash2 className="h-2.5 w-2.5" /> Elimina nota
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                        <div className="border-t border-border pt-1 text-[10px] text-muted-foreground">
                                          Clicca sul giorno per aggiungere una nota
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="flex items-center justify-center py-0.5">
                                  <span className="text-[9px] text-muted-foreground/30 group-hover/note:hidden">-</span>
                                  <Plus className="hidden h-3 w-3 text-amber-500 group-hover/note:block" />
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="border border-border p-1 text-center text-[10px] sticky right-0 z-20 bg-amber-50 text-amber-700">
                          {Object.values(eventsData).flat().length > 0
                            ? <span className="font-medium">{Object.values(eventsData).flat().length}</span>
                            : <span className="text-muted-foreground/40">-</span>
                          }
                        </td>
                      </tr>

                      {/* ===== PREVISIONI METEO ===== */}
                      <tr className="bg-gradient-to-r from-sky-50 to-[#f9fdff]">
                        <td className="border border-border p-2 sticky left-0 bg-sky-50 z-20 text-xs font-semibold text-sky-700 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                          <div className="flex items-center gap-1.5">
                            <Sun className="h-3.5 w-3.5 text-sky-500" />
                            <span className="text-[10px] uppercase tracking-wider">Previsioni Meteo</span>
                          </div>
                          <span className="text-[9px] font-normal text-muted-foreground block mt-0.5">
                            Score 0-10 (10=ottimo)
                          </span>
                        </td>
                        {production.map((day) => {
                          const weather = weatherData[day.date]
                          const monthDay = day.date.slice(5) // "MM-DD"
                          const prevWeather = prevYearWeather[monthDay]
                          
                          // Determine weather icon based on description
                          const getWeatherIcon = (desc: string | undefined) => {
                            if (!desc) return <Sun className="h-3 w-3 text-amber-400" />
                            const lower = desc.toLowerCase()
                            if (lower.includes("sereno") || lower.includes("sole")) return <Sun className="h-3 w-3 text-amber-400" />
                            if (lower.includes("tempor") || lower.includes("fulmin")) return <CloudLightning className="h-3 w-3 text-purple-500" />
                            if (lower.includes("piog") || lower.includes("rovesc")) return <CloudRain className="h-3 w-3 text-blue-500" />
                            if (lower.includes("neve")) return <Snowflake className="h-3 w-3 text-blue-300" />
                            if (lower.includes("nuvol") || lower.includes("coperto")) return <Cloud className="h-3 w-3 text-slate-400" />
                            return <Sun className="h-3 w-3 text-amber-400" />
                          }
                          
                          // Score color
                          const getScoreColor = (score: number) => {
                            if (score >= 8) return "text-green-600 bg-green-50"
                            if (score >= 6) return "text-sky-600 bg-sky-50"
                            if (score >= 4) return "text-amber-600 bg-amber-50"
                            return "text-red-600 bg-red-50"
                          }
                          
                          return (
                            <td
                              key={day.date}
                              className={`border border-border p-0 text-center bg-[#f9fdff] ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                            >
                              {weather ? (
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex flex-col items-center py-0.5 cursor-help">
                                        {getWeatherIcon(weather.weatherDescription)}
                                        <span className={`text-[10px] font-bold rounded px-1 mt-0.5 ${getScoreColor(weather.weatherScore)}`}>
                                          {weather.weatherScore}
                                        </span>
                                        <span className="text-[8px] text-muted-foreground">
                                          {Math.round(weather.temperatureMax)}°
                                        </span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="text-xs p-2">
                                      <div className="space-y-1">
                                        <div className="font-semibold">{weather.weatherDescription}</div>
                                        <div>Min: {Math.round(weather.temperatureMin)}° / Max: {Math.round(weather.temperatureMax)}°</div>
                                        <div>Precip: {weather.precipitationProbability}%</div>
                                        <div>Score impatto: <span className="font-bold">{weather.weatherScore}/10</span></div>
                                        {prevWeather && (
                                          <div className="pt-1 border-t text-muted-foreground">
                                            Anno scorso: {prevWeather.temperatureMax}° (score {prevWeather.weatherScore})
                                          </div>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-[9px] text-muted-foreground">-</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="border border-border p-1 text-center text-[10px] sticky right-0 z-10 bg-slate-100 text-slate-500">
                          {(() => {
                            let totalScore = 0, count = 0
                            for (const day of production) {
                              const w = weatherData[day.date]
                              if (w) { totalScore += w.weatherScore; count++ }
                            }
                            if (count === 0) return "-"
                            return <span className="font-medium">{(totalScore / count).toFixed(1)}</span>
                          })()}
                        </td>
                      </tr>

                      {/* ===== SCENARIO STORICO ===== */}
                      <tr className="bg-[#fbfcfd]">
                        <td className="border border-border p-2 sticky left-0 bg-slate-50 z-20 text-xs font-semibold text-slate-600 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600">Scenario Storico {new Date().getFullYear() - 1}</span>
                          </div>
                          <span className="text-[9px] font-normal text-muted-foreground block mt-0.5">
                            {occThresholdLow > 0 && occThresholdHigh > 0
                              ? `Bassa: \u2264${occThresholdLow} cam. / Alta: \u2265${occThresholdHigh} cam.`
                              : "Occupazione anno precedente"}
                          </span>
                        </td>
                        {production.map((day) => {
                          const monthDay = day.date.slice(5)
                          const prevRooms = prevYearData[monthDay]?.rooms_occupied ?? null
                          let scenario: "alta" | "bassa" | "media" | null = null
                          if (prevRooms != null && prevRooms > 0) {
                            if (occThresholdLow > 0 && occThresholdHigh > 0) {
                              if (prevRooms <= occThresholdLow) scenario = "bassa"
                              else if (prevRooms >= occThresholdHigh) scenario = "alta"
                              else scenario = "media"
                            } else {
                              scenario = "media"
                            }
                          }
                          return (
                            <td key={day.date} className={`border border-border p-0 text-center ${day.isToday ? "ring-2 ring-primary ring-inset" : ""} ${scenario === "bassa" ? "bg-orange-50" : scenario === "alta" ? "bg-green-50" : "bg-[#fbfcfd]"}`}>
                              {scenario === "alta" && <div className="flex flex-col items-center py-1"><span className="text-[9px] font-bold text-green-700 uppercase leading-tight">Alta</span><span className="text-[8px] text-green-600">{prevRooms} cam</span></div>}
                              {scenario === "media" && <div className="flex flex-col items-center py-1"><span className="text-[9px] font-medium text-slate-500 leading-tight">Media</span>{prevRooms != null && <span className="text-[8px] text-slate-400">{prevRooms} cam</span>}</div>}
                              {scenario === "bassa" && <div className="flex flex-col items-center py-1"><span className="text-[9px] font-bold text-orange-600 uppercase leading-tight">Bassa</span><span className="text-[8px] text-orange-500">{prevRooms} cam</span></div>}
                              {scenario == null && <span className="text-[9px] text-muted-foreground/40">-</span>}
                            </td>
                          )
                        })}
                        <td className="border border-border p-1 text-center text-[10px] sticky right-0 z-10 bg-slate-100 text-slate-500">
                          {(() => {
                            let alta = 0, bassa = 0, tot = 0
                            for (const day of production) {
                              const pr = prevYearData[day.date.slice(5)]?.rooms_occupied ?? null
                              if (pr != null && pr > 0) { tot++; if (occThresholdHigh > 0 && pr >= occThresholdHigh) alta++; else if (occThresholdLow > 0 && pr <= occThresholdLow) bassa++ }
                            }
                            if (tot === 0) return <span className="text-muted-foreground/40">-</span>
                            return <div className="leading-tight"><span className="text-green-600 font-semibold">{alta}A</span> / <span className="text-orange-600 font-semibold">{bassa}B</span></div>
                          })()}
                        </td>
                      </tr>

                      {/* ===== TARIFFA DI PARTENZA ===== */}
                      <tr className="bg-gradient-to-r from-emerald-50 to-[#f7fefb]">
                        <td className="border border-border p-2 sticky left-0 bg-emerald-50 z-20 font-bold text-emerald-800 text-sm min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                          <div className="flex items-center justify-between">
                            <ParamLabel label="Tariffa di partenza" description="Prezzo base di riferimento da cui partono tutti i calcoli dell'algoritmo per questo giorno." />
                            <span className="text-emerald-500 text-[10px] font-normal">(EUR)</span>
                          </div>
                        </td>
                        {production.map((day) => {
                          const paramVal = getAlgoParam("base_rate", day.date)
                          const isDragTarget = dragFill?.type === "param" && dragFill.paramKey === "base_rate" && isInDragRange(day.date)
                          return (
                            <td
                              key={day.date}
                              className={`border border-border p-0 relative ${day.isToday ? "ring-2 ring-primary ring-inset" : ""} ${isDragTarget ? "bg-emerald-100 ring-1 ring-emerald-400/50" : "bg-[#f7fefb]"}`}
                              onMouseEnter={() => handleDragFillEnter(day.date)}
                              onDoubleClick={() => openBulkFill({ type: "param", paramKey: "base_rate" }, day.date, paramVal)}
                            >
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={paramVal}
                                onChange={(e) => handleAlgoParamChange("base_rate", day.date, e.target.value)}
                                className="w-full h-9 text-center text-sm font-semibold bg-transparent border-0 outline-none focus:bg-primary/5 focus:ring-1 focus:ring-primary/30"
                                placeholder="-"
                              />
                              {/* Drag handle - small square at bottom-right corner */}
                              {paramVal !== "" && (
                                <div
                                  title="Trascina per riempire le celle"
                                  className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-600 hover:bg-emerald-700 cursor-grab active:cursor-grabbing z-10 shadow-md rounded-sm transition-all hover:scale-110"
                                  onMouseDown={(e) => handleDragFillStart(e, "param", paramVal, day.date, { paramKey: "base_rate" })}
                                />
                              )}
                            </td>
                          )
                        })}
                        <td className="border border-border p-1 text-center sticky right-0 z-10 bg-emerald-100 text-emerald-600 font-bold min-w-[68px]">
                          {(() => {
                            let sum = 0
                            let count = 0
                            for (const day of production) {
                              const val = getAlgoParam("base_rate", day.date)
                              if (val && !isNaN(Number(val))) {
                                sum += Number(val)
                                count++
                              }
                            }
                            if (count === 0) return "-"
                            return Math.round(sum / count)
                          })()}
                        </td>
                      </tr>
                    </thead>
                    <tbody>
                      {/* ===== SECTION 1: PRICING GRID (room types + rates + occupancy) =====
                          NB: il filtro `visibleRoomTypeIds` agisce SOLO qui (rendering).
                          Tutti i calcoli e le persistenze a valle continuano a usare
                          l'array `roomTypes` completo. */}
                      {roomTypes
                        .filter((rt) => visibleRoomTypeIds === null || visibleRoomTypeIds.has(rt.id))
                        .map((rt) => {
                        const ratesToShow = selectedRate === "__all__" ? rates : rates.filter((r) => r.id === selectedRate)
                        const minOcc = 1
                        const maxOcc = rt.capacity || rt.capacity_default || 2
                        const isCollapsed = collapsedRoomTypes.has(rt.id)
                        const rl = getRateLimit(rt.id)

                        return (
                          <React.Fragment key={rt.id}>
                            {/* Room type header row with occupancy % + collapse arrow */}
                            <tr className="bg-blue-50/80 cursor-pointer select-none" onClick={() => toggleRoomTypeCollapse(rt.id)}>
                              <td className="border border-border p-2 sticky left-0 bg-blue-50 z-20 font-bold text-foreground min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                <div className="flex items-center gap-2">
                                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-blue-500" /> : <ChevronDown className="h-4 w-4 text-blue-500" />}
                                  <Users className="h-3.5 w-3.5 text-blue-600" />
                                  {rt.name}
                                  <Badge variant="outline" className="text-[10px] ml-1">{maxOcc} pax</Badge>
                                  {rt.id === referenceRoomTypeId && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                                  {rl && <span className="text-[9px] text-muted-foreground font-normal">[{rl.bottom_rate}-{rl.rack_rate}]</span>}
                                </div>
                              </td>
                              {production.map((day) => {
                                // UX 03/05/2026: per ogni tipologia di camera mostriamo
                                // il numero di camere vendute su quelle disponibili
                                // (es. "5/7") invece della percentuale. La percentuale
                                // resta nella riga aggregata "Occupazione struttura (%)"
                                // piu' in basso. Il colore semantico della cella e' pero'
                                // ancora basato sulla % (per soglie e leggibilita').
                                const data = occupancyData[rt.id]?.[day.date]
                                const total = data?.total ?? 0
                                const available = data?.available ?? 0
                                const sold = total - available
                                const occPct = total > 0 ? Math.round((sold / total) * 100) : null
                                const display = total > 0 ? `${sold}/${total}` : "-"
                                return (
                                  <td
                                    key={day.date}
                                    className={`border border-border p-1 text-center font-semibold ${
                                      occPct !== null ? `${getOccBgColor(occPct)} ${getOccTextColor(occPct)}` : "text-muted-foreground"
                                    } ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                                    title={occPct !== null ? `${sold} vendute su ${total} disponibili (${occPct}%)` : undefined}
                                  >
                                    {display}
                                  </td>
                                )
                              })}
                              {(() => {
                                // Totale di periodo per la tipologia: somma dei rapporti
                                // (sold totali / disponibili totali). Es. "92/305".
                                // La percentuale ponderata resta nel tooltip per
                                // riferimento. Il colore semantico segue la % calcolata.
                                let sold = 0
                                let total = 0
                                for (const day of production) {
                                  const d = occupancyData[rt.id]?.[day.date]
                                  if (!d || !d.total) continue
                                  sold += (d.total - d.available)
                                  total += d.total
                                }
                                const avg = total > 0 ? (sold / total) * 100 : null
                                const avgDisplay = avg !== null ? avg.toFixed(1).replace(".", ",") : null
                                const rounded = avg !== null ? Math.round(avg) : null
                                const display = total > 0 ? `${sold}/${total}` : "-"
                                return (
                                  <td
                                    className={`border border-border p-1 text-center font-bold sticky right-0 z-10 bg-slate-100 ${rounded !== null ? getOccTextColor(rounded) : "text-muted-foreground"}`}
                                    title={avg !== null ? `Occupazione ponderata: ${sold} camere vendute / ${total} camere disponibili (${avgDisplay}%)` : undefined}
                                  >
                                    {display}
                                  </td>
                                )
                              })()}
                            </tr>

                            {/* Suggested price row (always visible, right under header) */}
                            {!isCollapsed && (
                              <tr className="bg-emerald-50/50">
                                <td className="border border-border p-2 pl-10 sticky left-0 bg-emerald-50 z-20 text-emerald-700 font-medium text-[11px] min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center gap-1.5">
                                    <Cpu className="h-3 w-3 text-emerald-500" />
                                    Prezzo suggerito (base {baseOccupancy}p)
                                  </div>
                                </td>
                                {production.map((day) => {
                                  const suggested = calculateSuggestedPrice(rt.id, day.date)
                                  const isAtFloor = suggested !== null && rl && rl.bottom_rate > 0 && suggested <= rl.bottom_rate
                                  const isAtCeiling = suggested !== null && rl && rl.rack_rate > 0 && suggested >= rl.rack_rate
                                  const lmInfo = suggested !== null ? getLmInfo(day.date) : { active: false, levelName: "", discountLabel: "" }
                                  const lmActive = lmInfo.active
                                  const lmTip = lmActive
                                    ? `Last minute ATTIVO su questa data\nLivello: ${lmInfo.levelName || "-"} (sconto ${lmInfo.discountLabel})`
                                    : ""
                                  const baseTip = isAtFloor ? `Floor: ${rl?.bottom_rate}` : isAtCeiling ? `Ceiling: ${rl?.rack_rate}` : suggested !== null ? `Suggerito: ${suggested}` : "Compila parametri"
                                  return (
                                    <td
                                      key={day.date}
                                      className={`relative border border-border p-1 text-center font-bold text-xs ${
                                        day.isToday ? "ring-2 ring-primary ring-inset" : ""
                                      } ${
                                        suggested === null ? "text-muted-foreground"
                                          : isAtFloor ? "text-red-600 bg-red-50/50"
                                          : isAtCeiling ? "text-orange-600 bg-orange-50/50"
                                          : "text-emerald-700"
                                      }`}
                                      title={lmActive ? `${lmTip}\n\n${baseTip}` : baseTip}
                                    >
                                      {suggested !== null ? suggested : "-"}
                                      {lmActive && (
                                        <span
                                          aria-label="Last minute attivo"
                                          // Cambiato da orange a red 01/05/2026 per
                                          // coerenza visiva con il marker rosso del
                                          // simulatore prezzi.
                                          className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white"
                                        />
                                      )}
                                    </td>
                                  )
                                })}
                                {(() => {
                                  // Average of suggested prices for the month (what the algo
                                  // is telling us to charge). In the tooltip we show the
                                  // REAL category ADR from the booking data:
                                  //   sum(revenue per cat per day) / sum(room-nights per cat per day)
                                  // so the user can instantly compare suggested vs actual.
                                  const vals = production.map(d => calculateSuggestedPrice(rt.id, d.date)).filter((v): v is number => v !== null)
                                  const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null
                                  let revenueSum = 0
                                  let nightsSum = 0
                                  for (const day of production) {
                                    const r = dailyPrices[rt.id]?.[day.date]
                                    const n = dailyCounts[rt.id]?.[day.date]
                                    if (r && n && n > 0) {
                                      revenueSum += r
                                      nightsSum += n
                                    }
                                  }
                                  const adr = nightsSum > 0 ? revenueSum / nightsSum : null
                                  const adrLabel = adr !== null ? `€${Math.round(adr)}` : "n/d"
                                  const tip = adr !== null
                                    ? `ADR reale ${rt.name}: ${adrLabel} (ricavo €${Math.round(revenueSum)} / ${nightsSum} notti vendute)`
                                    : `ADR reale ${rt.name}: nessun dato booking nel periodo`
                                  return (
                                    <td
                                      className="border border-border p-1 text-center font-bold text-xs sticky right-0 z-20 bg-emerald-100 text-emerald-800 cursor-help"
                                      title={tip}
                                    >
                                      {avg ?? "-"}
                                    </td>
                                  )
                                })()}
                              </tr>
                            )}

                            {/* Avg production row (conditional - visible even when collapsed if toggle is on) */}
                            {showAvgProduction && (
                              <tr className="bg-violet-50/40">
                                <td className="border border-border p-2 pl-10 sticky left-0 bg-violet-50 z-20 text-violet-700 italic text-[11px] min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  Prod. media
                                </td>
                                {production.map((day) => {
                                  const avg = getAvgProduction(rt.id, day.date)
                                  return (
                                    <td key={day.date} className={`border border-border p-1 text-center text-violet-600 italic ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}>
                                      {avg !== null ? formatShort(avg) : "-"}
                                    </td>
                                  )
                                })}
                                {(() => {
                                  const avgs = production.map((d) => getAvgProduction(rt.id, d.date)).filter((v): v is number => v !== null)
                                  const total = avgs.reduce((s, v) => s + v, 0)
                                  return (
                                    <td className="border border-border p-1 text-center text-violet-700 font-semibold italic sticky right-0 z-10 bg-slate-100">
                                      {avgs.length > 0 ? formatShort(total) : "-"}
                                    </td>
                                  )
                                })()}
                              </tr>
                            )}

                            {/* Rate x Occupancy rows (collapsible) - uses occupancies from rate config */}
                            {!isCollapsed && ratesToShow.map((rate) =>
                              getOccupanciesForRate(rate, rt).map((occ) => {
                                const occLabel = occ === 1 ? "singola" : occ === (rt.capacity_default || 2) ? "base" : `+extra`
                                return (
                                  <tr key={`${rt.id}-${rate.id}-${occ}`} className="hover:bg-accent/30">
                                    <td className="border border-border p-2 pl-10 sticky left-0 bg-white z-20 text-foreground min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <span className={`${rate.id === referenceRateId ? "text-blue-700 font-medium" : "text-muted-foreground"}`}>
                                            {rate.name}
                                            {rate.id === referenceRateId && <span className="text-[9px] ml-1 text-blue-500">(Princ.)</span>}
                                          </span>
                                          <span className="mx-1 text-muted-foreground/40">-</span>
                                          <span className="font-medium">{occ} pax</span>
                                          <span className="text-muted-foreground/60 ml-1 text-[10px]">({occLabel})</span>
                                        </div>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openBulkFill({ type: "price", roomTypeId: rt.id, rateId: rate.id, occ }) }}
                                          className="text-[9px] text-primary hover:underline ml-2 shrink-0"
                                          title="Compila intervallo date"
                                        >
                                          Compila
                                        </button>
                                      </div>
                                    </td>
                                    {production.map((day) => {
                                      const editKey = `${rt.id}_${rate.id}_${occ}_${day.date}`
                                      // Use edited price if exists in editedPrices, otherwise use calculated display price
                                      const calculatedPrice = getDisplayPrice(rt.id, rate.id, occ, day.date)
                                      const displayed = editedPrices[editKey] !== undefined ? editedPrices[editKey] : calculatedPrice
                                      const suggestedDay = calculateSuggestedPrice(rt.id, day.date, occ, rate.id)
                                      const isEmpty = displayed === ""
                                      const isDragTarget = dragFill?.type === "price" && dragFill.roomTypeId === rt.id && dragFill.rateId === rate.id && dragFill.occ === occ && isInDragRange(day.date)
                                      const cellWarning = priceWarnings[editKey]
                                      const cellRl = getRateLimit(rt.id)
                                      const numDisplayed = parseFloat(displayed)
                                      const cellAtFloor = !isNaN(numDisplayed) && cellRl && cellRl.bottom_rate > 0 && numDisplayed <= cellRl.bottom_rate
                                      const cellAtCeiling = !isNaN(numDisplayed) && cellRl && cellRl.rack_rate > 0 && numDisplayed >= cellRl.rack_rate
                                      // Get the saved price from gridPrices (before any edit)
                                      const gridKey = `${rt.id}_${rate.id}_${occ}`
                                      const savedPrice = gridPrices[gridKey]?.[day.date]
                                      const isEdited = editedPrices[editKey] !== undefined
                                      const showSavedPrice = isEdited && savedPrice !== undefined && String(savedPrice) !== displayed
                                      // Modified / push-feedback state (highest priority wins)
                                      const userEditedVal = userEditedCells.get(editKey)
                                      const isUserEdited = userEditedVal !== undefined && Number.isFinite(userEditedVal)
                                      const feedback = pushFeedback[editKey]
                                      const feedbackClass = feedback === "success"
                                        ? "bg-emerald-100 ring-1 ring-emerald-400"
                                        : feedback === "error"
                                        ? "bg-red-100 ring-1 ring-red-400"
                                        : isUserEdited
                                        ? "bg-amber-100"
                                        : isEdited
                                        ? "bg-amber-50/50"
                                        : ""

                                      // Last-minute attivo per la data: stesso marker
                                      // visivo del simulatore (anello rosso + banner
                                      // rosso nel tooltip). L'anello e' applicato solo
                                      // se non esiste gia' un feedback success/error
                                      // (per non sovrapporre due ring contrastanti).
                                      const cellLm = getLmInfo(day.date)
                                      const showLmRing = cellLm.active && feedback !== "success" && feedback !== "error"
                                      const lmRingClass = showLmRing ? "ring-2 ring-red-400 ring-inset" : ""

                                      return (
                                        <td
                                          key={day.date}
                                          className={`border border-border p-0 relative group/cell transition-colors duration-200 ${day.isToday ? "ring-2 ring-primary ring-inset" : ""} ${isDragTarget ? "bg-primary/10 ring-1 ring-primary/40" : ""} ${cellAtFloor ? "bg-red-50/40" : cellAtCeiling ? "bg-orange-50/40" : ""} ${feedbackClass} ${lmRingClass}`}
                                          title={cellWarning || (cellAtFloor ? `Floor: ${cellRl?.bottom_rate}` : cellAtCeiling ? `Ceiling: ${cellRl?.rack_rate}` : undefined)}
                                          onMouseEnter={() => handleDragFillEnter(day.date)}
                                          onDoubleClick={() => openBulkFill({ type: "price", roomTypeId: rt.id, rateId: rate.id, occ }, day.date, displayed)}
                                        >
 <PriceHistoryTooltip
  hotelId={hotelId}
  roomTypeId={rt.id}
  rateId={rate.id}
  occupancy={occ}
  targetDate={day.date}
  displayPrice={displayed !== "" ? parseFloat(displayed) : null}
  autopilotMode={autopilotMode}
  lastMinute={cellLm.active ? { active: true, levelName: cellLm.levelName, discountLabel: cellLm.discountLabel } : undefined}
  >
                                            <div className="flex flex-col">
                                              <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={displayed}
                                                onChange={(e) => handlePriceChange(`${rt.id}_${rate.id}_${occ}_${day.date}`, e.target.value)}
                                                className={`w-full h-6 text-center text-xs border-0 outline-none focus:bg-primary/5 focus:ring-1 focus:ring-primary/30 ${
                                                  isEmpty && suggestedDay !== null ? "bg-emerald-50/30 placeholder:text-emerald-400/70 placeholder:font-medium" : "bg-transparent"
                                                }`}
                                                placeholder={suggestedDay !== null ? String(suggestedDay) : "-"}
                                              />
                                              {/* Show saved price below when edited */}
                                              {showSavedPrice && (
                                                <div className="text-[8px] text-muted-foreground text-center leading-tight pb-0.5 line-through">
                                                  {savedPrice}
                                                </div>
                                              )}
                                            </div>
                                          </PriceHistoryTooltip>
                                          {/* Drag handle - small square at bottom-right corner */}
                                          {displayed !== "" && (
                                            <div
                                              title="Trascina per riempire le celle"
                                              className="absolute bottom-0 right-0 w-3 h-3 bg-black hover:bg-black/80 cursor-grab active:cursor-grabbing z-10 shadow-md rounded-sm transition-all hover:scale-110"
                                              onMouseDown={(e) => handleDragFillStart(e, "price", displayed, day.date, { roomTypeId: rt.id, rateId: rate.id, occ })}
                                            />
                                          )}
                                        </td>
                                      )
                                    })}
                                    {(() => {
                                      // Show the AVERAGE listed price for this rate × occ
                                      // across the month (i.e. the mean of the values
                                      // visible in this row). The previous version showed
                                      // the SUM which was meaningless for rate cards and
                                      // produced confusing figures like "3.7k".
                                      let sum = 0
                                      let count = 0
                                      let minV = Infinity
                                      let maxV = -Infinity
                                      for (const day of production) {
                                        const v = getDisplayPrice(rt.id, rate.id, occ, day.date)
                                        if (v === "") continue
                                        const n = parseFloat(v)
                                        if (!Number.isFinite(n) || n <= 0) continue
                                        sum += n
                                        count++
                                        if (n < minV) minV = n
                                        if (n > maxV) maxV = n
                                      }
                                      if (count === 0) {
                                        return (
                                          <td className="border border-border p-1 text-center font-semibold text-[10px] sticky right-0 z-10 bg-slate-100 text-muted-foreground">
                                            -
                                          </td>
                                        )
                                      }
                                      const avg = Math.round(sum / count)
                                      const tip = `Prezzo medio di listino: €${avg} su ${count} giorni (min €${Math.round(minV)} – max €${Math.round(maxV)}, totale listino €${Math.round(sum)})`
                                      return (
                                        <td
                                          className="border border-border p-1 text-center font-semibold text-[10px] sticky right-0 z-10 bg-slate-100 text-foreground cursor-help"
                                          title={tip}
                                        >
                                          €{avg}
                                        </td>
                                      )
                                    })()}
                                  </tr>
                                )
                              })
                            )}
                          </React.Fragment>
                        )
                      })}

                    </tbody>
                    {/* ===== SUMMARY ROWS: Occupancy, Production, ADR =====
                        Tbody dedicato: viene pinnato sotto il thead durante lo
                        scroll verticale (vedi effect con summaryRowsRef).
                        FIX 15/07/2026: z-[25], NON z-20. Le celle sticky left
                        delle righe successive (es. "PARAMETRI ALGORITMO BASE")
                        hanno z-20: a parita' di z-index vince chi viene DOPO
                        nel DOM, quindi le etichette scrollate dipingevano
                        SOPRA il blocco pinnato rendendole illeggibili.
                        25 sta sopra le celle sticky (20) e sotto il thead (30). */}
                    <tbody ref={summaryRowsRef} className="relative z-[25] bg-white">
                      {(() => {
                        return (
                          <>
                            {/* Total Hotel Occupancy % */}
                            <tr className="bg-indigo-100 border-t-2 border-indigo-300">
                              <td className="border border-border p-3 sticky left-0 bg-indigo-100 z-20 font-bold text-indigo-900 text-sm min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                <div className="flex items-center justify-between gap-2">
                                  <ParamLabel label="Occupazione struttura" description="Occupazione complessiva della struttura: camere vendute / camere totali. Calcolata dai dati di disponibilita reali." />
                                  {/* Toggle button to switch between % and absolute (sold/total) */}
                                  <button
                                    type="button"
                                    onClick={() => setOccDisplayMode(prev => prev === "pct" ? "abs" : "pct")}
                                    className={`
                                      min-w-[36px] h-6 rounded-md border-2 shadow-sm flex items-center justify-center cursor-pointer
                                      transition-colors hover:opacity-80 flex-shrink-0
                                      ${occDisplayMode === "pct" 
                                        ? "bg-blue-600 border-blue-700 text-white" 
                                        : "bg-emerald-600 border-emerald-700 text-white"
                                      }
                                    `}
                                    title={`Visualizzazione: ${occDisplayMode === "pct" ? "Percentuale" : "Camere vendute/totali"}. Clicca per alternare.`}
                                  >
                                    <span className="text-[10px] font-bold">{occDisplayMode === "pct" ? "%" : "cam"}</span>
                                  </button>
                                </div>
                              </td>
                              {production.map((day) => {
                                let totalCap = 0, totalSold = 0
                                for (const rt of roomTypes) {
                                  const data = occupancyData[rt.id]?.[day.date]
                                  if (data) { totalCap += data.total; totalSold += data.total - data.available }
                                }
                                const pct = totalCap > 0 ? Math.round((totalSold / totalCap) * 100) : null
                                const monthDay = day.date.slice(5)
                                // Use rooms_occupied from prevYearMap and compute occupancy %
                                const prevRoomsOcc = prevYearData[monthDay]?.rooms_occupied ?? null
                                const totalRooms = roomTypes.reduce((s, rt2) => s + (rt2.total_rooms || 0), 0)
                                const prevPct = prevRoomsOcc != null && prevRoomsOcc > 0 && totalRooms > 0
                                  ? Math.round((prevRoomsOcc / totalRooms) * 100)
                                  : null
                                const yoyDiff = pct !== null && prevPct !== null ? pct - prevPct : null
                                // Display based on occDisplayMode
                                const mainDisplay = occDisplayMode === "pct" 
                                  ? (pct !== null ? `${pct}%` : "-")
                                  : (totalCap > 0 ? `${totalSold}/${totalCap}` : "-")
                                const prevDisplay = occDisplayMode === "pct"
                                  ? (prevPct !== null ? `${prevPct}%` : null)
                                  : (prevRoomsOcc !== null && totalRooms > 0 ? `${prevRoomsOcc}/${totalRooms}` : null)
                                return (
                                  <td key={day.date} className={`border border-border p-1 text-center ${day.isToday ? "ring-2 ring-primary ring-inset" : ""} ${pct !== null ? (pct >= 90 ? "text-red-700 bg-red-50" : pct >= 70 ? "text-orange-700 bg-orange-50/60" : pct >= 50 ? "text-yellow-700 bg-yellow-50/60" : "text-indigo-700") : "text-muted-foreground"}`}
                                    title={prevPct !== null ? `Anno prec: ${prevPct}% (${yoyDiff !== null && yoyDiff >= 0 ? "+" : ""}${yoyDiff}pp)` : undefined}
                                  >
                                    <div className="text-sm font-bold leading-tight">{mainDisplay}</div>
                                    {prevDisplay !== null && (
                                      <div className={`text-[10px] leading-tight ${yoyDiff !== null && yoyDiff > 0 ? "text-green-700" : yoyDiff !== null && yoyDiff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                        {prevDisplay} {occDisplayMode === "pct" && yoyDiff !== null && <span className="opacity-70">({yoyDiff >= 0 ? "+" : ""}{yoyDiff})</span>}
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                              {(() => {
                                let totalCap = 0, totalSold = 0
                                for (const day of production) {
                                  for (const rt of roomTypes) {
                                    const data = occupancyData[rt.id]?.[day.date]
                                    if (data) { totalCap += data.total; totalSold += data.total - data.available }
                                  }
                                }
                                const avgPct = totalCap > 0 ? Math.round((totalSold / totalCap) * 100) : null
                                const totalDisplay = occDisplayMode === "pct"
                                  ? (avgPct !== null ? `${avgPct}%` : "-")
                                  : (totalCap > 0 ? `${totalSold}/${totalCap}` : "-")
                                return (
                                  <td className="border border-border p-1 text-center font-bold text-sm sticky right-0 z-20 bg-indigo-200 text-indigo-900">
                                    {totalDisplay}
                                  </td>
                                )
                              })()}
                            </tr>



                            {/* Total Daily Production (from real booking data) */}
                            <tr className="bg-emerald-100">
                              <td className="border border-border p-3 sticky left-0 bg-emerald-100 z-20 font-bold text-emerald-900 text-sm min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                <ParamLabel label="Produzione giornaliera" description="Ricavo totale giornaliero della struttura basato sui dati reali delle prenotazioni. Somma dei ricavi di tutte le tipologie per ogni giorno." />
                              </td>
                              {production.map((day) => {
                                let dayTotal = 0
                                for (const rt of roomTypes) {
                                  const rev = dailyPrices[rt.id]?.[day.date] || 0
                                  dayTotal += rev
                                }
                                const monthDay = day.date.slice(5)
                                const prevRev = prevYearData[monthDay]?.total_revenue ?? null
                                const yoyDiff = dayTotal > 0 && prevRev !== null ? dayTotal - prevRev : null
                                return (
                                  <td key={day.date} className={`border border-border p-1 text-center text-emerald-800 ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                                    title={prevRev !== null && prevRev > 0 ? `Anno prec: ${formatEuro(prevRev)} (${yoyDiff !== null && yoyDiff >= 0 ? "+" : ""}${formatEuro(yoyDiff || 0)})` : undefined}
                                  >
                                    <div className="text-sm font-bold leading-tight">{dayTotal > 0 ? formatEuro(dayTotal) : "-"}</div>
                                    {prevRev !== null && prevRev > 0 && (
                                      <div className={`text-[10px] leading-tight ${yoyDiff !== null && yoyDiff > 0 ? "text-green-700" : yoyDiff !== null && yoyDiff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                        {formatEuro(prevRev)} <span className="opacity-70">{yoyDiff !== null ? `(${yoyDiff >= 0 ? "+" : ""}${formatEuro(yoyDiff)})` : ""}</span>
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                              {(() => {
                                let grandTotal = 0
                                for (const day of production) {
                                  for (const rt of roomTypes) {
                                    grandTotal += dailyPrices[rt.id]?.[day.date] || 0
                                  }
                                }
                                return (
                                  <td className="border border-border p-1 text-center font-bold text-sm sticky right-0 z-20 bg-emerald-200 text-emerald-900">
                                    {grandTotal > 0 ? formatEuro(grandTotal) : "-"}
                                  </td>
                                )
                              })()}
                            </tr>

                            {/* ADR (Average Daily Rate from real data) */}
                            <tr className="bg-amber-100 border-b-2 border-amber-300">
                              <td className="border border-border p-3 sticky left-0 bg-amber-100 z-20 font-bold text-amber-900 text-sm min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                <ParamLabel label="ADR (Ricavo medio/camera)" description="Average Daily Rate: ricavo medio per camera venduta. Calcolato come produzione giornaliera diviso il numero di prenotazioni attive per quel giorno (dati reali)." />
                              </td>
                              {production.map((day) => {
                                let dayRevenue = 0, dayBookings = 0
                                for (const rt of roomTypes) {
                                  const rev = dailyPrices[rt.id]?.[day.date] || 0
                                  const cnt = dailyCounts[rt.id]?.[day.date] || 0
                                  dayRevenue += rev
                                  dayBookings += cnt
                                }
                                const adr = dayBookings > 0 ? dayRevenue / dayBookings : null
                                const monthDay = day.date.slice(5)
                                const prevAdr = prevYearData[monthDay]?.adr ?? null
                                const yoyDiff = adr !== null && prevAdr !== null && prevAdr > 0 ? adr - prevAdr : null
                                return (
                                  <td key={day.date} className={`border border-border p-1 text-center text-amber-800 ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                                    title={prevAdr !== null && prevAdr > 0 ? `Anno prec: ${formatEuro(prevAdr)} (${yoyDiff !== null && yoyDiff >= 0 ? "+" : ""}${formatEuro(yoyDiff || 0)})` : undefined}
                                  >
                                    <div className="text-sm font-bold leading-tight">{adr !== null ? formatEuro(adr) : "-"}</div>
                                    {prevAdr !== null && prevAdr > 0 && (
                                      <div className={`text-[10px] leading-tight ${yoyDiff !== null && yoyDiff > 0 ? "text-green-700" : yoyDiff !== null && yoyDiff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                        {formatEuro(prevAdr)} <span className="opacity-70">{yoyDiff !== null ? `(${yoyDiff >= 0 ? "+" : ""}${formatEuro(yoyDiff)})` : ""}</span>
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                              {(() => {
                                let grandRevenue = 0, grandBookings = 0
                                for (const day of production) {
                                  for (const rt of roomTypes) {
                                    grandRevenue += dailyPrices[rt.id]?.[day.date] || 0
                                    grandBookings += dailyCounts[rt.id]?.[day.date] || 0
                                  }
                                }
                                const avgAdr = grandBookings > 0 ? grandRevenue / grandBookings : null
                                return (
                                  <td className="border border-border p-1 text-center font-bold text-sm sticky right-0 z-20 bg-amber-200 text-amber-900">
                                    {avgAdr !== null ? formatEuro(avgAdr) : "-"}
                                  </td>
                                )
                              })()}
                            </tr>


                          </>
                        )
                      })()}
                    </tbody>
                    <tbody>

                      {/* ===== SECTION 2: PARAMETRI ALGORITMO BASE ===== */}
                      <tr className="bg-slate-200">
                        <td className="border border-border p-2 sticky left-0 z-20 bg-slate-200 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                          <span className="font-bold text-foreground text-xs uppercase tracking-wider">Parametri Algoritmo Base</span>
                        </td>
                        {production.map((day) => (
                          <td key={day.date} className="border border-border bg-slate-200" />
                        ))}
                        <td className="border border-border bg-slate-200 sticky right-0 z-10" />
                      </tr>

                      {(() => {
                        let currentSectionKey: string | null = null
                        return paramRows.map((row) => {
                          // Track the current section for collapse logic
                          if (row.section === "__divider__" || row.section === "__divider_bands__") {
                            currentSectionKey = row.key
                          }
                          const isSectionCollapsed = currentSectionKey ? collapsedParamSections.has(currentSectionKey) : false

                          // Section divider with collapse arrow
                          if (row.section === "__divider__") {
                            const isVariablesSection = row.key === "__section_variables"
                            return (
                              <tr
                                key={row.key}
                                className="bg-muted/60 cursor-pointer select-none"
                                onClick={() => {
                                  setCollapsedParamSections((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(row.key)) next.delete(row.key)
                                    else next.add(row.key)
                                    return next
                                  })
                                }}
                              >
                                <td className="border border-border p-2 sticky left-0 bg-muted z-20 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      {isSectionCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                      <ParamLabel label={row.label} description={row.description} />
                                    </div>
                                    {isVariablesSection && !isSectionCollapsed && (
                                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <VariableSourceBadge autoSourced={true} />
                                        <VariableSourceBadge autoSourced={false} />
                                      </div>
                                    )}
                                  </div>
                                </td>
                                {production.map((day) => (
                                  <td key={day.date} className="border border-border bg-muted/60" />
                                ))}
                                <td className="border border-border bg-muted sticky right-0 z-20" />
                              </tr>
                            )
                          }

                          // Bands section divider with collapse arrow + settings link
                          if (row.section === "__divider_bands__") {
                            return (
                              <tr
                                key={row.key}
                                className="bg-muted/60 cursor-pointer select-none"
                                onClick={() => {
                                  setCollapsedParamSections((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(row.key)) next.delete(row.key)
                                    else next.add(row.key)
                                    return next
                                  })
                                }}
                              >
                                <td className="border border-border p-2 sticky left-0 bg-muted z-20 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {isSectionCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                      <ParamLabel label={row.label} description={row.description} />
                                    </div>
                                    <Link href="/settings/occupancy-bands" onClick={(e) => e.stopPropagation()}>
                                      <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px]">
                                        <ExternalLink className="h-3 w-3" /> Gestisci fasce
                                      </Button>
                                    </Link>
                                  </div>
                                </td>
                                {production.map((day) => (
                                  <td key={day.date} className="border border-border bg-muted/60" />
                                ))}
                                <td className="border border-border bg-muted sticky right-0 z-20" />
                              </tr>
                            )
                          }

                          // Everything below a collapsed section is hidden
                          if (isSectionCollapsed) return null

                          // Last minute level selector row (dropdown per day)
                          if (row.section === "__lm_level_selector__") {
                            return (
                              <tr key={row.key} className="bg-orange-50/40">
                                <td className="border border-border p-2 pl-8 sticky left-0 bg-orange-50 z-20 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center justify-between">
                                    <ParamLabel label={row.label} description={row.description} />
                                    <button
                                      onClick={() => openBulkFill({ type: "param", paramKey: row.key })}
                                      className="text-[9px] text-primary hover:underline ml-2 shrink-0"
                                      title="Compila intervallo date"
                                    >
                                      Compila
                                    </button>
                                  </div>
                                </td>
                                {production.map((day) => {
                                  const currentLevelId = getAlgoParam("last_minute_level_id", day.date)
                                  const activeLevel = currentLevelId ? lastMinuteLevels.find(l => l.id === currentLevelId) : null
                                  const isDragTarget = dragFill?.type === "param" && dragFill.paramKey === "last_minute_level_id" && isInDragRange(day.date)
                                  return (
                                    <td
                                      key={day.date}
                                      className={`border border-border p-0 relative group/lmcell ${day.isToday ? "ring-2 ring-primary ring-inset" : ""} ${isDragTarget ? "bg-primary/10 ring-1 ring-primary/40" : ""}`}
                                      onMouseEnter={() => handleDragFillEnter(day.date)}
                                      onDoubleClick={() => openBulkFill({ type: "param", paramKey: "last_minute_level_id" })}
                                    >
                                      <select
                                        value={currentLevelId || ""}
                                        onChange={(e) => handleAlgoParamChange("last_minute_level_id", day.date, e.target.value)}
                                        className="w-full h-7 text-center text-[10px] border-0 outline-none focus:bg-primary/5 cursor-pointer pr-3"
                                        style={activeLevel ? { backgroundColor: `${activeLevel.color}15`, color: activeLevel.color } : {}}
                                      >
                                        <option value="">-- Nessuno --</option>
                                        {lastMinuteLevels.map((l) => {
                                          // FIX 21/05/2026: il vecchio render usava `l.discount_pct`
                                          // (campo legacy su `last_minute_levels`) che e' sempre 0
                                          // perche' gli sconti reali vivono in
                                          // `last_minute_level_discounts` per banda. Risultato:
                                          // dropdown mostrava "Leggero (0%)", "Medio (0%)", ...
                                          // anche per Scidoo/gsheets. Allineato al render gia'
                                          // usato nel BulkFill dialog (riga ~4695): leggiamo
                                          // `shared_bands[*].discount_pct` e mostriamo il range.
                                          const bands = (l as { shared_bands?: Array<{ discount_pct: number | string }> }).shared_bands
                                          const discounts = (bands ?? [])
                                            .map(b => Number(b.discount_pct))
                                            .filter(d => Number.isFinite(d) && d > 0)
                                          const minD = discounts.length > 0 ? Math.min(...discounts) : null
                                          const maxD = discounts.length > 0 ? Math.max(...discounts) : null
                                          const label = minD !== null && maxD !== null
                                            ? (minD === maxD ? `${minD}%` : `${minD}-${maxD}%`)
                                            : `${Number(l.discount_pct ?? 0)}%`
                                          return (
                                            <option key={l.id} value={l.id}>{l.name} ({label})</option>
                                          )
                                        })}
                                      </select>
                                      {currentLevelId && (
                                        <div
                                          className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-black cursor-crosshair z-10"
                                          onMouseDown={(e) => handleDragFillStart(e, "param", currentLevelId, day.date, { paramKey: "last_minute_level_id" })}
                                        />
                                      )}
                                    </td>
                                  )
                                })}
                                <td className="border border-border p-1 text-center text-[10px] font-medium sticky right-0 z-10 bg-slate-100 text-muted-foreground">-</td>
                              </tr>
                            )
                          }

                          // Band group selector row (dropdown per day)
                          if (row.section === "__band_group_selector__") {
                            return (
                              <tr key={row.key} className="bg-blue-50/40">
                                <td className="border border-border p-2 pl-8 sticky left-0 bg-blue-50 z-20 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center justify-between">
                                    <ParamLabel label={row.label} description={row.description} />
                                    <button
                                      onClick={() => openBulkFill({ type: "param", paramKey: row.key })}
                                      className="text-[9px] text-primary hover:underline ml-2 shrink-0"
                                      title="Compila intervallo date"
                                    >
                                      Compila
                                    </button>
                                  </div>
                                </td>
                                {production.map((day) => {
                                  const currentGroupId = getAlgoParam("band_group_id", day.date)
                                  const activeGroup = bandGroups.find(g => g.id === currentGroupId)
                                  const groupColor = activeGroup?.color
                                  const isDragTarget = dragFill?.type === "param" && dragFill.paramKey === "band_group_id" && isInDragRange(day.date)
                                  return (
                                    <td
                                      key={day.date}
                                      className={`border border-border p-0 relative group/bgcell ${day.isToday ? "ring-2 ring-primary ring-inset" : ""} ${isDragTarget ? "bg-primary/10 ring-1 ring-primary/40" : ""}`}
                                      onMouseEnter={() => handleDragFillEnter(day.date)}
                                      onDoubleClick={() => openBulkFill({ type: "param", paramKey: "band_group_id" })}
                                    >
                                      <select
                                        value={currentGroupId || bandGroups[0]?.id || ""}
                                        onChange={(e) => handleAlgoParamChange("band_group_id", day.date, e.target.value)}
                                        className="w-full h-7 text-center text-[10px] border-0 outline-none focus:bg-primary/5 cursor-pointer pr-3"
                                        style={groupColor ? { backgroundColor: `${groupColor}15`, color: groupColor } : {}}
                                      >
                                        {bandGroups.map((g) => (
                                          <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                      </select>
                                      {(currentGroupId || bandGroups[0]?.id) && (
                                        <div
                                          className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-black cursor-crosshair z-10"
                                          onMouseDown={(e) => handleDragFillStart(e, "param", currentGroupId || bandGroups[0]?.id || "", day.date, { paramKey: "band_group_id" })}
                                        />
                                      )}
                                    </td>
                                  )
                                })}
                                <td className="border border-border p-1 text-center text-[10px] font-medium sticky right-0 z-10 bg-slate-100 text-muted-foreground">-</td>
                              </tr>
                            )
                          }

                          // Reference room type row (highlighted, non-editable)
                          if (row.section === "__ref_room_type__") {
                            return (
                              <tr key={row.key} className="bg-amber-100/60">
                                <td className="border border-border p-2 pl-8 sticky left-0 bg-amber-100 z-20 font-bold text-amber-800 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center gap-1.5">
                                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                    <ParamLabel label={row.label} description={row.description} />
                                  </div>
                                </td>
                                {production.map((day) => (
                                  <td key={day.date} className={`border border-border p-1 text-center text-amber-600 font-semibold text-[10px] ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}>
                                    0%
                                  </td>
                                ))}
                                <td className="border border-border p-1 text-center text-amber-600 font-bold text-[10px] sticky right-0 z-20 bg-amber-100">0%</td>
                              </tr>
                            )
                          }

                          // Reference rate row (highlighted, non-editable)
                          if (row.section === "__ref_rate__") {
                            return (
                              <tr key={row.key} className="bg-blue-100/60">
                                <td className="border border-border p-2 pl-8 sticky left-0 bg-blue-100 z-20 font-bold text-blue-800 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center gap-1.5">
                                    <Star className="h-3.5 w-3.5 text-blue-500 fill-blue-500" />
                                    <ParamLabel label={row.label} description={row.description} />
                                  </div>
                                </td>
                                {production.map((day) => (
                                  <td key={day.date} className={`border border-border p-1 text-center text-blue-600 font-semibold text-[10px] ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}>
                                    0{adjustmentUnit === "%" ? "%" : ""}
                                  </td>
                                ))}
                                <td className="border border-border p-1 text-center text-blue-600 font-bold text-[10px] sticky right-0 z-20 bg-blue-100">0{adjustmentUnit === "%" ? "%" : ""}</td>
                              </tr>
                            )
                          }

                          // Band header (editable range + default increment)
                          // FASCIA OCCUPAZIONE rows - show occupancy range per day
                          if (row.section === "__band_occupancy__") {
                            const bandIdx = parseInt(row.key.replace("band_range_", ""), 10)
                            return (
                              <tr key={row.key} className="bg-slate-50/60">
                                <td className="border border-border p-1.5 pl-6 sticky left-0 bg-slate-50 z-20 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold text-slate-700">{row.label}</span>
                                    {/* Toggle button for first band row to switch display mode */}
                                    {bandIdx === 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => setOccDisplayMode(prev => prev === "pct" ? "abs" : "pct")}
                                        className={`
                                          min-w-[36px] h-6 rounded-md border-2 shadow-sm flex items-center justify-center cursor-pointer
                                          transition-colors hover:opacity-80
                                          ${occDisplayMode === "pct" 
                                            ? "bg-blue-600 border-blue-700 text-white" 
                                            : "bg-emerald-600 border-emerald-700 text-white"
                                          }
                                        `}
                                        title={`Visualizzazione: ${occDisplayMode === "pct" ? "Percentuale" : "Camere"}. Clicca per alternare.`}
                                      >
                                        <span className="text-[10px] font-bold">{occDisplayMode === "pct" ? "%" : "cam"}</span>
                                      </button>
                                    ) : (
                                      /* Static badge for other band rows */
                                      <div
                                        className={`
                                          min-w-[36px] h-6 rounded-md border-2 shadow-sm flex items-center justify-center cursor-default
                                          ${occDisplayMode === "pct" 
                                            ? "bg-blue-600 border-blue-700 text-white" 
                                            : "bg-emerald-600 border-emerald-700 text-white"
                                          }
                                        `}
                                        title={occDisplayMode === "pct" ? "Percentuale occupazione" : "Numero camere"}
                                      >
                                        <span className="text-[10px] font-bold">{occDisplayMode === "pct" ? "%" : "cam"}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                {production.map((day) => {
                                  // Read from correct structure: algoParams[paramKey][date]
                                  const dayBandGroupId = algoParams["band_group_id"]?.[day.date] || ""
                                  const dayBandGroup = dayBandGroupId && bandGroups.length > 0
                                    ? bandGroups.find(g => g.id === dayBandGroupId) || bandGroups[0]
                                    : (bandGroups.length > 0 ? bandGroups[0] : null)
                                  const dayBand = dayBandGroup?.bands?.[bandIdx]
                                  if (!dayBand) return <td key={day.date} className="border border-border bg-slate-50/60 text-center text-[10px] text-muted-foreground">-</td>
                                  
                                  // Calculate hotel occupancy for this day to highlight active band
                                  let totalSold = 0
                                  let totalCap = 0
                                  for (const rt of roomTypes) {
                                    const data = occupancyData[rt.id]?.[day.date]
                                    if (data && data.total > 0) {
                                      totalSold += data.total - data.available
                                      totalCap += data.total
                                    }
                                  }
                                  const hotelOccPct = totalCap > 0 ? Math.round((totalSold / totalCap) * 1000) / 10 : null
                                  const hotelOccNum = totalSold
                                  
                                  const occMode = dayBand.occupancy_mode || "pct"
                                  // Check if current occupancy falls within this band
                                  let isActiveBand = false
                                  if (occMode === "pct" && hotelOccPct !== null) {
                                    isActiveBand = hotelOccPct >= (dayBand.min_pct ?? 0) && hotelOccPct <= (dayBand.max_pct ?? 100)
                                  } else if (occMode === "num" && hotelOccNum !== null) {
                                    isActiveBand = hotelOccNum >= (dayBand.min_num ?? 0) && hotelOccNum <= (dayBand.max_num ?? 999)
                                  }
                                  
                                  // Display based on user's occDisplayMode preference (toggle button)
                                  // "pct" = show percentage, "abs" = show absolute (camere vendute/totali)
                                  const rangeText = occDisplayMode === "pct"
                                    ? `${dayBand.min_pct ?? 0}% - ${dayBand.max_pct ?? 0}%`
                                    : `${dayBand.min_num ?? 0} - ${dayBand.max_num ?? 0} cam`
                                  const alternativeText = occDisplayMode === "pct"
                                    ? `${dayBand.min_num ?? 0} - ${dayBand.max_num ?? 0} camere`
                                    : totalCap > 0
                                      ? `${Math.min((dayBand.min_num ?? 0) / totalCap * 100, 100).toFixed(1)}% - ${Math.min((dayBand.max_num ?? 0) / totalCap * 100, 100).toFixed(1)}%`
                                      : `${dayBand.min_pct ?? 0}% - ${dayBand.max_pct ?? 0}%`
                                  const currentOccText = occDisplayMode === "pct" 
                                    ? `Occupazione attuale: ${hotelOccPct ?? "-"}%`
                                    : `Occupazione attuale: ${hotelOccNum ?? "-"} camere`
                                  const tooltipText = `Livello: ${dayBandGroup?.name || "-"}\nFascia ${toRoman(bandIdx + 1)}\n${occDisplayMode === "pct" ? "Percentuale" : "Camere"}: ${rangeText}\n${occDisplayMode === "pct" ? "Camere" : "Percentuale"}: ${alternativeText}\n${currentOccText}${isActiveBand ? " ← ATTIVA" : ""}`
                                  
                                  // When the band is active, show the real occupancy along with
                                  // the "sold / total" room count so the user can cross-check the %.
                                  // When the band is not active, show the range only.
                                  const cellValue = isActiveBand
                                    ? (occDisplayMode === "pct"
                                        ? `${hotelOccPct ?? 0}%`
                                        : `${hotelOccNum}/${totalCap}`)
                                    : rangeText
                                  
                                  return (
                                    <td
                                      key={day.date}
                                      title={tooltipText}
                                      className={`border border-border p-0 text-center cursor-help ${isActiveBand ? "bg-yellow-200 ring-2 ring-yellow-500 ring-inset font-bold" : "bg-slate-50/60"} ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                                    >
                                      <div className={`w-full h-7 flex items-center justify-center text-[11px] font-medium ${isActiveBand ? "text-yellow-900" : "text-slate-400"}`}>
                                        {cellValue}
                                      </div>
                                    </td>
                                  )
                                })}
                                <td className="border border-border bg-slate-50 sticky right-0 z-20" />
                              </tr>
                            )
                          }

                          // INCREMENTO FASCIA rows - show increment per day
                          if (row.section === "__band_increment__") {
                            const bandIdx = parseInt(row.key.replace("increment_band_", ""), 10)
                            return (
                              <tr key={row.key} className="bg-amber-50/40">
                                <td className="border border-border p-1.5 pl-6 sticky left-0 bg-amber-50 z-20 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold text-amber-800">{row.label}</span>
                                    {/* Colored unit badge - same style as settings */}
                                    <div
                                      className={`
                                        min-w-[36px] h-6 rounded-md border-2 shadow-sm flex items-center justify-center cursor-default
                                        ${row.unit === "%" 
                                          ? "bg-blue-600 border-blue-700 text-white" 
                                          : "bg-emerald-600 border-emerald-700 text-white"
                                        }
                                      `}
                                      title={row.unit === "%" ? "Incremento in percentuale" : "Incremento in Euro"}
                                    >
                                      <span className="text-[11px] font-bold">{row.unit === "%" ? "%" : "EUR"}</span>
                                    </div>
                                  </div>
                                </td>
                                {production.map((day) => {
                                  // Read from correct structure: algoParams[paramKey][date]
                                  const dayBandGroupId = algoParams["band_group_id"]?.[day.date] || ""
                                  const dayBandGroup = dayBandGroupId && bandGroups.length > 0
                                    ? bandGroups.find(g => g.id === dayBandGroupId) || bandGroups[0]
                                    : (bandGroups.length > 0 ? bandGroups[0] : null)
                                  const dayBand = dayBandGroup?.bands?.[bandIdx]
                                  if (!dayBand) return <td key={day.date} className="border border-border bg-amber-50/40 text-center text-[10px] text-muted-foreground">-</td>

                                  // Calculate if this is the active band (same logic as occupancy row)
                                  let isActiveBand = false
                                  let totalSold = 0
                                  let totalCap = 0
                                  for (const rt of roomTypes) {
                                    const data = occupancyData[rt.id]?.[day.date]
                                    if (data && data.total > 0) {
                                      totalSold += data.total - data.available
                                      totalCap += data.total
                                    }
                                  }
                                  const hotelOccPct = totalCap > 0 ? Math.round((totalSold / totalCap) * 1000) / 10 : null
                                  const hotelOccNum = totalSold
                                  const occMode = dayBand.occupancy_mode || "pct"
                                  if (occMode === "pct" && hotelOccPct !== null) {
                                    isActiveBand = hotelOccPct >= (dayBand.min_pct ?? 0) && hotelOccPct <= (dayBand.max_pct ?? 100)
                                  } else if (occMode === "num" && hotelOccNum !== null) {
                                    isActiveBand = hotelOccNum >= (dayBand.min_num ?? 0) && hotelOccNum <= (dayBand.max_num ?? 999)
                                  }

                                  const incMode = dayBand.increment_mode || "eur"
                                  const increment = incMode === "pct" ? (dayBand.increment_pct ?? 0) : (dayBand.increment_eur ?? 0)
                                  const incText = `${increment >= 0 ? "+" : ""}${incMode === "pct" ? increment.toFixed(1) + "%" : "€ " + increment.toFixed(2)}`
                                  // Build tooltip with all increments
                                  const allBands = dayBandGroup?.bands ?? []
                                  const tooltipLines = (allBands.length > 0) ? allBands.map((b: any, i: number) => {
                                    const inc = incMode === "pct" ? (b.increment_pct ?? 0) : (b.increment_eur ?? 0)
                                    const incLabel = incMode === "pct" ? `${inc >= 0 ? "+" : ""}${inc.toFixed(1)}%` : `${inc >= 0 ? "+" : ""}€${inc.toFixed(2)}`
                                    return `${i === bandIdx ? "▶ " : "  "}Fascia ${toRoman(i + 1)}: ${incLabel}`
                                  }) : []
                                  const tooltipText = allBands.length > 0 
                                    ? [`Livello: ${dayBandGroup?.name || "-"}`, ...tooltipLines, isActiveBand ? "⬆ INCREMENTO ATTIVO" : ""].filter(Boolean).join("\n")
                                    : "Nessuna fascia disponibile"
                                  return (
                                    <td
                                      key={day.date}
                                      title={tooltipText}
                                      className={`border border-border p-0 text-center cursor-help ${isActiveBand ? "bg-yellow-100 ring-2 ring-yellow-400 ring-inset" : "bg-amber-50/40"} ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                                    >
                                      <div className={`w-full h-7 flex items-center justify-center text-[11px] font-semibold ${isActiveBand ? "text-yellow-900 font-bold" : "text-amber-900"}`}>
                                        {incText}
                                      </div>
                                    </td>
                                  )
                                })}
                                <td className="border border-border bg-amber-50 sticky right-0 z-20" />
                              </tr>
                            )
                          }

                          // Media giornaliera incrementi
                          if (row.section === "__avg_increment__") {
                            return (
                              <tr key={row.key} className="bg-orange-50 border-t-2 border-orange-200">
                                <td className="border border-border p-2 sticky left-0 bg-orange-50 z-20 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-orange-800 uppercase tracking-wider">Media incrementi giorno</span>
                                  </div>
                                  <span className="text-[9px] text-orange-600/70 block mt-0.5">Media di tutte le fasce attive</span>
                                </td>
                                {production.map((day) => {
                                  const dayBandGroupId = algoParams["band_group_id"]?.[day.date] || ""
                                  const dayBandGroup = dayBandGroupId && bandGroups.length > 0
                                    ? bandGroups.find(g => g.id === dayBandGroupId) || bandGroups[0]
                                    : (bandGroups.length > 0 ? bandGroups[0] : null)
                                  const allBands = dayBandGroup?.bands ?? []
                                  if (allBands.length === 0) {
                                    return <td key={day.date} className="border border-border bg-orange-50 text-center text-[10px] text-muted-foreground">-</td>
                                  }
                                  const incMode = allBands[0]?.increment_mode || "eur"
                                  const total = allBands.reduce((sum: number, b: any) => {
                                    return sum + (incMode === "pct" ? (b.increment_pct ?? 0) : (b.increment_eur ?? 0))
                                  }, 0)
                                  const avg = total / allBands.length
                                  const avgText = incMode === "pct"
                                    ? `${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%`
                                    : `${avg >= 0 ? "+" : ""}€ ${avg.toFixed(2)}`
                                  const color = avg > 0 ? "text-green-700" : avg < 0 ? "text-red-700" : "text-slate-500"
                                  return (
                                    <td
                                      key={day.date}
                                      title={`Livello: ${dayBandGroup?.name || "-"}\nMedia su ${allBands.length} fasce`}
                                      className={`border border-border bg-orange-50 p-0 text-center cursor-help ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                                    >
                                      <div className={`w-full h-7 flex items-center justify-center text-[11px] font-bold ${color}`}>
                                        {avgText}
                                      </div>
                                    </td>
                                  )
                                })}
                                <td className="border border-border bg-orange-50 sticky right-0 z-10" />
                              </tr>
                            )
                          }

                          // K Coefficient row (read-only, auto-calculated)
                          if (row.key === "__k_coefficient") {
                            return (
                              <tr key={row.key} className="bg-indigo-50/50 border-t-2 border-indigo-200">
                                <td className="border border-border p-2 sticky left-0 bg-indigo-50 z-20 min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                                  <div className="flex items-center gap-1.5">
                                    <BarChart3 className="h-3.5 w-3.5 text-indigo-600" />
                                    <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Coefficiente K</span>
                                  </div>
                                  <span className="text-[9px] text-indigo-600/70 block mt-0.5">Media pesata variabili [-1, +1]</span>
                                </td>
                                {production.map((day) => {
                                  const { k, details } = calculateK(day.date)
                                  const kDisplay = k.toFixed(2)
                                  const kColor = k > 0.1 ? "text-green-700 bg-green-50" : k < -0.1 ? "text-red-700 bg-red-50" : "text-slate-500 bg-slate-50"
                                  const kBorderColor = k > 0.1 ? "border-green-200" : k < -0.1 ? "border-red-200" : "border-slate-200"
                                  // Check K vs historical scenario conflict
                                  const monthDay = day.date.slice(5)
                                  const prevRooms = prevYearData[monthDay]?.rooms_occupied ?? null
                                  let kAlert = ""
                                  if (prevRooms != null && occThresholdLow > 0 && occThresholdHigh > 0) {
                                    if (k > 0.1 && prevRooms <= occThresholdLow) kAlert = "K spinge al rialzo ma storico BASSA"
                                    else if (k < -0.1 && prevRooms >= occThresholdHigh) kAlert = "K smorza ma storico ALTA"
                                  }
                                  const tooltipText = details.length > 0
                                    ? `K = ${kDisplay}\n${details.map(d => `${d.label}: ${d.value}/10 (peso ${d.weight})`).join("\n")}${kAlert ? `\n-- ${kAlert}` : ""}`
                                    : "Nessuna variabile attiva"
                                  return (
                                    <td
                                      key={day.date}
                                      className={`border ${kBorderColor} p-0 text-center ${day.isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                                      title={tooltipText}
                                    >
                                      <div className={`w-full h-8 flex items-center justify-center text-xs font-bold ${kColor} relative`}>
                                        {k === 0 && details.length === 0 ? "-" : (k > 0 ? "+" : "") + kDisplay}
                                        {kAlert && (
                                          <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-r-[8px] border-t-amber-500 border-r-transparent" />
                                        )}
                                      </div>
                                    </td>
                                  )
                                })}
                                <td className="border border-border p-1 text-center sticky right-0 z-20 bg-indigo-100">
                                  {(() => {
                                    const kValues = production.map(d => calculateK(d.date).k)
                                    const avg = kValues.reduce((s, v) => s + v, 0) / (kValues.length || 1)
                                    const kColor = avg > 0.1 ? "text-green-700" : avg < -0.1 ? "text-red-700" : "text-slate-500"
                                    return <span className={`text-[10px] font-bold ${kColor}`}>{avg > 0 ? "+" : ""}{avg.toFixed(2)}</span>
                                  })()}
                                </td>
                              </tr>
                            )
                          }

                          // Normal daily param row
                          return (
                            <tr key={row.key} className={`hover:bg-accent/30 ${row.readOnly ? "bg-muted/30" : ""}`}>
                              <td className={`border border-border p-2 sticky left-0 z-20 text-foreground min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)] ${row.readOnly ? "bg-muted" : (row as any).isVariable ? ((row as any).autoSourced ? "bg-emerald-50/40" : "bg-amber-50/40") : "bg-white"} ${row.indent ? "pl-8" : ""}`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <ParamLabel label={row.label} description={row.description} />
                                    {(row as any).isVariable && (
                                      <VariableSourceBadge autoSourced={!!(row as any).autoSourced} />
                                    )}
                                    {row.unit && row.unit !== "/10" && row.unit !== "gg" && (row.key.startsWith("room_type_adj_") || row.key.startsWith("rate_adj_") || row.key.startsWith("occ_adj_") || row.key.startsWith("increment_band_")) ? (
                                      (() => {
                                        const currentUnit = getAlgoParam(`unit_${row.key}`, production[0]?.date || "") || adjustmentUnit
                                        const isPercent = currentUnit === "%"
                                        return (
                                          <button
                                            onClick={() => {
                                              const newUnit = isPercent ? "EUR" : "%"
                                              const fromUnit = currentUnit
                                              // Se la riga ha gia' valori
                                              // configurati su almeno un
                                              // giorno, chiediamo conferma:
                                              // cambiare unita' mantiene i
                                              // numeri ma ne cambia il
                                              // significato (es. "10" da
                                              // +10 EUR diventa +10%).
                                              const configuredDays = production.reduce((acc, day) => {
                                                const v = getAlgoParam(row.key, day.date)
                                                return v !== "" && v !== null && v !== undefined ? acc + 1 : acc
                                              }, 0)
                                              if (configuredDays > 0) {
                                                setPendingUnitToggle({
                                                  paramKey: row.key,
                                                  label: row.label,
                                                  fromUnit,
                                                  toUnit: newUnit,
                                                  configuredDays,
                                                })
                                                return
                                              }
                                              // Nessun valore configurato:
                                              // posso cambiare direttamente
                                              // l'unita' senza rischio.
                                              for (const day of production) {
                                                handleAlgoParamChange(`unit_${row.key}`, day.date, newUnit)
                                              }
                                            }}
                                            className={`
                                              min-w-[44px] h-7 px-2 rounded-lg border-2 shadow-md font-bold text-xs ml-2 shrink-0 
                                              transition-all hover:scale-105 hover:shadow-lg cursor-pointer
                                              ${isPercent 
                                                ? "bg-blue-600 border-blue-700 text-white hover:bg-blue-500" 
                                                : "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-500"
                                              }
                                            `}
                                            title="Clicca per cambiare unita (EUR / %)"
                                          >
                                            {isPercent ? "%" : "EUR"}
                                          </button>
                                        )
                                      })()
                                    ) : row.unit ? (
                                      <span className="text-muted-foreground/50 text-[10px] ml-1">({row.unit})</span>
                                    ) : null}
                                  </div>
                                  {!row.readOnly && (
                                    <button
                                      onClick={() => openBulkFill({ type: "param", paramKey: row.key })}
                                      className="text-[9px] text-primary hover:underline ml-2 shrink-0"
                                      title="Compila intervallo date"
                                    >
                                      Compila
                                    </button>
                                  )}
                                </div>
                              </td>
                              {production.map((day) => {
                                const paramVal = getAlgoParam(row.key, day.date)
                                const isDragTarget = !row.readOnly && dragFill?.type === "param" && dragFill.paramKey === row.key && isInDragRange(day.date)
                                // Variable weight color: 0-3 = cool (blue), 4-6 = neutral, 7-10 = warm (orange/red)
                                const isVar = row.key.startsWith("var_")
                                const varWeight = isVar && paramVal !== "" ? Number(paramVal) : -1
                                const varBg = isVar && varWeight >= 0
                                  ? varWeight <= 2 ? "bg-sky-50" : varWeight <= 4 ? "bg-sky-100/60" : varWeight <= 6 ? "bg-amber-50" : varWeight <= 8 ? "bg-orange-100/70" : "bg-red-100/70"
                                  : ""
                                // Tooltip on "Giorni anticipo Last Minute" cells: show the exact
                                // date & time the LM window opens for that specific check-in date.
                                const lmCellTooltip = row.key === "last_minute_days" && paramVal !== "" && !isNaN(Number(paramVal))
                                  ? lastMinuteActivationLabel(day.date, Number(paramVal))
                                  : undefined
                                return (
                                  <td
                                    key={day.date}
                                    className={`border border-border p-0 relative group/paramcell ${day.isToday ? "ring-2 ring-primary ring-inset" : ""} ${row.readOnly ? "bg-muted/30" : ""} ${isDragTarget ? "bg-primary/10 ring-1 ring-primary/40" : ""} ${varBg} ${lmCellTooltip ? "cursor-help" : ""}`}
                                    onMouseEnter={() => handleDragFillEnter(day.date)}
                                    onDoubleClick={() => { if (!row.readOnly) openBulkFill({ type: "param", paramKey: row.key }, day.date, paramVal) }}
                                    title={lmCellTooltip}
                                  >
                                    {row.readOnly ? (
                                      <div className="w-full h-7 flex items-center justify-center text-xs text-muted-foreground font-medium">0</div>
                                    ) : row.key === "k_base_intensity" ? (
                                      // Menù a tendina dei LIVELLI STANDARD (preset) per il canale
                                      // "prezzo base" dell'Intensificatore K. Cella vuota = "Eredita"
                                      // (usa il valore di periodo/default del dialog). Il valore
                                      // memorizzato resta la base_intensity numerica: la tendina è
                                      // solo lo strato di selezione. Drag-fill/Compila continuano a
                                      // funzionare perché scrivono la stessa chiave/valore.
                                      <>
                                        <select
                                          value={(() => {
                                            if (paramVal === "" || isNaN(Number(paramVal))) return ""
                                            const match = K_INTENSITY_PRESETS.find(
                                              (p) => Math.abs(p.base_intensity - Number(paramVal)) < 1e-6,
                                            )
                                            return match ? String(match.base_intensity) : String(Number(paramVal))
                                          })()}
                                          onChange={(e) => handleAlgoParamChange(row.key, day.date, e.target.value)}
                                          className="w-full h-7 text-center text-[11px] bg-transparent border-0 outline-none focus:bg-primary/5 focus:ring-1 focus:ring-primary/30 cursor-pointer appearance-none"
                                          title="Livello Intensificatore K (prezzo base) per questo giorno"
                                        >
                                          <option value="">— eredita</option>
                                          {K_INTENSITY_PRESETS.map((p) => (
                                            <option key={p.id} value={String(p.base_intensity)}>
                                              {p.label} ({Math.round(p.base_intensity * 100)}%)
                                            </option>
                                          ))}
                                        </select>
                                        {paramVal !== "" && (
                                          <div
                                            className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-black cursor-crosshair z-10"
                                            onMouseDown={(e) => handleDragFillStart(e, "param", paramVal, day.date, { paramKey: row.key })}
                                          />
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <input
                                          type="number"
                                          step={row.key.startsWith("var_") ? "1" : "0.01"}
                                          min={row.key.startsWith("var_") ? "0" : undefined}
                                          max={row.key.startsWith("var_") ? "10" : undefined}
                                          value={paramVal}
                                          onChange={(e) => {
                                            let val = e.target.value
                                            if (row.key.startsWith("var_") && val !== "") {
                                              const n = Number(val)
                                              if (n < 0) val = "0"
                                              if (n > 10) val = "10"
                                            }
                                            handleAlgoParamChange(row.key, day.date, val)
                                          }}
                                          className="w-full h-7 text-center text-xs bg-transparent border-0 outline-none focus:bg-primary/5 focus:ring-1 focus:ring-primary/30"
                                          placeholder={row.key.startsWith("var_") ? "5" : "-"}
                                        />
                                        {paramVal !== "" && (
                                          <div
                                            className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-black cursor-crosshair z-10"
                                            onMouseDown={(e) => handleDragFillStart(e, "param", paramVal, day.date, { paramKey: row.key })}
                                          />
                                        )}
                                      </>
                                    )}
                                  </td>
                                )
                              })}
                              {(() => {
                                if (row.readOnly) {
                                  return <td className="border border-border p-1 text-center text-[10px] font-medium sticky right-0 z-10 bg-slate-100 text-muted-foreground">0</td>
                                }
                                const vals = production.map((d) => getAlgoParam(row.key, d.date)).filter((v) => v !== "").map(Number).filter((v) => !isNaN(v))
                                const avg = vals.length > 0 ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : "-"
                                return <td className="border border-border p-1 text-center text-[10px] font-medium sticky right-0 z-10 bg-slate-100 text-muted-foreground">{avg}</td>
                              })()}
                            </tr>
                          )
                        })
                      })()}

                      {/* Empty bands message - mostrato sia in basic che in K-Driven (entrambi usano le bande) */}
                      {bandGroups.length === 0 && occupancyBands.length === 0 && (
                        <tr>
                          <td colSpan={production.length + 2} className="border border-border p-3 text-center text-muted-foreground italic text-[11px]">
                            Nessuna fascia di occupazione configurata.{" "}
                            <Link href="/settings/occupancy-bands" className="text-primary hover:underline font-medium not-italic">
                              Configura le fasce nelle impostazioni
                            </Link>
                          </td>
                        </tr>
                      )}


                    </tbody>
                  </table>
                </CalendarScrollContainer>
              </CardContent>
            </Card>
          )}

          {/* Bottom autosave indicator bar */}
          {(autoSaveStatus === "pending" || autoSaveStatus === "saving") && !loading && (
            <div className="sticky bottom-4 flex justify-end">
              <div className="flex items-center gap-2 bg-white/95 backdrop-blur-sm border border-border rounded-lg px-4 py-2 shadow-lg">
                {autoSaveStatus === "pending" && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-xs text-muted-foreground">Modifiche in attesa...</span>
                  </>
                )}
                {autoSaveStatus === "saving" && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Salvataggio automatico...</span>
                  </>
                )}
                <Button onClick={handleSaveAll} disabled={saving} size="sm" variant="outline" className="gap-1.5 h-7 text-xs ml-2">
                  <Save className="h-3 w-3" /> Salva ora
                </Button>
              </div>
            </div>
          )}

        </div>

        <Dialog open={bulkFillOpen} onOpenChange={setBulkFillOpen}>
        {/* Bulk fill dialog */}
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Compila intervallo date</DialogTitle>
            <DialogDescription>
              {bulkFillContext?.type === "price"
                ? `Inserisci il prezzo da applicare all'intervallo selezionato`
                : `Inserisci il valore da applicare all'intervallo selezionato`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bulk-start">Data inizio</Label>
                <Input
                  id="bulk-start"
                  type="date"
                  value={bulkFillStartDate}
                  onChange={(e) => setBulkFillStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-end">Data fine</Label>
                <Input
                  id="bulk-end"
                  type="date"
                  value={bulkFillEndDate}
                  onChange={(e) => setBulkFillEndDate(e.target.value)}
                />
              </div>
            </div>
            {/* Weekday filter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Giorni della settimana</Label>
                <button
                  type="button"
                  onClick={() => {
                    if (bulkFillDays.size === 7) setBulkFillDays(new Set())
                    else setBulkFillDays(new Set([0, 1, 2, 3, 4, 5, 6]))
                  }}
                  className="text-[10px] text-primary hover:underline"
                >
                  {bulkFillDays.size === 7 ? "Deseleziona tutti" : "Seleziona tutti"}
                </button>
              </div>
              <div className="flex gap-1.5">
                {[
                  { day: 1, label: "Lun" },
                  { day: 2, label: "Mar" },
                  { day: 3, label: "Mer" },
                  { day: 4, label: "Gio" },
                  { day: 5, label: "Ven" },
                  { day: 6, label: "Sab" },
                  { day: 0, label: "Dom" },
                ].map(({ day, label }) => {
                  const active = bulkFillDays.has(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setBulkFillDays((prev) => {
                          const next = new Set(prev)
                          if (next.has(day)) next.delete(day)
                          else next.add(day)
                          return next
                        })
                      }}
                      className={`flex-1 h-8 rounded-md text-xs font-medium border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-val">Valore</Label>
              {bulkFillContext?.paramKey === "band_group_id" ? (
                <select
                  id="bulk-val"
                  value={bulkFillValue}
                  onChange={(e) => setBulkFillValue(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">-- Seleziona livello domanda --</option>
                  {bandGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              ) : bulkFillContext?.paramKey === "last_minute_level_id" ? (
                <select
                  id="bulk-val"
                  value={bulkFillValue}
                  onChange={(e) => setBulkFillValue(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">-- Nessuno --</option>
                  {lastMinuteLevels.map((l) => {
                    // With the new band-based discount structure, discount varies by occupancy band
                    // Show the level name only, or a range if shared_bands are available.
                    // FIX 12/05/2026: Number(...) defensivo: PostgREST puo' serializzare
                    // NUMERIC come stringa ("20.00"). Senza cast, "0.00" > 0 viene
                    // valutato come false (ok) ma Math.min su mix di numeri/stringhe
                    // produrrebbe NaN o output sballato.
                    const bands = (l as { shared_bands?: Array<{ discount_pct: number | string }> }).shared_bands
                    const discounts = (bands ?? [])
                      .map(b => Number(b.discount_pct))
                      .filter(d => Number.isFinite(d) && d > 0)
                    const minDiscount = discounts.length > 0 ? Math.min(...discounts) : null
                    const maxDiscount = discounts.length > 0 ? Math.max(...discounts) : null
                    const discountLabel = minDiscount !== null && maxDiscount !== null
                      ? (minDiscount === maxDiscount ? `${minDiscount}%` : `${minDiscount}-${maxDiscount}%`)
                      : null
                    return (
                      <option key={l.id} value={l.id}>
                        {l.name}{discountLabel ? ` (${discountLabel})` : ""}
                      </option>
                    )
                  })}
                </select>
              ) : (
                <Input
                  id="bulk-val"
                  type="number"
                  step="0.01"
                  value={bulkFillValue}
                  onChange={(e) => setBulkFillValue(e.target.value)}
                  placeholder="Es. 120"
                  onKeyDown={(e) => e.key === "Enter" && applyBulkFill()}
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkFillOpen(false)}>Annulla</Button>
            <Button onClick={applyBulkFill} disabled={
              bulkFillDays.size === 0 || (
                bulkFillContext?.paramKey !== "band_group_id" &&
                bulkFillContext?.paramKey !== "last_minute_level_id" &&
                !bulkFillValue
              )
            }>Applica</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nota di calendario per-giorno */}
      <Dialog open={noteDialogDate !== null} onOpenChange={(o) => { if (!o) { setNoteDialogDate(null); setNoteText("") } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-indigo-500" />
              Nota del giorno
            </DialogTitle>
            <DialogDescription>
              {noteDialogDate
                ? `Aggiungi una nota per il ${format(new Date(noteDialogDate + "T00:00:00"), "EEEE d MMMM yyyy", { locale: it })}. Resta memorizzata nel calendario.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Note esistenti per il giorno */}
            {noteDialogDate && (eventsData[noteDialogDate] || []).filter(e => e.type === "note").length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Note esistenti</Label>
                {(eventsData[noteDialogDate] || []).filter(e => e.type === "note").map(ev => (
                  <div key={ev.id} className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
                    <span className="text-xs text-foreground break-words">{ev.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteEvent(ev.id)}
                      className="shrink-0 text-muted-foreground hover:text-red-500"
                      title="Elimina nota"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="note-text">Nuova nota</Label>
              <Textarea
                id="note-text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Es. Cambiato strategia: alzati i prezzi del weekend"
                rows={3}
                autoFocus
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSaveNote() }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setNoteDialogDate(null); setNoteText("") }}>Chiudi</Button>
            <Button onClick={handleSaveNote} disabled={noteSaving || !noteText.trim()} className="gap-1.5">
              {noteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
              Salva nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* INTENSIFICATORE K (30/06/2026) */}
      {hotelId && (
        <KIntensityDialog
          open={kIntensityOpen}
          onOpenChange={setKIntensityOpen}
          hotelId={hotelId}
          rules={kIntensityRules}
          onSaved={(rules) => setKIntensityRules(rules)}
        />
      )}
      </main>
    </div>
  )
}
