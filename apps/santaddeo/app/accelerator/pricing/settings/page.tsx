"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Switch } from "@/components/ui/switch"
import { ChevronLeft, Save, Loader2, Users, Info, Star, Lock, Cloud, Plus, Trash2, BarChart3, Pencil, Cpu, AlertTriangle, CheckCircle2, ExternalLink, Database, Wand2, CalendarRange, ChevronDown, ChevronUp } from "lucide-react"
import { AlgorithmExplanationDialog } from "@/components/accelerator/algorithm-explanation-dialog"
import { KVariableWeightOverrides } from "@/components/accelerator/k-variable-weight-overrides"
import Link from "next/link"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from "date-fns"

// ------- Types -------

interface RoomType {
  id: string
  name: string
  code: string
  capacity: number
  capacity_default: number
  additional_beds: number
  total_rooms: number
  is_active: boolean
}

interface Rate {
  id: string
  name: string
  code: string
  is_active: boolean
}

interface PricingVariable {
  id: string
  variable_key: string
  label: string
  description: string | null
  category: string
  default_weight: number
  is_active: boolean
  is_locked?: boolean
  sort_order: number
}

// Status per-variabile restituito da GET /api/accelerator/k-variables-status.
// Vedi `app/api/accelerator/k-variables-status/route.ts` per la spec completa.
interface KVariableStatusItem {
  variable_key: string
  status:
    | "ok"
    | "setup_missing"
    | "data_stale"
    | "not_integrated"
    | "manual"
    | "auto_internal"
    | "custom"
  source_kind: string
  datasource_label: string
  setup_link: string | null
  setup_cta: string | null
  last_data_at: string | null
  days_since_last_data: number | null
  can_activate: boolean
  message: string
  help_text: string
  is_alert: boolean
}

interface KVariableStatusResponse {
  hotel_id: string
  generated_at: string
  by_key: Record<string, KVariableStatusItem>
  alerts: Array<{
    variable_key: string
    message: string
    days_since_last_data: number | null
    setup_link: string | null
    setup_cta: string | null
  }>
}

// ------- Simple hash (not crypto, just accidental-change protection) -------
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return String(hash)
}

// ------- Component -------

export default function AcceleratorPricingSettingsPage() {
  const [hotelId, setHotelId] = useState<string | null>(null)
  // 13/05/2026: tiene traccia di quale K variabile ha l'editor di override
  // di importanza per periodo espanso. Null = tutti chiusi.
  const [expandedOverrideKVarId, setExpandedOverrideKVarId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [rates, setRates] = useState<Rate[]>([])

  // Base algo settings
  const [referenceRoomTypeId, setReferenceRoomTypeId] = useState<string>("")
  const [referenceRateId, setReferenceRateId] = useState<string>("")
  const [adjustmentUnit, setAdjustmentUnit] = useState<"%" | "EUR">("%")
  const [baseOccupancy, setBaseOccupancy] = useState<number>(2)
  // Algorithm type: "basic" = occupancy-driven, "advanced" = K coefficient (matches DB CHECK constraint)
  const [algorithmType, setAlgorithmType] = useState<"basic" | "advanced">("basic")
  // Occupancy thresholds (in number of rooms)
  const [occThresholdLow, setOccThresholdLow] = useState<number>(0) // <= this = BASSA
  const [occThresholdHigh, setOccThresholdHigh] = useState<number>(0) // >= this = ALTA
  
  // Password protection
  const [baseSettingsLocked, setBaseSettingsLocked] = useState(false)
  const [refPasswordDialogOpen, setRefPasswordDialogOpen] = useState(false)
  const [refPasswordMode, setRefPasswordMode] = useState<"set" | "verify">("set")
  const [refPasswordInput, setRefPasswordInput] = useState("")
  const [refPasswordConfirm, setRefPasswordConfirm] = useState("")
  const [refPasswordError, setRefPasswordError] = useState("")
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [refPasswordHash, setRefPasswordHash] = useState<string>("")
  const [resetPasswordSending, setResetPasswordSending] = useState(false)
  const [resetPasswordSent, setResetPasswordSent] = useState(false)

  // All algo params (to preserve when saving)
  const [algoParams, setAlgoParams] = useState<Record<string, Record<string, string>>>({})

  // K variables (pressure variables for K coefficient)
  const [kVariables, setKVariables] = useState<PricingVariable[]>([])
  const [kVarDialogOpen, setKVarDialogOpen] = useState(false)
  const [kVarEditing, setKVarEditing] = useState<PricingVariable | null>(null)
  const [kVarForm, setKVarForm] = useState({ label: "", description: "", category: "demand", default_weight: 5 })
  const [kVarSaving, setKVarSaving] = useState(false)
  // FASE 8 (13/05/2026): stato per-variabile recuperato da
  // /api/accelerator/k-variables-status. Mappa variable_key -> KVariableStatusItem.
  // Usato per: colore riga, badge fonte, switch disabilitato, banner CTA,
  // banner alert globale (variabili stale -> bloccate su neutro=5).
  const [kVarStatus, setKVarStatus] = useState<Record<string, KVariableStatusItem>>({})
  const [kVarAlerts, setKVarAlerts] = useState<KVariableStatusResponse["alerts"]>([])
  const [kVarStatusLoading, setKVarStatusLoading] = useState(false)



  // ------- Auth -------

  useEffect(() => {
    loadUserHotel()
    // Load K variables immediately (they are global, not hotel-specific)
    loadKVariables()
  }, [])
  
  async function loadKVariables() {
    try {
      const varsRes = await fetch("/api/settings/pricing-variables?all=1")
      const varsData = await varsRes.json()
      console.log("[v0] K variables loaded on mount:", varsRes.ok, varsData.variables?.length)
      if (varsRes.ok && varsData.variables) {
        setKVariables(varsData.variables)
      }
    } catch (err) { 
      console.error("[v0] K variables load error:", err) 
    }
  }

  // FASE 8 - fetch dello stato fonti/freshness per ciascuna K variabile.
  // Chiamata: a hotelId disponibile + dopo loadData() + dopo ogni toggle/edit
  // per riflettere subito i cambi (es. se l'utente attiva una variabile OTA
  // senza aver caricato report, deve vedere banner e CTA).
  async function loadKVariableStatus(hid: string) {
    setKVarStatusLoading(true)
    try {
      const res = await fetch(`/api/accelerator/k-variables-status?hotel_id=${hid}`)
      if (!res.ok) {
        console.warn("[v0] k-variables-status fetch non-ok:", res.status)
        return
      }
      const data = (await res.json()) as KVariableStatusResponse
      setKVarStatus(data.by_key || {})
      setKVarAlerts(data.alerts || [])
    } catch (err) {
      console.error("[v0] k-variables-status fetch error:", err)
    } finally {
      setKVarStatusLoading(false)
    }
  }

  useEffect(() => {
    if (hotelId) {
      loadData()
      loadKVariableStatus(hotelId)
    }
  }, [hotelId])

  async function loadUserHotel() {
    try {
      // Fetch user auth data using /api/auth/me (server-side auth endpoint)
      const meRes = await fetch("/api/auth/me")
      const meData = await meRes.json()
      
      // Settings page is accessible to super_admin, system_admin, property_admin and villa_admin
      const allowedRoles = ["super_admin", "system_admin", "property_admin", "villa_admin"]
      const userRole = meData.role
      
      // Also allow if is_superadmin flag is true
      if (!userRole || (!allowedRoles.includes(userRole) && !meData.is_superadmin)) {
        setUnauthorized(true)
        setLoading(false)
        return
      }
      setIsSuperAdmin(meData.is_superadmin || meData.role === "super_admin" || false)

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

    const now = new Date()
    const monthStart = format(startOfMonth(now), "yyyy-MM-dd")
    const monthEnd = format(endOfMonth(now), "yyyy-MM-dd")

    try {
      const params = new URLSearchParams({ hotel_id: hotelId, month_start: monthStart, month_end: monthEnd })
      const gridRes = await fetch(`/api/accelerator/pricing-grid?${params}`)
      if (!gridRes.ok) {
        if (gridRes.status === 401) { window.location.href = "/auth/login"; return }
        throw new Error(`Errore ${gridRes.status}`)
      }
      const gridData = await gridRes.json()
      setRoomTypes(gridData.roomTypes || [])
      setRates(gridData.rates || [])
      setAlgoParams(gridData.algoParams || {})

      // Restore reference room type
      const savedRefRt = gridData.algoParams?.["reference_room_type_id"]
      const refRtId = savedRefRt ? Object.values(savedRefRt)[0] : null
      setReferenceRoomTypeId((refRtId as string) || gridData.roomTypes?.[0]?.id || "")

      // Restore reference rate
      const savedRefRate = gridData.algoParams?.["reference_rate_id"]
      const refRateId = savedRefRate ? Object.values(savedRefRate)[0] : null
      setReferenceRateId((refRateId as string) || gridData.rates?.[0]?.id || "")

      // Restore adjustment unit
      const savedUnit = gridData.algoParams?.["adjustment_unit"]
      if (savedUnit) {
        const unitVal = Object.values(savedUnit)[0] as string
        if (unitVal === "%" || unitVal === "EUR") setAdjustmentUnit(unitVal)
      }

      // Restore base occupancy
      const savedBaseOcc = gridData.algoParams?.["base_occupancy"]
      if (savedBaseOcc) {
        const occVal = Number(Object.values(savedBaseOcc)[0])
        if (occVal >= 1 && occVal <= 6) setBaseOccupancy(occVal)
      }
      // Load occupancy thresholds
      const savedLow = gridData.algoParams?.["occ_threshold_low"]
      if (savedLow) setOccThresholdLow(Number(Object.values(savedLow)[0]) || 0)
      const savedHigh = gridData.algoParams?.["occ_threshold_high"]
      if (savedHigh) setOccThresholdHigh(Number(Object.values(savedHigh)[0]) || 0)

      // Load algorithm type from accelerator subscription
      try {
        const subRes = await fetch(`/api/accelerator/subscription?hotel_id=${hotelId}`)
        if (subRes.ok) {
          const subData = await subRes.json()
          // API returns { subscriptions: [...] } (array)
          const sub = subData.subscriptions?.[0] || subData.subscription
          console.log("[v0] Subscription data - algorithm_type:", sub?.algorithm_type)
          if (sub?.algorithm_type) {
            const newType = sub.algorithm_type === "advanced" ? "advanced" : "basic"
            console.log("[v0] Setting algorithmType to:", newType)
            setAlgorithmType(newType)
          }
        }
      } catch (e) { console.log("[v0] Subscription fetch error:", e) }

      // Load K variables (all, including inactive, for settings management)
      try {
        const varsRes = await fetch("/api/settings/pricing-variables?all=1")
        const varsData = await varsRes.json()
        console.log("[v0] K variables response:", varsRes.ok, varsData)
        if (varsRes.ok && varsData.variables) {
          console.log("[v0] Setting K variables:", varsData.variables.length, "variables")
          setKVariables(varsData.variables)
        } else {
          console.log("[v0] K variables fetch failed or no variables:", varsRes.status, varsData)
        }
      } catch (err) { console.error("[v0] K variables fetch error:", err) }

      // Restore password hash from dedicated endpoint (date-independent)
      const pwdRes = await fetch(`/api/accelerator/settings-password?hotel_id=${hotelId}`)
      if (pwdRes.ok) {
        const pwdData = await pwdRes.json()
        if (pwdData.hash) {
          setRefPasswordHash(pwdData.hash)
          setBaseSettingsLocked(true)
        }
      }

    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  // ------- Password logic -------

  function requestChange(changeFn: () => void) {
    console.log("[v0] requestChange called - baseSettingsLocked:", baseSettingsLocked, "refPasswordHash:", !!refPasswordHash)
    if (baseSettingsLocked && refPasswordHash) {
      console.log("[v0] requestChange - opening password dialog")
      setPendingAction(() => changeFn)
      setRefPasswordMode("verify")
      setRefPasswordInput("")
      setRefPasswordConfirm("")
      setRefPasswordError("")
      setRefPasswordDialogOpen(true)
      return
    }
    console.log("[v0] requestChange - executing changeFn directly")
    changeFn()
  }

  function handleRefPasswordSubmit() {
    if (refPasswordMode === "set") {
      if (!refPasswordInput || refPasswordInput.length < 4) {
        setRefPasswordError("La password deve essere di almeno 4 caratteri")
        return
      }
      if (refPasswordInput !== refPasswordConfirm) {
        setRefPasswordError("Le password non corrispondono")
        return
      }
      const hash = simpleHash(refPasswordInput)
      setRefPasswordHash(hash)
      setBaseSettingsLocked(true)
      setRefPasswordDialogOpen(false)
    } else {
      const inputHash = simpleHash(refPasswordInput)
      console.log("[v0] handleRefPasswordSubmit - verifying password")
      if (inputHash !== refPasswordHash) {
        console.log("[v0] handleRefPasswordSubmit - wrong password")
        setRefPasswordError("Password errata.")
        return
      }
      console.log("[v0] handleRefPasswordSubmit - password correct, executing pendingAction:", !!pendingAction)
      if (pendingAction) pendingAction()
      setRefPasswordDialogOpen(false)
    }
  }

  // ------- Password reset request -------
  
  async function handleRequestPasswordReset() {
    if (!hotelId) return
    setResetPasswordSending(true)
    setRefPasswordError("")
    
    try {
      const res = await fetch("/api/accelerator/settings-password/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId }),
      })
      
      if (res.ok) {
        setResetPasswordSent(true)
      } else {
        const data = await res.json()
        setRefPasswordError(data.error || "Errore nell'invio della richiesta")
      }
    } catch {
      setRefPasswordError("Errore di connessione")
    } finally {
      setResetPasswordSending(false)
    }
  }
  
  // ------- Save -------
  
  async function handleSave() {
    console.log("[v0] handleSave called - hotelId:", hotelId, "algorithmType:", algorithmType)
    if (!hotelId) {
      console.log("[v0] handleSave aborted - no hotelId")
      return
    }
    setSaving(true)
    setSaved(false)
    
    try {
      // Build date range for this month (algo params are stored per-day)
      const now = new Date()
      const days = eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) })
      const dateKeys = days.map((d) => format(d, "yyyy-MM-dd"))
      console.log("[v0] handleSave - dateKeys count:", dateKeys.length)

      const paramsToSave = { ...algoParams }

      // Reference room type
      const rtMap: Record<string, string> = {}
      for (const dk of dateKeys) rtMap[dk] = referenceRoomTypeId
      paramsToSave["reference_room_type_id"] = rtMap

      // Reference rate
      const rateMap: Record<string, string> = {}
      for (const dk of dateKeys) rateMap[dk] = referenceRateId
      paramsToSave["reference_rate_id"] = rateMap

      // Adjustment unit
      const unitMap: Record<string, string> = {}
      for (const dk of dateKeys) unitMap[dk] = adjustmentUnit
      paramsToSave["adjustment_unit"] = unitMap

      // Base occupancy
      const occMap: Record<string, string> = {}
      for (const dk of dateKeys) occMap[dk] = String(baseOccupancy)
      paramsToSave["base_occupancy"] = occMap
      
      // Occupancy thresholds (rooms)
      const lowMap: Record<string, string> = {}
      for (const dk of dateKeys) lowMap[dk] = String(occThresholdLow)
      paramsToSave["occ_threshold_low"] = lowMap
      const highMap: Record<string, string> = {}
      for (const dk of dateKeys) highMap[dk] = String(occThresholdHigh)
      paramsToSave["occ_threshold_high"] = highMap

      // Algorithm type: save to accelerator_subscriptions
      console.log("[v0] Saving algorithm_type:", algorithmType, "to hotel:", hotelId)
      const algoRes = await fetch("/api/accelerator/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, algorithm_type: algorithmType }),
      })
      const algoResult = await algoRes.json()
      console.log("[v0] Algorithm save result:", algoRes.status, algoResult)
      
      // Also save algo-params
      console.log("[v0] Saving algo-params - referenceRoomTypeId:", referenceRoomTypeId, "referenceRateId:", referenceRateId, "baseOccupancy:", baseOccupancy)

      // Password hash: save via dedicated endpoint (date-independent)
      await fetch("/api/accelerator/settings-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, hash: refPasswordHash || null }),
      })

      // Convert paramsToSave object to array format: { param_key, date, value }[]
      const paramsArray: { param_key: string; date: string; value: string }[] = []
      for (const [paramKey, dateMap] of Object.entries(paramsToSave)) {
        for (const [date, value] of Object.entries(dateMap as Record<string, string>)) {
          paramsArray.push({ param_key: paramKey, date, value: String(value) })
        }
      }
      console.log("[v0] Sending params array with", paramsArray.length, "entries")
      
      await fetch("/api/accelerator/pricing-params", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          params: paramsArray,
          occupancy_bands: [],
        }),
      })

      // Reload algorithm type from server to confirm it persisted
      try {
        const reloadRes = await fetch(`/api/accelerator/subscription?hotel_id=${hotelId}`)
        if (reloadRes.ok) {
          const reloadData = await reloadRes.json()
          const reloadedSub = reloadData.subscriptions?.[0] || reloadData.subscription
          console.log("[v0] Reloaded algorithm_type after save:", reloadedSub?.algorithm_type)
          if (reloadedSub?.algorithm_type) {
            setAlgorithmType(reloadedSub.algorithm_type === "advanced" ? "advanced" : "basic")
          }
        }
      } catch { /* ignore */ }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error("Error saving:", error)
    } finally {
      setSaving(false)
    }
  }

  // ------- K variables CRUD -------

  function openAddKVar() {
    setKVarEditing(null)
    setKVarForm({ label: "", description: "", category: "demand", default_weight: 5 })
    setKVarDialogOpen(true)
  }

  function openEditKVar(v: PricingVariable) {
    setKVarEditing(v)
    setKVarForm({ label: v.label, description: v.description || "", category: v.category, default_weight: v.default_weight })
    setKVarDialogOpen(true)
  }

  async function handleSaveKVar() {
    if (!kVarForm.label.trim()) return
    setKVarSaving(true)
    try {
      if (kVarEditing) {
        // Update existing
        const res = await fetch(`/api/settings/pricing-variables`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: kVarEditing.id,
            label: kVarForm.label.trim(),
            description: kVarForm.description.trim() || null,
            category: kVarForm.category,
            default_weight: kVarForm.default_weight,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          setKVariables(prev => prev.map(v => v.id === kVarEditing.id ? { ...v, ...data.variable } : v))
        }
      } else {
        // Create new
        const variableKey = `var_${kVarForm.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`
        const res = await fetch("/api/settings/pricing-variables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            variable_key: variableKey,
            label: kVarForm.label.trim(),
            description: kVarForm.description.trim() || null,
            category: kVarForm.category,
            data_type: "numeric",
            default_weight: kVarForm.default_weight,
            is_active: true,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          setKVariables(prev => [...prev, data.variable])
        }
      }
      setKVarDialogOpen(false)
    } catch (error) {
      console.error("Error saving K variable:", error)
    } finally {
      setKVarSaving(false)
    }
  }

  async function handleToggleKVar(v: PricingVariable) {
    try {
      const res = await fetch(`/api/settings/pricing-variables/${v.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !v.is_active }),
      })
      if (res.ok) {
        setKVariables(prev => prev.map(pv => pv.id === v.id ? { ...pv, is_active: !pv.is_active } : pv))
        console.log("[v0] Toggled K variable:", v.id, "to is_active:", !v.is_active)
        // Refresh status: cambia attivazione -> cambia anche il banner alert
        // (le variabili stale sono alert SOLO se attive).
        if (hotelId) loadKVariableStatus(hotelId)
      } else {
        const err = await res.json().catch(() => ({}))
        console.error("[v0] Toggle failed:", err)
      }
    } catch (error) {
      console.error("[v0] Error toggling K variable:", error)
    }
  }

  async function handleDeleteKVar(v: PricingVariable) {
    if (!confirm(`Eliminare la variabile "${v.label}"? I dati di pesatura giornaliera andranno persi.`)) return
    try {
      const res = await fetch(`/api/settings/pricing-variables?id=${v.id}`, { method: "DELETE" })
      if (res.ok) {
        setKVariables(prev => prev.filter(pv => pv.id !== v.id))
        console.log("[v0] Deleted K variable:", v.id)
      }
    } catch (error) {
      console.error("[v0] Error deleting K variable:", error)
    }
  }

  const categoryLabels: Record<string, string> = {
    demand: "Domanda",
    supply: "Offerta",
    market: "Mercato",
    general: "Generale",
    other: "Altro",
  }

  // ------- Helpers -------

  const occNames: Record<number, string> = {
    1: "Singola", 2: "Doppia", 3: "Tripla", 4: "Quadrupla", 5: "Quintupla", 6: "Sestupla",
  }

  const refRoomTypeName = roomTypes.find((rt) => rt.id === referenceRoomTypeId)?.name || "-"
  const refRateName = rates.find((r) => r.id === referenceRateId)?.name || "-"
  const baseOccName = occNames[baseOccupancy] || `${baseOccupancy} pax`

  // ------- Render -------

  if (unauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">Accesso non autorizzato</h2>
          <p className="text-muted-foreground mt-2">Solo i SuperAdmin possono accedere a questa pagina.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/accelerator/pricing" className="hover:text-foreground transition-colors flex items-center gap-1">
              <ChevronLeft className="h-3.5 w-3.5" />
              Tabella Prezzi
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Impostazioni Algoritmo</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurazione Base Algoritmo</h1>
          <p className="text-sm text-muted-foreground mt-1">{hotelName}</p>
        </div>
        {/* Pulsante "Come funziona?" (02/05/2026): apre il dialog con la
            spiegazione completa di entrambi gli algoritmi. Posizionato in
            alto a destra dell'header per essere sempre visibile mentre
            l'utente configura i parametri. */}
        <AlgorithmExplanationDialog
          currentAlgorithm={algorithmType}
          triggerVariant="outline"
          triggerLabel="Come funziona?"
        />
      </div>

      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Caricamento...</span>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Explanation */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 shrink-0">
                    <Cpu className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground text-sm">Cella di riferimento dell'algoritmo</h2>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Questi tre parametri insieme (tipologia + piano tariffario + occupazione) definiscono la cella su cui l'algoritmo calcola il prezzo base. Tutti gli altri prezzi nella tabella sono derivati da questa combinazione.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Algorithm type selector */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-indigo-50 shrink-0">
                    <BarChart3 className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground text-sm">Tipo di algoritmo</h2>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Scegli il motore di calcolo dei prezzi per questa struttura.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* BASIC Algorithm Box with HoverCard */}
                  <HoverCard openDelay={200} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <button
                        type="button"
                        onClick={() => { console.log("[v0] Basic clicked, setting algorithmType to basic"); setAlgorithmType("basic") }}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                          algorithmType === "basic"
                            ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-200"
                            : "border-border hover:border-blue-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Cpu className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-semibold text-foreground">Base (Occupazione)</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Fasce occupazionali con incrementi fissi. Passa il mouse per i dettagli.
                        </p>
                        {algorithmType === "basic" && <Badge className="mt-2 text-[10px]" variant="default">Attivo</Badge>}
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent side="bottom" align="start" className="w-[420px] p-0">
                      <div className="p-4 border-b bg-blue-50/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Cpu className="h-5 w-5 text-blue-600" />
                          <h3 className="font-bold text-foreground">Algoritmo BASE</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">Incrementi per fasce di occupazione</p>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Come funziona</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Il prezzo parte dalla <strong>tariffa base</strong> e aumenta di un <strong>incremento fisso</strong> (% o EUR) 
                            al superamento di ciascuna soglia di occupazione definita. Semplice e prevedibile.
                          </p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Formula</h4>
                          <div className="bg-slate-100 rounded p-2 font-mono text-xs">
                            Prezzo = Base + (Fascia × Incremento)
                          </div>
                        </div>
                        {/* Mini chart simulation */}
                        <div>
                          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Simulazione (6 camere, base 80, +5/fascia)</h4>
                          <div className="flex items-end gap-1 h-16">
                            {[80, 80, 85, 85, 90, 95].map((price, i) => (
                              <div key={i} className="flex-1 flex flex-col items-center">
                                <div 
                                  className="w-full bg-blue-500 rounded-t" 
                                  style={{ height: `${(price / 100) * 60}px` }}
                                />
                                <span className="text-[9px] text-muted-foreground mt-1">{price}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                            <span>Camera 1</span>
                            <span>Camera 6</span>
                          </div>
                        </div>
                        <div className="pt-2 border-t">
                          <p className="text-[10px] text-muted-foreground">
                            <strong>Ideale per:</strong> strutture stagionali, B&B, piccoli hotel con domanda prevedibile.
                          </p>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>

                  {/* K-DRIVEN Algorithm Box with HoverCard */}
                  <HoverCard openDelay={200} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <button
                        type="button"
                        onClick={() => { console.log("[v0] K-driven clicked, setting algorithmType to advanced"); setAlgorithmType("advanced") }}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                          algorithmType === "advanced"
                            ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-200"
                            : "border-border hover:border-indigo-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <BarChart3 className="h-4 w-4 text-indigo-600" />
                          <span className="text-sm font-semibold text-foreground">K-Driven (Avanzato)</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Curva esponenziale con coefficiente K. Passa il mouse per i dettagli.
                        </p>
                        {algorithmType === "advanced" && <Badge className="mt-2 text-[10px] bg-indigo-600">Attivo</Badge>}
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent side="bottom" align="end" className="w-[450px] p-0">
                      <div className="p-4 border-b bg-indigo-50/50">
                        <div className="flex items-center gap-2 mb-1">
                          <BarChart3 className="h-5 w-5 text-indigo-600" />
                          <h3 className="font-bold text-foreground">Algoritmo K-DRIVEN</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">Curva esponenziale basata sulla domanda</p>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Come funziona</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Il prezzo segue una <strong>curva esponenziale</strong> determinata dal coefficiente <strong>K</strong> (0-10).
                            K riflette la pressione della domanda: piu alto K, piu la curva parte alta. 
                            La base di crescita <strong>A</strong> (2-10) determina quanto rapidamente il prezzo sale verso PMAX.
                          </p>
                        </div>
                        {/* Mini chart simulation - exponential curve */}
                        <div>
                          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Simulazione (N=6, K=2, PMIN=50, PMAX=200, A=2)</h4>
                          <div className="flex items-end gap-1 h-20">
                            {[80, 84, 92, 107, 138, 200].map((price, i) => (
                              <div key={i} className="flex-1 flex flex-col items-center">
                                <div 
                                  className="w-full bg-indigo-500 rounded-t" 
                                  style={{ height: `${(price / 200) * 70}px` }}
                                />
                                <span className="text-[9px] text-muted-foreground mt-1">{price}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                            <span>Camera 1 (PI)</span>
                            <span>Camera 6 (PMAX)</span>
                          </div>
                        </div>
                        <div className="pt-2 border-t space-y-2">
                          <div>
                            <h4 className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider">Last Minute</h4>
                            <p className="text-[10px] text-muted-foreground">
                              Se a ridosso della data ci sono ancora camere invendute, il sistema puo <strong>abbassare K</strong> 
                              per rendere i prezzi piu competitivi. La correzione e coperta dalle <strong>politiche di cancellazione</strong>: 
                              chi ha prenotato prima a prezzo piu alto non puo cancellare gratuitamente.
                            </p>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            <strong>Ideale per:</strong> hotel urbani, strutture con eventi, domanda variabile e multicanale.
                          </p>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </div>
              </CardContent>
            </Card>

            {/* Current summary */}
            <Card className="border-blue-200 bg-blue-50/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground text-sm">Impostazioni attuali</h3>
                  {baseSettingsLocked && (
                    <Badge variant="outline" className="text-[10px] bg-amber-100 border-amber-300 text-amber-700">
                      <Lock className="h-2.5 w-2.5 mr-1" /> Protetto da password
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-border">
                    <Star className="h-4 w-4 text-amber-500 shrink-0" />
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tipologia</div>
                      <div className="text-sm font-semibold text-foreground">{refRoomTypeName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-border">
                    <Cpu className="h-4 w-4 text-blue-500 shrink-0" />
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Piano tariffario</div>
                      <div className="text-sm font-semibold text-foreground">{refRateName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-border">
                    <Users className="h-4 w-4 text-violet-500 shrink-0" />
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Occupazione base</div>
                      <div className="text-sm font-semibold text-foreground">{baseOccName} ({baseOccupancy} pax)</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-border">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Unita aggiustamenti</div>
                      <div className="text-sm font-semibold text-foreground">{adjustmentUnit === "%" ? "Percentuale (%)" : "Euro (EUR)"}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Edit form */}
            <Card>
              <CardContent className="p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground text-sm">Modifica impostazioni</h3>
                  {baseSettingsLocked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => {
                        setPendingAction(() => () => setBaseSettingsLocked(false))
                        setRefPasswordMode("verify")
                        setRefPasswordInput("")
                        setRefPasswordError("")
                        setRefPasswordDialogOpen(true)
                      }}
                    >
                      <Lock className="h-3 w-3" /> Sblocca per modificare
                    </Button>
                  )}
                </div>

                {/* Reference room type */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Star className="h-3 w-3 text-amber-500" />
                    Tipologia di riferimento
                  </Label>
                  <Select
                    value={referenceRoomTypeId}
                    onValueChange={(v) => requestChange(() => setReferenceRoomTypeId(v))}
                    disabled={baseSettingsLocked}
                  >
                    <SelectTrigger className={`h-10 ${baseSettingsLocked ? "opacity-60 cursor-not-allowed" : ""}`}>
                      <SelectValue placeholder="Seleziona tipologia" />
                    </SelectTrigger>
                    <SelectContent>
                      {roomTypes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.id}>
                          {rt.name} ({rt.capacity || rt.capacity_default} pax max)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">La tipologia base da cui vengono calcolati gli aggiustamenti delle altre tipologie.</p>
                </div>

                {/* Reference rate */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Cpu className="h-3 w-3 text-blue-500" />
                    Piano tariffario principale
                  </Label>
                  <Select
                    value={referenceRateId}
                    onValueChange={(v) => requestChange(() => setReferenceRateId(v))}
                    disabled={baseSettingsLocked}
                  >
                    <SelectTrigger className={`h-10 ${baseSettingsLocked ? "opacity-60 cursor-not-allowed" : ""}`}>
                      <SelectValue placeholder="Seleziona piano tariffario" />
                    </SelectTrigger>
                    <SelectContent>
                      {rates.map((rate) => (
                        <SelectItem key={rate.id} value={rate.id}>{rate.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Il piano tariffario principale. Le tariffe derivate sono calcolate a partire da questa.</p>
                </div>

                {/* Base occupancy */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-violet-500" />
                    Occupazione base
                  </Label>
                  <Select
                    value={String(baseOccupancy)}
                    onValueChange={(v) => requestChange(() => setBaseOccupancy(Number(v)))}
                    disabled={baseSettingsLocked}
                  >
                    <SelectTrigger className={`h-10 ${baseSettingsLocked ? "opacity-60 cursor-not-allowed" : ""}`}>
                      <SelectValue placeholder="Occupazione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Singola (1 pax)</SelectItem>
                      <SelectItem value="2">Doppia (2 pax)</SelectItem>
                      <SelectItem value="3">Tripla (3 pax)</SelectItem>
                      <SelectItem value="4">Quadrupla (4 pax)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Il numero di persone che corrisponde al prezzo base. Le altre occupazioni sono derivate da questa.</p>
                </div>

                {/* Occupancy thresholds */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div>
                    <Label className="text-xs font-medium flex items-center gap-1.5 mb-1">
                      Soglie Occupazione Storica (camere vendute)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mb-3">
                      Definisci quante camere vendute determinano "Bassa" o "Alta" occupazione storica per la tua struttura. Queste soglie guidano la logica madre del pricing: in bassa occupazione si parte prudenti, in alta occupazione si punta ad alzare l'ADR.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-orange-700 uppercase tracking-wider">Bassa occupazione (fino a)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={999}
                            value={occThresholdLow || ""}
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0
                              requestChange(() => setOccThresholdLow(v))
                            }}
                            disabled={baseSettingsLocked}
                            className={`h-10 text-center font-semibold ${baseSettingsLocked ? "opacity-60" : ""}`}
                            placeholder="es. 18"
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">camere</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-green-700 uppercase tracking-wider">Alta occupazione (da)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={999}
                            value={occThresholdHigh || ""}
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0
                              requestChange(() => setOccThresholdHigh(v))
                            }}
                            disabled={baseSettingsLocked}
                            className={`h-10 text-center font-semibold ${baseSettingsLocked ? "opacity-60" : ""}`}
                            placeholder="es. 19"
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">camere</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Adjustment unit */}
                <div className="space-y-4">
                  <Label className="text-lg font-bold">Unita di misura aggiustamenti</Label>
                  <div className={`flex gap-4 ${baseSettingsLocked ? "opacity-60" : ""}`}>
                    <button
                      type="button"
                      onClick={() => { if (!baseSettingsLocked) { setAdjustmentUnit("%"); requestChange(() => {}); } }}
                      disabled={baseSettingsLocked}
                      className={`
                        w-40 h-28 rounded-2xl border-4 shadow-xl transition-all transform hover:scale-105 disabled:cursor-not-allowed flex flex-col items-center justify-center
                        ${adjustmentUnit === "%" 
                          ? "bg-blue-600 border-blue-700 text-white shadow-blue-300" 
                          : "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200"
                        }
                      `}
                    >
                      <span className="text-5xl font-black">%</span>
                      <span className="text-base font-semibold mt-2">Percentuale</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (!baseSettingsLocked) { setAdjustmentUnit("EUR"); requestChange(() => {}); } }}
                      disabled={baseSettingsLocked}
                      className={`
                        w-40 h-28 rounded-2xl border-4 shadow-xl transition-all transform hover:scale-105 disabled:cursor-not-allowed flex flex-col items-center justify-center
                        ${adjustmentUnit === "EUR" 
                          ? "bg-emerald-600 border-emerald-700 text-white shadow-emerald-300" 
                          : "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200"
                        }
                      `}
                    >
                      <span className="text-5xl font-black">EUR</span>
                      <span className="text-base font-semibold mt-2">Euro</span>
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">Come vengono espressi gli aggiustamenti per tipologia, occupazione e tariffe derivate.</p>
                </div>

                <div className="border-t pt-5 space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">Protezione password</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Puoi proteggere queste impostazioni con una password per evitare modifiche accidentali.
                  </p>
                  <div className="flex items-center gap-3">
                    {!baseSettingsLocked && !refPasswordHash && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => {
                          setRefPasswordMode("set")
                          setRefPasswordInput("")
                          setRefPasswordConfirm("")
                          setRefPasswordError("")
                          setRefPasswordDialogOpen(true)
                        }}
                      >
                        <Lock className="h-3.5 w-3.5" /> Imposta password
                      </Button>
                    )}
                    {baseSettingsLocked && (
                      <>
                        <Badge variant="outline" className="bg-amber-100 border-amber-300 text-amber-700 text-xs">
                          <Lock className="h-3 w-3 mr-1" /> Impostazioni protette
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            setPendingAction(() => () => {
                              setBaseSettingsLocked(false)
                              setRefPasswordHash("")
                            })
                            setRefPasswordMode("verify")
                            setRefPasswordInput("")
                            setRefPasswordError("")
                            setRefPasswordDialogOpen(true)
                          }}
                        >
                          <Lock className="h-3.5 w-3.5" /> Rimuovi protezione
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* K Variables Section - visible when K-driven is selected */}
            {algorithmType === "advanced" && <Card className="border-indigo-200 bg-indigo-50/30">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-indigo-50 shrink-0">
                      <BarChart3 className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">Variabili di Pressione (Coefficiente K)</h3>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        Crea e attiva le variabili che influenzano il prezzo finale. Ogni variabile attiva comparira nella tabella prezzi per la pesatura giornaliera (0-10). Il Coefficiente K e la media pesata normalizzata di tutte le variabili attive.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={openAddKVar}>
                    <Plus className="h-3.5 w-3.5" /> Aggiungi
                  </Button>
                </div>

                {/* FASE 8 - banner ALERT: variabili stale bloccate su neutro=5.
                    Mostrato solo se almeno una variabile ATTIVA ha dati piu'
                    vecchi della soglia. Linguaggio naturale, niente jargon. */}
                {kVarAlerts.length > 0 && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-red-800">
                          {kVarAlerts.length === 1
                            ? "1 variabile temporaneamente neutra (5)"
                            : `${kVarAlerts.length} variabili temporaneamente neutre (5)`}
                        </h4>
                        <p className="text-[11px] text-red-700 mt-0.5 leading-relaxed">
                          Le seguenti variabili sono attive ma non ricevono dati aggiornati:
                          finche' la situazione non si sblocca contano come neutre (5)
                          e non influenzano il prezzo.
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-1.5 pl-6">
                      {kVarAlerts.map((alert) => {
                        const v = kVariables.find(
                          (kv) => kv.variable_key === alert.variable_key,
                        )
                        return (
                          <li
                            key={alert.variable_key}
                            className="text-[11px] text-red-800 flex items-center gap-2 flex-wrap"
                          >
                            <span className="font-medium">{v?.label || alert.variable_key}:</span>
                            <span className="text-red-700">{alert.message}</span>
                            {alert.setup_link && alert.setup_cta && (
                              <Link
                                href={alert.setup_link}
                                className="inline-flex items-center gap-1 text-red-700 underline hover:text-red-900 font-medium"
                              >
                                {alert.setup_cta} <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {/* Legenda fonte dati - aggiunta in FASE 8 perche' l'utente non
                    capisce a colpo d'occhio cosa significa "verde / giallo /
                    rosso / grigio" senza una mappa visiva. */}
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground border-y py-2">
                  <span className="font-medium">Stato fonte dati:</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Attiva
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Da configurare
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> Bloccata (neutro 5)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-slate-400" /> Non disponibile
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Manuale
                  </span>
                </div>

                {kVariables.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
                    Nessuna variabile di pressione configurata. Clicca "Aggiungi" per crearne una.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {kVariables.map((v) => {
                      // FASE 8 - guida l'aspetto della riga in base allo status
                      // calcolato lato server (/api/accelerator/k-variables-status).
                      const status = kVarStatus[v.variable_key]
                      // Stato 'is_locked' DB (es. variabili che dipendono da
                      // integrazione globale superadmin) ha precedenza visiva.
                      const isLocked = v.is_locked === true
                      // can_activate: false solo per "not_integrated" (compset
                      // rate-shopper) o per "auto-ota-manual" senza alcun upload.
                      const cannotActivate =
                        !isLocked &&
                        status &&
                        status.can_activate === false &&
                        !v.is_active
                      // Coloriamo il bordo/sfondo in base allo stato. Lo stato
                      // ha priorita' sull'aspetto "attivo/inattivo" semplice.
                      const stateColors = (() => {
                        if (isLocked) return "bg-slate-100 border-slate-300 opacity-70"
                        if (!status) {
                          // fallback: nessun dato status -> usa logica vecchia
                          return v.is_active
                            ? "bg-white border-border"
                            : "bg-muted/30 border-border/50 opacity-60"
                        }
                        if (status.status === "data_stale" && v.is_active) {
                          return "bg-red-50 border-red-300"
                        }
                        if (status.status === "not_integrated") {
                          return "bg-slate-50 border-slate-300 opacity-70"
                        }
                        if (status.status === "setup_missing") {
                          return v.is_active
                            ? "bg-amber-50 border-amber-300"
                            : "bg-amber-50/40 border-amber-200"
                        }
                        if (v.is_active) return "bg-white border-border"
                        return "bg-muted/30 border-border/50 opacity-70"
                      })()

                      // Pallino fonte dati: verde/giallo/rosso/grigio/blu in
                      // sintonia con la legenda mostrata sopra.
                      const dotColor = (() => {
                        if (isLocked) return "bg-slate-400"
                        if (!status) return "bg-slate-400"
                        if (status.status === "ok" || status.status === "auto_internal")
                          return "bg-emerald-500"
                        if (status.status === "manual") return "bg-blue-500"
                        if (status.status === "setup_missing") return "bg-amber-500"
                        if (status.status === "data_stale" && v.is_active)
                          return "bg-red-500"
                        if (status.status === "data_stale") return "bg-amber-500"
                        if (status.status === "not_integrated") return "bg-slate-400"
                        if (status.status === "custom") return "bg-blue-500"
                        return "bg-slate-400"
                      })()

                      return (
                        <div
                          key={v.id}
                          className={`rounded-lg border transition-colors ${stateColors}`}
                        >
                          <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {isLocked || cannotActivate ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="p-1.5 rounded-full bg-slate-200 shrink-0">
                                        <Lock className="h-3.5 w-3.5 text-slate-500" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p className="text-xs max-w-[260px]">
                                        {isLocked
                                          ? "Variabile bloccata: richiede integrazione esterna"
                                          : status?.message ||
                                            "Variabile non attivabile in questo momento"}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <Switch
                                  checked={v.is_active}
                                  onCheckedChange={() => handleToggleKVar(v)}
                                  className="shrink-0"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Pallino stato fonte - sempre visibile */}
                                  <span
                                    className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`}
                                    aria-hidden
                                  />
                                  <span
                                    className={`text-sm font-medium truncate ${
                                      isLocked ? "text-slate-500" : "text-foreground"
                                    }`}
                                  >
                                    {v.label}
                                  </span>
                                  <Badge variant="outline" className="text-[9px] shrink-0">
                                    {categoryLabels[v.category] || v.category}
                                  </Badge>
                                  {/* Badge fonte dati - distingue auto/manuale/non disponibile */}
                                  {status && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Badge
                                            variant="secondary"
                                            className="text-[9px] shrink-0 cursor-help inline-flex items-center gap-1"
                                          >
                                            {status.source_kind === "manual" ? (
                                              <Wand2 className="h-2.5 w-2.5" />
                                            ) : (
                                              <Database className="h-2.5 w-2.5" />
                                            )}
                                            {status.datasource_label}
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          <p className="text-xs max-w-[280px]">{status.help_text}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  {isLocked && (
                                    <Badge variant="secondary" className="text-[9px] bg-slate-200 text-slate-600 shrink-0">
                                      Richiede integrazione
                                    </Badge>
                                  )}
                                  {/* Badge stato compatto - non si ripete il messaggio dettagliato */}
                                  {status && status.status === "ok" && (
                                    <Badge className="text-[9px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 shrink-0 inline-flex items-center gap-1">
                                      <CheckCircle2 className="h-2.5 w-2.5" /> Attiva
                                    </Badge>
                                  )}
                                  {status && status.status === "setup_missing" && (
                                    <Badge className="text-[9px] bg-amber-100 text-amber-800 hover:bg-amber-100 shrink-0">
                                      Da configurare
                                    </Badge>
                                  )}
                                  {status && status.status === "data_stale" && v.is_active && (
                                    <Badge className="text-[9px] bg-red-100 text-red-700 hover:bg-red-100 shrink-0 inline-flex items-center gap-1">
                                      <AlertTriangle className="h-2.5 w-2.5" /> Bloccata su 5
                                    </Badge>
                                  )}
                                  {status && status.status === "not_integrated" && (
                                    <Badge className="text-[9px] bg-slate-200 text-slate-700 hover:bg-slate-200 shrink-0">
                                      In arrivo
                                    </Badge>
                                  )}
                                </div>
                                {v.description && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <p className="text-xs text-muted-foreground mt-1 truncate cursor-help leading-snug">
                                          {v.description}
                                        </p>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="bottom"
                                        align="start"
                                        className="max-w-[420px] p-3"
                                      >
                                        <p className="text-sm leading-relaxed text-pretty">
                                          {v.description}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded cursor-help inline-flex items-center gap-1">
                                      <span className="font-medium">Importanza:</span>
                                      <span>{v.default_weight}/10</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[340px] p-3">
                                    <div className="space-y-2">
                                      <p className="text-sm font-semibold leading-snug">
                                        Importanza (peso) della variabile nel Coefficiente K
                                      </p>
                                      <p className="text-xs leading-relaxed text-muted-foreground">
                                        Indica QUANTO questa variabile influisce sul prezzo
                                        rispetto alle altre, NON il valore corrente. Si
                                        configura una volta e vale per tutti i giorni.
                                      </p>
                                      <p className="text-xs leading-relaxed text-muted-foreground">
                                        Scala 0-10: piu' alto = piu' impatto. Esempio: una
                                        variabile con importanza 8 conta il doppio di una
                                        con importanza 4 quando il motore calcola K.
                                      </p>
                                      <p className="text-xs leading-relaxed text-muted-foreground">
                                        Il valore giornaliero (0-10) della variabile e' invece
                                        nella tabella prezzi - lo assegna il Revenue Manager
                                        oppure viene calcolato automaticamente dai dati.
                                      </p>
                                      <p className="text-xs leading-relaxed text-muted-foreground border-t border-border pt-2">
                                        Questo e&apos; il valore BASE usato tutto l&apos;anno. Puoi
                                        modularlo per periodi specifici (eventi, stagioni,
                                        sabato d&apos;inverno...) dal pannello &quot;Modula
                                        l&apos;importanza per periodo&quot; subito sotto.
                                      </p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditKVar(v)}>
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteKVar(v)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Banner CTA inline per setup mancante - mostra il
                              messaggio naturale + bottone per andare alla
                              pagina di configurazione. Espanso SOLO per status
                              setup_missing e data_stale. */}
                          {status &&
                            (status.status === "setup_missing" ||
                              (status.status === "data_stale" && v.is_active)) &&
                            status.setup_link &&
                            status.setup_cta && (
                              <div className="border-t border-dashed border-current/20 px-3 py-2 flex items-center gap-2 flex-wrap">
                                <p className="text-[11px] leading-relaxed flex-1 min-w-[200px]">
                                  {status.message}
                                </p>
                                <Link href={status.setup_link}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[11px] gap-1.5 shrink-0"
                                  >
                                    {status.setup_cta}
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </Link>
                              </div>
                            )}
                          {/* Banner inline per not_integrated - niente CTA,
                              solo nota neutra che spiega cosa succederà. */}
                          {status && status.status === "not_integrated" && (
                            <div className="border-t border-dashed border-slate-300 px-3 py-2">
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                {status.message}
                              </p>
                            </div>
                          )}

                          {/* 13/05/2026: Toggle pannello override stagionali.
                              Mostrato solo per variabili ATTIVE e non bloccate
                              (su variabili non integrate / con setup mancante
                              il peso non e' rilevante finche' il setup non e'
                              completato). hotelId garantito presente in questa
                              sezione. */}
                          {hotelId && v.is_active && !isLocked && (
                            <div className="border-t border-dashed border-current/15 bg-background/40">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedOverrideKVarId((prev) =>
                                    prev === v.id ? null : v.id,
                                  )
                                }
                                className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-muted/40 transition-colors"
                                aria-expanded={expandedOverrideKVarId === v.id}
                              >
                                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                                  <CalendarRange className="h-3 w-3 text-indigo-600" />
                                  Modula l&apos;importanza per periodo (eventi, stagionalita&apos;, giorni specifici)
                                </span>
                                {expandedOverrideKVarId === v.id ? (
                                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                )}
                              </button>
                              {expandedOverrideKVarId === v.id && (
                                <div className="px-3 pb-3 pt-1">
                                  <KVariableWeightOverrides
                                    hotelId={hotelId}
                                    variableId={v.id}
                                    variableLabel={v.label}
                                    defaultWeight={v.default_weight ?? 5}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Info className="h-3 w-3 shrink-0" />
                  Le variabili attive appariranno nella tabella prezzi. Il RM assegna un valore 0-10 per ogni giorno. Il valore 5 e neutro (K=0).
                </div>
              </CardContent>
            </Card>}

            {/* Weather Sync Info Card */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-sky-50 shrink-0">
                    <Cloud className="h-5 w-5 text-sky-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground text-sm">Dati Meteo</h3>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      Le previsioni meteo vengono aggiornate automaticamente ogni 3 ore e influenzano il calcolo dei prezzi tramite la variabile K meteo.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-sm font-medium text-foreground">Sincronizzazione attiva</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Ogni 3 ore</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    I dati meteo vengono recuperati automaticamente in base alle coordinate della struttura.
                  </p>
                </div>

                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Info className="h-3 w-3 shrink-0" />
                  La frequenza di sync delle altre variabili (occupazione, prenotazioni) si configura in Impostazioni &gt; PMS.
                </div>
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="flex items-center justify-between">
              <Link href="/accelerator/pricing">
                <Button variant="outline" className="gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Torna alla tabella prezzi
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                {saved && (
                  <span className="text-sm text-emerald-600 flex items-center gap-1.5">
                    <Save className="h-4 w-4" />
                    Salvato con successo
                  </span>
                )}
                <Button onClick={() => requestChange(handleSave)} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Salvataggio..." : "Salva impostazioni"}
                </Button>
              </div>
            </div>

          </div>
        )}
      </main>

      {/* K Variable create/edit dialog */}
      <Dialog open={kVarDialogOpen} onOpenChange={setKVarDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-500" />
              {kVarEditing ? "Modifica variabile" : "Nuova variabile di pressione"}
            </DialogTitle>
            <DialogDescription>
              {kVarEditing
                ? "Modifica le proprieta della variabile."
                : "Crea una nuova variabile che influenzera il Coefficiente K. Dopo la creazione, apparira nella tabella prezzi per la pesatura giornaliera."}
            </DialogDescription>
          </DialogHeader>
          {/* Logica K - spiegazione */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800 space-y-1.5">
            <p className="font-semibold">Come funziona il Coefficiente K</p>
            <p>Ogni variabile rappresenta un <strong>fattore di pressione</strong> sulla domanda. Nella tabella prezzi, il RM assegnera un valore da 0 a 10 per ogni giorno:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li><strong>0-4</strong> = pressione bassa (smorza gli incrementi di prezzo)</li>
              <li><strong>5</strong> = neutro (nessun effetto)</li>
              <li><strong>6-10</strong> = pressione alta (amplifica gli incrementi di prezzo)</li>
            </ul>
            <p>Il <strong>peso di default</strong> e il valore iniziale che appare nella griglia prima che il RM lo modifichi. Rappresenta anche l{"'"}importanza relativa della variabile nel calcolo della media pesata K.</p>
          </div>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="kvar-label">Nome variabile *</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-xs">
                      Nome che apparira nella tabella prezzi come riga editabile. Scegli un nome chiaro e breve (es. &quot;Meteo&quot;, &quot;Evento locale&quot;, &quot;Competitor pricing&quot;).
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="kvar-label"
                value={kVarForm.label}
                onChange={(e) => setKVarForm(f => ({ ...f, label: e.target.value }))}
                placeholder="es. Trend stagionale, Eventi locali, ecc."
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="kvar-desc">Descrizione (opzionale)</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-xs">
                      Nota interna visibile al passaggio del mouse sulla riga nella tabella prezzi. Spiega al RM cosa valutare per assegnare il punteggio (es. &quot;Valutare previsioni meteo: sole=8, pioggia=3&quot;).
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="kvar-desc"
                value={kVarForm.description}
                onChange={(e) => setKVarForm(f => ({ ...f, description: e.target.value }))}
                placeholder="es. Misura la pressione della domanda stagionale"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Categoria</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px] text-xs">
                        Raggruppamento logico per organizzare le variabili. Domanda = fattori che influenzano la richiesta. Offerta = fattori legati alla disponibilita. Mercato = fattori competitivi esterni.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select value={kVarForm.category} onValueChange={(v) => setKVarForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demand">Domanda</SelectItem>
                    <SelectItem value="supply">Offerta</SelectItem>
                    <SelectItem value="market">Mercato</SelectItem>
                    <SelectItem value="general">Generale</SelectItem>
                    <SelectItem value="other">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Peso di default (0-10)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px] text-xs">
                        <p className="font-semibold mb-1">Doppia funzione:</p>
                        <p><strong>1. Valore iniziale</strong> - il valore che appare nella cella della griglia prima che il RM lo modifichi manualmente.</p>
                        <p className="mt-1"><strong>2. Importanza relativa</strong> - quanto questa variabile pesa nel calcolo della media K. Peso 8 conta il doppio di peso 4.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={kVarForm.default_weight}
                  onChange={(e) => setKVarForm(f => ({ ...f, default_weight: Math.min(10, Math.max(0, Number(e.target.value) || 0)) }))}
                  className="h-9 text-center font-semibold"
                />
                <p className="text-[10px] text-muted-foreground">Importanza relativa nella media pesata K</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKVarDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSaveKVar} disabled={kVarSaving || !kVarForm.label.trim()}>
              {kVarSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {kVarEditing ? "Salva modifiche" : "Crea variabile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password dialog */}
      <Dialog open={refPasswordDialogOpen} onOpenChange={setRefPasswordDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              {refPasswordMode === "set" ? "Proteggi impostazioni base" : "Sblocca impostazioni base"}
            </DialogTitle>
            <DialogDescription>
              {refPasswordMode === "set"
                ? "Imposta una password per proteggere le impostazioni della cella base dell'algoritmo da modifiche accidentali."
                : "Inserisci la password per modificare le impostazioni base dell'algoritmo."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ref-pwd">Password</Label>
              <Input
                id="ref-pwd"
                type="password"
                value={refPasswordInput}
                onChange={(e) => { setRefPasswordInput(e.target.value); setRefPasswordError("") }}
                placeholder={refPasswordMode === "set" ? "Scegli una password" : "Inserisci la password"}
                onKeyDown={(e) => e.key === "Enter" && handleRefPasswordSubmit()}
              />
            </div>

            {refPasswordMode === "set" && (
              <div className="space-y-2">
                <Label htmlFor="ref-pwd-confirm">Conferma password</Label>
                <Input
                  id="ref-pwd-confirm"
                  type="password"
                  value={refPasswordConfirm}
                  onChange={(e) => { setRefPasswordConfirm(e.target.value); setRefPasswordError("") }}
                  placeholder="Ripeti la password"
                  onKeyDown={(e) => e.key === "Enter" && handleRefPasswordSubmit()}
                />
              </div>
            )}

            {refPasswordError && (
              <p className="text-sm text-destructive">{refPasswordError}</p>
            )}
            
            {/* Password reset link - only in verify mode */}
            {refPasswordMode === "verify" && !resetPasswordSent && (
              <div className="pt-2 border-t">
                <button
                  type="button"
                  onClick={handleRequestPasswordReset}
                  disabled={resetPasswordSending}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
                >
                  {resetPasswordSending ? "Invio in corso..." : "Password dimenticata? Richiedi reset all'admin"}
                </button>
              </div>
            )}
            
            {/* Reset password sent confirmation */}
            {resetPasswordSent && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-sm text-emerald-700">
                  Richiesta inviata! L'amministratore della struttura ricevera una email per reimpostare la password.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setRefPasswordDialogOpen(false); setResetPasswordSent(false) }}>
              {resetPasswordSent ? "Chiudi" : "Annulla"}
            </Button>
            {!resetPasswordSent && (
              <Button onClick={handleRefPasswordSubmit}>
                {refPasswordMode === "set" ? "Imposta password" : "Conferma"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
