"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
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
import { ChevronLeft, ChevronRight, Loader2, Info, FlaskConical, RotateCcw, ArrowLeft, TrendingUp } from "lucide-react"
  import {
  ComposedChart, Area, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from "recharts"
import Link from "next/link"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from "date-fns"
import { it } from "date-fns/locale"

// ------- Types (same as pricing page) -------

interface RoomType {
  id: string
  name: string
  code: string
  total_rooms: number
  max_occupancy: number
  display_order: number
  is_reference?: boolean
  scidoo_room_type_id?: string
}

interface Rate {
  id: string
  name: string
  code: string
  is_base?: boolean
  scidoo_rate_id?: string
}

interface OccupancyBand {
  id?: string
  band_index: number
  min_pct: number
  max_pct: number
  min_num?: number
  max_num?: number
  increment_pct: number
  increment_eur?: number
  occupancy_mode?: "pct" | "num"
  increment_mode?: "pct" | "eur"
  label?: string
}

interface BandGroup {
  id: string
  name: string
  color: string
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
  bottom_rate: number | null
  rack_rate: number | null
}

interface DayProduction {
  date: string
  dayOfWeek: string
  isWeekend: boolean
  isToday: boolean
}

// ------- Helper -------

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
 * BUGFIX 13/05/2026 - Last Minute mostrato a 0% nel simulatore.
 *
 * Lo schema è migrato dai 3 campi legacy flat di `last_minute_levels`
 * (`discount_pct`, `min_occupancy_num`, `max_occupancy_num`, tutti = 0 in DB)
 * alla matrice annidata `shared_bands` (1 livello -> N bande, ognuna con
 * proprio min_rooms / max_rooms / discount_pct). Stessa logica già usata
 * in /accelerator/pricing/page.tsx (riga ~4650-4670 e ~1190-1198).
 *
 * Questi 2 helper centralizzano il calcolo per il simulatore:
 *   - getLmDisplayInfo: aggregato per UI (range camere + range sconto)
 *   - getLmBandForRooms: lookup banda specifica per il chart-calc
 */
function getLmDisplayInfo(level: LastMinuteLevel | null | undefined): {
  roomsRange: string
  discountLabel: string
} {
  if (!level) return { roomsRange: "—", discountLabel: "0%" }
  const bands = ((level as unknown) as { shared_bands?: Array<{ min_rooms: number | string; max_rooms: number | string; discount_pct: number | string }> }).shared_bands || []
  if (bands.length === 0) {
    return { roomsRange: "—", discountLabel: "0%" }
  }
  const mins = bands.map(b => Number(b.min_rooms)).filter(n => Number.isFinite(n))
  const maxs = bands.map(b => Number(b.max_rooms)).filter(n => Number.isFinite(n))
  const discounts = bands.map(b => Number(b.discount_pct)).filter(d => Number.isFinite(d) && d > 0)
  const roomsRange = mins.length && maxs.length ? `${Math.min(...mins)}-${Math.max(...maxs)}` : "—"
  let discountLabel = "0%"
  if (discounts.length > 0) {
    const minD = Math.min(...discounts)
    const maxD = Math.max(...discounts)
    discountLabel = minD === maxD ? `${minD}%` : `${minD}-${maxD}%`
  }
  return { roomsRange, discountLabel }
}

function getLmBandForRooms(
  level: LastMinuteLevel | null | undefined,
  remainingRooms: number,
): { min_rooms: number; max_rooms: number; discount_pct: number } | null {
  if (!level) return null
  const bands = ((level as unknown) as { shared_bands?: Array<{ min_rooms: number | string; max_rooms: number | string; discount_pct: number | string }> }).shared_bands || []
  for (const b of bands) {
    const minR = Number(b.min_rooms)
    const maxR = Number(b.max_rooms)
    const pct = Number(b.discount_pct)
    if (Number.isFinite(minR) && Number.isFinite(maxR) && Number.isFinite(pct)) {
      if (remainingRooms >= minR && remainingRooms <= maxR) {
        return { min_rooms: minR, max_rooms: maxR, discount_pct: pct }
      }
    }
  }
  return null
}

// ------- Main Component -------

export default function PricingTestPage() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [loading, setLoading] = useState(true)
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)

  // Data from API (same as pricing page)
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [rates, setRates] = useState<Rate[]>([])
  const [algoParams, setAlgoParams] = useState<Record<string, Record<string, string>>>({})
  const [bandGroups, setBandGroups] = useState<BandGroup[]>([])
  const [occupancyBands, setOccupancyBands] = useState<OccupancyBand[]>([])
  const [lastMinuteLevels, setLastMinuteLevels] = useState<LastMinuteLevel[]>([])
  const [rateLimits, setRateLimits] = useState<RateLimitData[]>([])
  const [realOccupancyData, setRealOccupancyData] = useState<Record<string, Record<string, { total: number; available: number }>>>({})

  // Simulation overrides: per room type per date
  const [simOccupancy, setSimOccupancy] = useState<Record<string, Record<string, number>>>({})
  const [simMode, setSimMode] = useState<"real" | "sim">("real")

  // Base settings
  const [referenceRoomTypeId, setReferenceRoomTypeId] = useState("")
  const [referenceRateId, setReferenceRateId] = useState("")
  const [baseOccupancy, setBaseOccupancy] = useState(2)
  const [adjustmentUnit, setAdjustmentUnit] = useState<"%" | "EUR">("%")
  const referenceRoomTypeIndex = roomTypes.findIndex((rt) => rt.id === referenceRoomTypeId)

  // Chart room type selector (declared early because loadData references it)
  const [chartRoomTypeId, setChartRoomTypeId] = useState<string>("")

  // ------- Build production days -------
  const production: DayProduction[] = useMemo(() => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start, end })
    const todayStr = format(new Date(), "yyyy-MM-dd")
    return days.map((d) => {
      const dateStr = format(d, "yyyy-MM-dd")
      const dow = d.getDay()
      return {
        date: dateStr,
        dayOfWeek: format(d, "EEE", { locale: it }),
        isWeekend: dow === 0 || dow === 6,
        isToday: dateStr === todayStr,
      }
    })
  }, [currentMonth])

  // ------- Load hotel identity (same as pricing page) -------
  async function loadUserHotel() {
    try {
      const meRes = await fetch("/api/auth/me")
      const meData = await meRes.json()
      const allowedRoles = ["super_admin", "system_admin", "property_admin", "villa_admin"]
      const userRole = meData.role || meData.user?.role
      if (!meData.is_superadmin && !allowedRoles.includes(userRole)) {
        setUnauthorized(true)
        setLoading(false)
        return
      }
      setIsSuperAdmin(meData.is_superadmin || false)

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

  useEffect(() => {
    loadUserHotel()
  }, [])

  // ------- Data loading -------
  async function loadData() {
    if (!hotelId) return
    setLoading(true)
    try {
      const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd")
      const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd")

      const params = new URLSearchParams({ hotel_id: hotelId, month_start: monthStart, month_end: monthEnd })
      const [gridRes, rlRes] = await Promise.all([
        fetch(`/api/accelerator/pricing-grid?${params}`),
        fetch("/api/settings/rate-limits"),
      ])

      if (!gridRes.ok) {
        if (gridRes.status === 401) { window.location.href = "/auth/login"; return }
        throw new Error(`Errore ${gridRes.status}`)
      }
      const gridData = await gridRes.json()

      setRoomTypes(gridData.roomTypes || [])
      setRates(gridData.rates || [])
      setOccupancyBands(gridData.occupancyBands || [])
      setBandGroups(gridData.bandGroups || [])
      setLastMinuteLevels(gridData.lastMinuteLevels || [])

      // Rate limits
      if (rlRes.ok) {
        const rlData = await rlRes.json()
        setRateLimits(rlData.rateLimits || [])
      }

      // Algo params -- already a map from the API
      setAlgoParams(gridData.algoParams || {})

      // Occupancy data -- already a map from the API
      setRealOccupancyData(gridData.occupancy || {})

      // Grid prices -- for fallback base rate when base_rate algo param is not set
      setGridPrices(gridData.prices || {})

      // Base settings -- derive from algoParams (same logic as pricing page)
      // Reference room type: use saved algoParam, fallback to first room type
      const refRtIdMap = gridData.algoParams?.reference_room_type_id
      const savedRefRtId = refRtIdMap ? Object.values(refRtIdMap)[0] : null
      if (savedRefRtId) {
        setReferenceRoomTypeId(String(savedRefRtId))
      } else if (gridData.roomTypes?.[0]?.id) {
        setReferenceRoomTypeId(gridData.roomTypes[0].id)
      }

      // Reference rate: use saved algoParam, fallback to first rate
      const refRateIdMap = gridData.algoParams?.reference_rate_id
      const savedRefRateId = refRateIdMap ? Object.values(refRateIdMap)[0] : null
      if (savedRefRateId) {
        setReferenceRateId(String(savedRefRateId))
      } else if (gridData.rates?.[0]?.id) {
        setReferenceRateId(gridData.rates[0].id)
      }

      // Base occupancy from the resolved reference room type (without overwriting the ref ID)
      const resolvedRefId = savedRefRtId ? String(savedRefRtId) : gridData.roomTypes?.[0]?.id
      const refRt = gridData.roomTypes?.find((rt: RoomType) => rt.id === resolvedRefId) || gridData.roomTypes?.[0]
      if (refRt) {
        setBaseOccupancy(refRt.max_occupancy || 2)
        if (!chartRoomTypeId) setChartRoomTypeId(resolvedRefId || "")
      }
    } catch (e) {
      console.error("Error loading test data:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hotelId && !unauthorized) {
      loadData()
    }
  }, [hotelId, unauthorized, currentMonth])

  // ------- Occupancy data (real or sim) -------
  const occupancyData = useMemo(() => {
    // Start from real data
    const merged: Record<string, Record<string, { total: number; available: number }>> = {}

    // Copy real data
    for (const rtId of Object.keys(realOccupancyData)) {
      merged[rtId] = {}
      for (const [dateStr, entry] of Object.entries(realOccupancyData[rtId])) {
        merged[rtId][dateStr] = { ...entry }
      }
    }

    // If real data is empty but we have room types, create default entries
    for (const rt of roomTypes) {
      if (!merged[rt.id]) {
        merged[rt.id] = {}
      }
    }

    if (simMode === "real") return merged

    // Apply simulation overrides on top
    for (const rtId of Object.keys(simOccupancy)) {
      if (!merged[rtId]) merged[rtId] = {}
      for (const [dateStr, soldCount] of Object.entries(simOccupancy[rtId])) {
        const real = realOccupancyData[rtId]?.[dateStr]
        const totalRooms = real?.total || roomTypes.find(rt => rt.id === rtId)?.total_rooms || 0
        merged[rtId][dateStr] = {
          total: totalRooms,
          available: Math.max(0, totalRooms - soldCount),
        }
      }
    }

    return merged
  }, [realOccupancyData, simOccupancy, simMode, roomTypes])

  // ------- Helpers -------
  function getAlgoParam(key: string, date: string): string {
    return algoParams[key]?.[date] ?? ""
  }

  function getRateLimit(roomTypeId: string) {
    return rateLimits.find((rl) => rl.room_type_id === roomTypeId)
  }

  const formatEuro = (amount: number) =>
    amount.toLocaleString("it-IT", { style: "currency", currency: "EUR" })

  // ------- Pricing Engine (identical to pricing page) -------
  // Also store grid prices from the API for fallback base rate
  const [gridPrices, setGridPrices] = useState<Record<string, Record<string, number>>>({})

  function calculateSuggestedPrice(roomTypeId: string, dateStr: string, forOccupancy?: number): number | null {
    // Try algo param first, then fallback to grid price for reference room+rate
    let baseRate = 0
    const baseRateStr = getAlgoParam("base_rate", dateStr)
    if (baseRateStr && !isNaN(Number(baseRateStr)) && Number(baseRateStr) > 0) {
      baseRate = Number(baseRateStr)
    } else {
      // Fallback: use grid price for reference room type + reference rate + base occupancy
      const gridKey = `${referenceRoomTypeId}_${referenceRateId}_${baseOccupancy}`
      const gridVal = gridPrices[gridKey]?.[dateStr]
      if (gridVal && gridVal > 0) {
        baseRate = gridVal
      }
    }
    if (baseRate <= 0) return null

    let price = baseRate

    // 2. Occupancy band increment (hotel-level)
    let totalSold = 0
    let totalCap = 0
    for (const rt of roomTypes) {
      const data = occupancyData[rt.id]?.[dateStr]
      const rtTotal = data?.total || rt.total_rooms || 0
      const rtAvail = data?.available ?? rtTotal
      totalCap += rtTotal
      totalSold += rtTotal - rtAvail
    }
    const hotelOcc = totalCap > 0 ? Math.round((totalSold / totalCap) * 100) : null

    // Use sim override first, then algoParam, then default to first group
    const simGroupId = simBandGroupOverride[dateStr]
    const dayGroupId = simGroupId || getAlgoParam("band_group_id", dateStr)
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
          : occValue >= (b.min_num ?? 0) && occValue <= (b.max_num ?? 0)
      )
      if (band) {
        const bandIdx = bandsForDay.indexOf(band)
        const manualIncStr = getAlgoParam(`increment_band_${bandIdx}`, dateStr)
        const defaultInc = incMode === "eur" ? Number(band.increment_eur ?? 0) : Number(band.increment_pct ?? 0)
        const incrementVal = manualIncStr !== "" ? Number(manualIncStr) : defaultInc
        if (!isNaN(incrementVal) && incrementVal !== 0) {
          price = incMode === "eur" || adjustmentUnit === "EUR"
            ? price + incrementVal
            : price * (1 + incrementVal / 100)
        }
      }
    }

    // 3. Room type adjustment
    const targetRtIndex = roomTypes.findIndex((rt) => rt.id === roomTypeId)
    if (targetRtIndex !== -1 && targetRtIndex !== referenceRoomTypeIndex) {
      if (targetRtIndex > referenceRoomTypeIndex) {
        for (let ri = referenceRoomTypeIndex + 1; ri <= targetRtIndex; ri++) {
          const rtAdjStr = getAlgoParam(`room_type_adj_${roomTypes[ri].id}`, dateStr)
          if (rtAdjStr && !isNaN(Number(rtAdjStr))) {
            const rtAdj = Number(rtAdjStr)
            price = adjustmentUnit === "EUR" ? price + rtAdj : price * (1 + rtAdj / 100)
          }
        }
      } else {
        for (let ri = referenceRoomTypeIndex - 1; ri >= targetRtIndex; ri--) {
          const rtAdjStr = getAlgoParam(`room_type_adj_${roomTypes[ri].id}`, dateStr)
          if (rtAdjStr && !isNaN(Number(rtAdjStr))) {
            const rtAdj = Number(rtAdjStr)
            price = adjustmentUnit === "EUR" ? price - Math.abs(rtAdj) : price * (1 - Math.abs(rtAdj) / 100)
          }
        }
      }
    }

    // 4. Market demand weight
    const demandStr = getAlgoParam("market_demand_weight", dateStr)
    if (demandStr && !isNaN(Number(demandStr))) {
      price = price * (1 + Number(demandStr) / 100)
    }

  // 5. Last minute discount (use sim overrides if set)
  const effectiveLmDays = simLmDays !== null ? simLmDays : Number(getAlgoParam("last_minute_days", dateStr) || 0)
  const effectiveLmLevelId = simLmLevelId !== null ? simLmLevelId : getAlgoParam("last_minute_level_id", dateStr)
  if (effectiveLmDays > 0 && effectiveLmLevelId && effectiveLmLevelId !== "none") {
      const level = lastMinuteLevels.find((l) => l.id === effectiveLmLevelId)
      // BUGFIX 13/05/2026: lo schema legacy flat (level.discount_pct,
      // min_occupancy_num/max_occupancy_num) e' a 0 in DB.
      // Lo sconto last-minute reale vive in shared_bands per banda di
      // camere disponibili. Stessa logica di /accelerator/pricing/page.tsx
      // (riga ~1190-1198) e del motore lib/pricing/calculate-suggested-price.ts.
      if (level) {
        const daysUntil = Math.floor((new Date(dateStr).getTime() - new Date().getTime()) / 86400000)
        if (daysUntil >= 0 && daysUntil <= effectiveLmDays) {
          const remainingRooms = totalCap - totalSold
          const band = getLmBandForRooms(level, remainingRooms)
          if (band && band.discount_pct > 0) {
            price = price * (1 - band.discount_pct / 100)
          }
        }
      }
    }

    // Occupancy chain
    const targetOcc = forOccupancy ?? baseOccupancy
    if (targetOcc !== baseOccupancy) {
      if (targetOcc > baseOccupancy) {
        for (let occ = baseOccupancy + 1; occ <= targetOcc; occ++) {
          const adjStr = getAlgoParam(`occ_adj_${occ}`, dateStr)
          if (adjStr && !isNaN(Number(adjStr))) {
            const adj = Number(adjStr)
            price = adjustmentUnit === "EUR" ? price + adj : price * (1 + adj / 100)
          }
        }
      } else {
        for (let occ = baseOccupancy - 1; occ >= targetOcc; occ--) {
          const adjStr = getAlgoParam(`occ_adj_${occ}`, dateStr)
          if (adjStr && !isNaN(Number(adjStr))) {
            const adj = Number(adjStr)
            price = adjustmentUnit === "EUR" ? price - Math.abs(adj) : price * (1 - Math.abs(adj) / 100)
          }
        }
      }
    }

    // Clamp
    const limit = getRateLimit(roomTypeId)
    if (limit) {
      if (limit.bottom_rate && price < limit.bottom_rate) price = limit.bottom_rate
      if (limit.rack_rate && price > limit.rack_rate) price = limit.rack_rate
    }

    return Math.round(price * 100) / 100
  }

  // ------- Simulation helpers -------
  function getSimSold(rtId: string, dateStr: string): number {
    if (simOccupancy[rtId]?.[dateStr] !== undefined) return simOccupancy[rtId][dateStr]
    const data = occupancyData[rtId]?.[dateStr]
    return data ? data.total - data.available : 0
  }

  function setSimSold(rtId: string, dateStr: string, sold: number) {
    setSimOccupancy((prev) => ({
      ...prev,
      [rtId]: { ...(prev[rtId] || {}), [dateStr]: sold },
    }))
  }

  function resetSimulation() {
    setSimOccupancy({})
    setSimBandGroupOverride({})
    setSimLmDays(null)
    setSimLmLevelId(null)
    setSimMode("real")
  }

  // Simulated band_group_id override per date
  const [simBandGroupOverride, setSimBandGroupOverride] = useState<Record<string, string>>({})

  // Simulated last-minute overrides
  const [simLmDays, setSimLmDays] = useState<number | null>(null) // null = use real
  const [simLmLevelId, setSimLmLevelId] = useState<string | null>(null) // null = use real

  // Selected date for detailed view
  const [selectedDate, setSelectedDate] = useState("")

  useEffect(() => {
    if (production.length > 0 && !selectedDate) {
      const todayEntry = production.find((d) => d.isToday)
      setSelectedDate(todayEntry?.date || production[0].date)
    }
  }, [production, selectedDate])

  // ------- Render -------
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="flex-1 p-4 space-y-4 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/accelerator/pricing">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Torna ai Prezzi
            </Button>
          </Link>
          <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-purple-600" />
            Simulatore Prezzi
            {hotelName && <span className="text-sm font-normal text-muted-foreground">- {hotelName}</span>}
          </h1>
            <p className="text-sm text-muted-foreground">
              Modifica l{"'"}occupazione per vedere come cambia il prezzo suggerito dall{"'"}algoritmo in tempo reale.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Month nav */}
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[120px] text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: it })}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Caricamento dati...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mode toggle + date selector */}
          <Card>
            <CardContent className="py-3 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge variant={simMode === "sim" ? "default" : "outline"} className={`cursor-pointer ${simMode === "sim" ? "bg-purple-600" : ""}`} onClick={() => setSimMode("sim")}>
                  <FlaskConical className="h-3 w-3 mr-1" />
                  Simulazione
                </Badge>
                <Badge variant={simMode === "real" ? "default" : "outline"} className="cursor-pointer" onClick={() => setSimMode("real")}>
                  Dati Reali
                </Badge>
              </div>
              {simMode === "sim" && (
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={resetSimulation}>
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              )}
              {/* Demand level selector */}
              {bandGroups.length > 0 && selectedDate && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Domanda:</Label>
                  <Select
                    value={simBandGroupOverride[selectedDate] || getAlgoParam("band_group_id", selectedDate) || bandGroups[0]?.id || ""}
                    onValueChange={(val) => {
                      if (simMode === "real") setSimMode("sim")
                      setSimBandGroupOverride((prev) => ({ ...prev, [selectedDate]: val }))
                    }}
                  >
                    <SelectTrigger className="w-[160px] h-8">
                      <SelectValue placeholder="Livello domanda" />
                    </SelectTrigger>
                    <SelectContent>
                      {bandGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Data:</Label>
                <Select value={selectedDate} onValueChange={setSelectedDate}>
                  <SelectTrigger className="w-[180px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {production.map((d) => (
                      <SelectItem key={d.date} value={d.date}>
                        {format(new Date(d.date + "T12:00:00"), "EEEE d MMM", { locale: it })}
                        {d.isToday && " (oggi)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Last Minute + Chart controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Last Minute simulation */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  Last Minute
                  {(simLmDays !== null || simLmLevelId !== null) && simMode === "sim" && (
                    <Badge className="bg-purple-600 text-[9px]">SIM</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Anticipo giorni */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Anticipo (giorni prima del check-in)</Label>
                    <span className="text-sm font-bold">
                      {simLmDays !== null ? simLmDays : (getAlgoParam("last_minute_days", selectedDate) || "0")} gg
                    </span>
                  </div>
                  <Slider
                    value={[simLmDays !== null ? simLmDays : Number(getAlgoParam("last_minute_days", selectedDate) || 0)]}
                    max={30}
                    min={0}
                    step={1}
                    onValueChange={([v]) => {
                      if (simMode === "real") setSimMode("sim")
                      setSimLmDays(v)
                    }}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0 gg (off)</span>
                    <span>30 gg</span>
                  </div>
                </div>

                {/* Livello LM */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Livello Last Minute</Label>
                  <Select
                    value={simLmLevelId ?? (getAlgoParam("last_minute_level_id", selectedDate) || "none")}
                    onValueChange={(val) => {
                      if (simMode === "real") setSimMode("sim")
                      setSimLmLevelId(val)
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Nessuno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuno</SelectItem>
                      {lastMinuteLevels.map((l) => {
                        // BUGFIX 13/05/2026: lo schema legacy flat (l.discount_pct) e' sempre 0.
                        // I valori veri vivono in l.shared_bands -> usiamo getLmDisplayInfo.
                        const { discountLabel } = getLmDisplayInfo(l)
                        return (
                          <SelectItem key={l.id} value={l.id}>
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                              {l.name} (-{discountLabel})
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Riepilogo fasce LM */}
                {lastMinuteLevels.length > 0 && (
                  <div className="rounded border p-2 space-y-1 bg-muted/20">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fasce configurate</div>
                    {lastMinuteLevels.map((l) => {
                      const isActive = (simLmLevelId !== null ? simLmLevelId : getAlgoParam("last_minute_level_id", selectedDate)) === l.id
                      // BUGFIX 13/05/2026: range camere e sconto vivono in shared_bands.
                      const { roomsRange, discountLabel } = getLmDisplayInfo(l)
                      return (
                        <div
                          key={l.id}
                          className={`flex items-center justify-between text-[10px] p-1 rounded cursor-pointer transition-colors ${isActive ? "bg-blue-100 border border-blue-300" : "hover:bg-muted/50"}`}
                          onClick={() => {
                            if (simMode === "real") setSimMode("sim")
                            setSimLmLevelId(l.id)
                          }}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                            {l.name}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground">{roomsRange} cam</span>
                            <Badge variant="outline" className="text-[9px]">-{discountLabel}</Badge>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chart room type selector */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  Grafico Tipologia
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Visualizza curva tariffaria per:</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {roomTypes.map((rt) => {
                      const isActive = chartRoomTypeId === rt.id
                      const isRef = rt.id === referenceRoomTypeId
                      return (
                        <button
                          key={rt.id}
                          className={`text-xs text-left p-2 rounded border transition-colors ${isActive ? "bg-purple-100 border-purple-400 text-purple-800 font-semibold" : "border-border hover:bg-muted/50"}`}
                          onClick={() => setChartRoomTypeId(rt.id)}
                        >
                          <div className="flex items-center gap-1.5">
                            {isRef && <Badge variant="outline" className="text-[8px] px-1 py-0 text-amber-600 border-amber-300">REF</Badge>}
                            {rt.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {rt.total_rooms} camere
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main simulator grid */}
          {selectedDate && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* LEFT: Occupancy controls */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    Occupazione per Tipologia
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {format(new Date(selectedDate + "T12:00:00"), "EEEE d MMMM", { locale: it })}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {roomTypes.map((rt) => {
                    const real = realOccupancyData[rt.id]?.[selectedDate]
                    const totalRooms = real?.total || rt.total_rooms || 1
                    const realSold = real ? real.total - real.available : 0
                    const currentSold = simMode === "sim" ? getSimSold(rt.id, selectedDate) : realSold
                    const occPct = totalRooms > 0 ? Math.round((currentSold / totalRooms) * 100) : 0

                    return (
                      <div key={rt.id} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{rt.name}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${occPct >= 90 ? "text-red-600" : occPct >= 70 ? "text-orange-600" : occPct >= 50 ? "text-yellow-600" : "text-emerald-600"}`}>
                              {occPct}%
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {currentSold}/{totalRooms}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[currentSold]}
                            max={totalRooms}
                            min={0}
                            step={1}
                            onValueChange={([v]) => {
                              if (simMode === "real") setSimMode("sim")
                              setSimSold(rt.id, selectedDate, v)
                            }}
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            min={0}
                            max={totalRooms}
                            value={currentSold}
                            onChange={(e) => {
                              const v = Math.min(totalRooms, Math.max(0, parseInt(e.target.value) || 0))
                              if (simMode === "real") setSimMode("sim")
                              setSimSold(rt.id, selectedDate, v)
                            }}
                            className="w-16 h-8 text-center text-sm"
                          />
                        </div>
                        {simMode === "sim" && simOccupancy[rt.id]?.[selectedDate] !== undefined && (
                          <div className="text-[10px] text-muted-foreground">
                            Reale: {realSold}/{totalRooms} ({totalRooms > 0 ? Math.round((realSold / totalRooms) * 100) : 0}%)
                            {currentSold !== realSold && (
                              <span className={currentSold > realSold ? " text-red-500" : " text-emerald-500"}>
                                {" "}({currentSold > realSold ? "+" : ""}{currentSold - realSold})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Hotel-wide total occupancy with slider */}
                  {(() => {
                    let totalCap = 0, totalSold = 0
                    for (const rt of roomTypes) {
                      const data = occupancyData[rt.id]?.[selectedDate]
                      const rtTotal = data?.total || rt.total_rooms || 0
                      const rtAvail = data?.available ?? rtTotal
                      totalCap += rtTotal
                      totalSold += rtTotal - rtAvail
                    }
                    const hotelPct = totalCap > 0 ? Math.round((totalSold / totalCap) * 100) : 0

                    // Distribute total sold across room types proportionally
                    const setTotalSold = (newTotal: number) => {
                      if (simMode === "real") setSimMode("sim")
                      if (totalCap <= 0) return
                      let remaining = newTotal
                      const sorted = [...roomTypes].sort((a, b) => (b.total_rooms || 1) - (a.total_rooms || 1))
                      for (let i = 0; i < sorted.length; i++) {
                        const rt = sorted[i]
                        const rtTotal = rt.total_rooms || 1
                        const share = i < sorted.length - 1
                          ? Math.round((rtTotal / totalCap) * newTotal)
                          : remaining
                        const clamped = Math.min(rtTotal, Math.max(0, share))
                        setSimSold(rt.id, selectedDate, clamped)
                        remaining -= clamped
                      }
                    }

                    return (
                      <div className="pt-3 border-t mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold">Occupazione Struttura</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${hotelPct >= 90 ? "text-red-600" : hotelPct >= 70 ? "text-orange-600" : "text-emerald-600"}`}>
                              {hotelPct}%
                            </span>
                            <Badge variant="outline" className="text-[10px]">{totalSold}/{totalCap}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[totalSold]}
                            max={totalCap}
                            min={0}
                            step={1}
                            onValueChange={([v]) => setTotalSold(v)}
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            min={0}
                            max={totalCap}
                            value={totalSold}
                            onChange={(e) => {
                              const v = Math.min(totalCap, Math.max(0, parseInt(e.target.value) || 0))
                              setTotalSold(v)
                            }}
                            className="w-16 h-8 text-center text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${hotelPct >= 90 ? "bg-red-500" : hotelPct >= 70 ? "bg-orange-500" : hotelPct >= 50 ? "bg-yellow-500" : "bg-emerald-500"}`}
                              style={{ width: `${hotelPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>

              {/* RIGHT: Computed prices */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    Prezzi Calcolati dall{"'"}Algoritmo
                    {simMode === "sim" && <Badge className="bg-purple-600 text-[10px]">Simulazione</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="p-2 text-left font-medium text-xs">Tipologia</th>
                          <th className="p-2 text-center font-medium text-xs">Base Rate</th>
                          <th className="p-2 text-center font-medium text-xs">Prezzo Algo</th>
                          {simMode === "sim" && <th className="p-2 text-center font-medium text-xs">vs Reale</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {roomTypes.map((rt) => {
                          const baseRateStr = getAlgoParam("base_rate", selectedDate)
                          const baseRateVal = baseRateStr ? Number(baseRateStr) : null
                          const simPrice = calculateSuggestedPrice(rt.id, selectedDate, baseOccupancy)
                          const isRef = rt.id === referenceRoomTypeId

                          // Calculate real price (using real occupancy)
                          let realPrice: number | null = null
                          if (simMode === "sim") {
                            // Temporarily use real data
                            const savedOcc = occupancyData
                            // We cannot easily swap here, so calculate manually
                            realPrice = simPrice // placeholder - we show diff vs base
                          }

                          return (
                            <tr key={rt.id} className={`border-t ${isRef ? "bg-amber-50" : ""}`}>
                              <td className="p-2">
                                <div className="flex items-center gap-1.5">
                                  {isRef && <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">REF</Badge>}
                                  <span className="font-medium text-xs">{rt.name}</span>
                                </div>
                              </td>
                              <td className="p-2 text-center text-xs text-muted-foreground">
                                {baseRateVal ? formatEuro(baseRateVal) : "-"}
                              </td>
                              <td className={`p-2 text-center font-bold ${simMode === "sim" ? "text-purple-700" : "text-foreground"}`}>
                                {simPrice !== null ? formatEuro(simPrice) : "-"}
                              </td>
                              {simMode === "sim" && (
                                <td className="p-2 text-center text-xs">
                                  {simPrice !== null && baseRateVal ? (
                                    <span className={simPrice > baseRateVal ? "text-emerald-600" : simPrice < baseRateVal ? "text-red-600" : "text-muted-foreground"}>
                                      {simPrice > baseRateVal ? "+" : ""}{((simPrice - baseRateVal) / baseRateVal * 100).toFixed(1)}%
                                    </span>
                                  ) : "-"}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Algorithm breakdown for selected date */}
                  <div className="mt-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dettaglio Parametri</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between p-2 rounded bg-muted/30">
                    <span className="text-muted-foreground">Tariffa base</span>
                    <span className="font-medium">{getAlgoParam("base_rate", selectedDate) || "-"}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-muted/30">
                    <span className="text-muted-foreground">Livello domanda</span>
                    <span className="font-medium">
                      {(() => {
                        const gid = simBandGroupOverride[selectedDate] || getAlgoParam("band_group_id", selectedDate)
                        const grp = gid ? bandGroups.find(g => g.id === gid) : bandGroups[0]
                        return grp?.name || "-"
                      })()}
                    </span>
                    </div>
                      <div className="flex justify-between p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground">Domanda (gruppo)</span>
                        <span className="font-medium">
                          {(() => {
                            const gId = getAlgoParam("band_group_id", selectedDate)
                            return bandGroups.find(g => g.id === gId)?.name || "-"
                          })()}
                        </span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground">Last Minute</span>
                        <span className="font-medium">
                          {(() => {
                            const lId = getAlgoParam("last_minute_level_id", selectedDate)
                            const level = lastMinuteLevels.find(l => l.id === lId)
                            // BUGFIX 13/05/2026: usa shared_bands invece di l.discount_pct (sempre 0).
                            if (!level) return "Nessuno"
                            const { discountLabel } = getLmDisplayInfo(level)
                            return `${level.name} (-${discountLabel})`
                          })()}
                        </span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground">LM Finestra</span>
                        <span className="font-medium">{getAlgoParam("last_minute_days", selectedDate) || "-"} gg</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground">NR Sconto</span>
                        <span className="font-medium">{getAlgoParam("not_refundable_discount", selectedDate) || "-"}%</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground">Unita aggiustamento</span>
                        <span className="font-medium">{adjustmentUnit}</span>
                      </div>
                    </div>

                    {/* Active band info */}
                    {(() => {
                      let totalCap = 0, totalSold = 0
                      for (const rt of roomTypes) {
                        const data = occupancyData[rt.id]?.[selectedDate]
                        const rtTotal = data?.total || rt.total_rooms || 0
                        const rtAvail = data?.available ?? rtTotal
                        totalCap += rtTotal
                        totalSold += rtTotal - rtAvail
                      }
                      const hotelOcc = totalCap > 0 ? Math.round((totalSold / totalCap) * 100) : null
                      const fasciaSimGroupId = simBandGroupOverride[selectedDate]
                      const fasciaDayGroupId = fasciaSimGroupId || getAlgoParam("band_group_id", selectedDate)
                      const activeBandGroup = fasciaDayGroupId ? bandGroups.find((g) => g.id === fasciaDayGroupId) : bandGroups[0]
                      const bandsForDay = activeBandGroup?.bands ?? []

                      if (hotelOcc === null || bandsForDay.length === 0) return null

                      const occMode = bandsForDay[0]?.occupancy_mode || "pct"
                      const occValue = occMode === "num" ? totalSold : hotelOcc
                      const activeBand = bandsForDay.find((b) =>
                        occMode === "pct"
                          ? occValue >= b.min_pct && occValue <= b.max_pct
                          : occValue >= (b.min_num ?? 0) && occValue <= (b.max_num ?? 0)
                      )

                      return (
                        <div className="p-3 rounded-lg border bg-blue-50/50 border-blue-200">
                          <div className="text-xs font-semibold text-blue-800 mb-1">Fascia Occupazione Attiva</div>
                          {activeBand ? (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-blue-700">
                                {activeBand.label || `Fascia ${bandsForDay.indexOf(activeBand) + 1}`}
                                {" "}({occMode === "num" ? `${activeBand.min_num}-${activeBand.max_num} camere` : `${activeBand.min_pct}%-${activeBand.max_pct}%`})
                              </span>
                              <Badge className="bg-blue-600 text-[10px]">
                                {activeBand.increment_pct > 0 ? "+" : ""}{activeBand.increment_pct}%
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Nessuna fascia corrispondente per occ. {hotelOcc}%</span>
                          )}
                        </div>
                      )
                    })()}

                    {/* Price Curve Chart: price as function of occupancy for selected room type */}
                    {(() => {
                      const selectedChartRtId = chartRoomTypeId || referenceRoomTypeId
                      const selectedChartRt = roomTypes.find(r => r.id === selectedChartRtId)
                      if (!selectedChartRt) return null

                      let totalCap = 0
                      for (const rt of roomTypes) {
                        const data = occupancyData[rt.id]?.[selectedDate]
                        totalCap += data?.total || rt.total_rooms || 0
                      }
                      if (totalCap === 0) return null

                      // Current hotel occupancy
                      let curSold = 0
                      for (const rt of roomTypes) {
                        const data = occupancyData[rt.id]?.[selectedDate]
                        const rtTotal = data?.total || rt.total_rooms || 0
                        const rtAvail = data?.available ?? rtTotal
                        curSold += rtTotal - rtAvail
                      }
                      const curPct = Math.round((curSold / totalCap) * 100)

                      // Build chart data using calculateSuggestedPrice for the selected room type
                      // We simulate different occupancy levels by temporarily overriding
                      // Tipo allargato:
                      //   `price`       = prezzo effettivo (K-driven o LM)
                      //   `basePrice`   = K-driven puro (per tooltip)
                      //   `lmPrice`     = prezzo scontato (solo se LM attivo)
                      //   `lmThresholdPrice` = popolato SOLO sui punti di
                      //                  transizione no-LM -> LM, per disegnare
                      //                  il puntino rosso "soglia attivazione".
                      const chartData: {
                        occ: number
                        price: number | null
                        basePrice: number
                        lmPrice: number | null
                        lmThresholdPrice: number | null
                        label: string
                        lmActive: boolean
                        lmLevelName: string
                        lmDiscountPct: number
                      }[] = []
                      const steps = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]

                      const baseRateStr = getAlgoParam("base_rate", selectedDate)
                      let baseRateVal = baseRateStr ? Number(baseRateStr) : 0
                      if (!baseRateVal || baseRateVal <= 0) {
                        const gridKey = `${referenceRoomTypeId}_${referenceRateId}_${baseOccupancy}`
                        baseRateVal = gridPrices[gridKey]?.[selectedDate] || 0
                      }
                      if (baseRateVal <= 0) return null

                      const chartSimGroupId = simBandGroupOverride[selectedDate]
                      const chartDayGroupId = chartSimGroupId || getAlgoParam("band_group_id", selectedDate)
                      const activeBG = chartDayGroupId ? bandGroups.find((g) => g.id === chartDayGroupId) : bandGroups[0]
                      const bands = activeBG?.bands ?? []

                      for (const occPct of steps) {
                        let simPrice = baseRateVal

                        // 1. Apply band increment based on this occ%
                        if (bands.length > 0) {
                          const occMode = bands[0]?.occupancy_mode || "pct"
                          const incMode = bands[0]?.increment_mode || "pct"
                          const occVal = occMode === "num" ? Math.round((occPct / 100) * totalCap) : occPct
                          const band = bands.find((b) =>
                            occMode === "pct"
                              ? occVal >= b.min_pct && occVal <= b.max_pct
                              : occVal >= (b.min_num ?? 0) && occVal <= (b.max_num ?? 0)
                          )
                          if (band) {
                            const bandIdx = bands.indexOf(band)
                            const manualIncStr = getAlgoParam(`increment_band_${bandIdx}`, selectedDate)
                            const defaultInc = incMode === "eur" ? Number(band.increment_eur ?? 0) : Number(band.increment_pct ?? 0)
                            const incrementVal = manualIncStr !== "" ? Number(manualIncStr) : defaultInc
                            if (!isNaN(incrementVal) && incrementVal !== 0) {
                              simPrice = incMode === "eur" ? simPrice + incrementVal : simPrice * (1 + incrementVal / 100)
                            }
                          }
                        }

                        // 2. Room type adjustment (if not reference)
                        const targetRtIdx = roomTypes.findIndex(rt => rt.id === selectedChartRtId)
                        if (targetRtIdx !== -1 && targetRtIdx !== referenceRoomTypeIndex) {
                          if (targetRtIdx > referenceRoomTypeIndex) {
                            for (let ri = referenceRoomTypeIndex + 1; ri <= targetRtIdx; ri++) {
                              const rtAdjStr = getAlgoParam(`room_type_adj_${roomTypes[ri].id}`, selectedDate)
                              if (rtAdjStr && !isNaN(Number(rtAdjStr))) {
                                const rtAdj = Number(rtAdjStr)
                                simPrice = adjustmentUnit === "EUR" ? simPrice + rtAdj : simPrice * (1 + rtAdj / 100)
                              }
                            }
                          } else {
                            for (let ri = referenceRoomTypeIndex - 1; ri >= targetRtIdx; ri--) {
                              const rtAdjStr = getAlgoParam(`room_type_adj_${roomTypes[ri].id}`, selectedDate)
                              if (rtAdjStr && !isNaN(Number(rtAdjStr))) {
                                const rtAdj = Number(rtAdjStr)
                                simPrice = adjustmentUnit === "EUR" ? simPrice - Math.abs(rtAdj) : simPrice * (1 - Math.abs(rtAdj) / 100)
                              }
                            }
                          }
                        }

                        // Clamp PRIMA del calcolo LM: la curva base (K-driven +
                        // bande di occupazione) e' quella che il tenant vede sempre.
                        // Il LM si visualizza come overlay (puntini rossi) per
                        // mostrare DOVE scatta, senza deformare la curva di base.
                        const limit = getRateLimit(selectedChartRtId)
                        if (limit) {
                          if (limit.bottom_rate && simPrice < limit.bottom_rate) simPrice = limit.bottom_rate
                          if (limit.rack_rate && simPrice > limit.rack_rate) simPrice = limit.rack_rate
                        }
                        const basePrice = simPrice

                        // 3. Last minute (simulated) — calcolato SEPARATAMENTE
                        // come overlay: non modifichiamo la curva base.
                        let lmActive = false
                        let lmLevelName = ""
                        let lmDiscountPct = 0
                        let lmPrice = basePrice
                        const chartLmDays = simLmDays !== null ? simLmDays : Number(getAlgoParam("last_minute_days", selectedDate) || 0)
                        const chartLmLevelId = simLmLevelId !== null ? simLmLevelId : getAlgoParam("last_minute_level_id", selectedDate)
                        if (chartLmDays > 0 && chartLmLevelId) {
                          const level = lastMinuteLevels.find(l => l.id === chartLmLevelId)
                          // BUGFIX 13/05/2026: lo schema legacy (level.discount_pct,
                          // min_occupancy_num/max_occupancy_num) e' a 0 in DB.
                          // Lo sconto last-minute reale vive in shared_bands per banda
                          // di camere disponibili. Stessa logica usata in
                          // /accelerator/pricing/page.tsx (riga ~1190-1198).
                          if (level) {
                            const daysUntil = Math.floor((new Date(selectedDate).getTime() - new Date().getTime()) / 86400000)
                            if (daysUntil >= 0 && daysUntil <= chartLmDays) {
                              const remainingRooms = Math.round(totalCap * (1 - occPct / 100))
                              const band = getLmBandForRooms(level, remainingRooms)
                              if (band && band.discount_pct > 0) {
                                lmPrice = basePrice * (1 - band.discount_pct / 100)
                                // Riapplica clamp solo al prezzo LM (non puo'
                                // scendere sotto bottom_rate).
                                if (limit?.bottom_rate && lmPrice < limit.bottom_rate) lmPrice = limit.bottom_rate
                                lmActive = true
                                lmLevelName = level.name || ""
                                lmDiscountPct = band.discount_pct
                              }
                            }
                          }
                        }

                        // `price` = prezzo EFFETTIVO che il tenant vedrebbe:
                        //   - se LM non e' attivo: K-driven puro (basePrice)
                        //   - se LM e' attivo: prezzo scontato (lmPrice)
                        // Cosi' la curva e' una linea unica che si "tuffa"
                        // quando entra in una banda LM e ritorna su quando esce,
                        // come da indicazioni utente.
                        const effectivePrice = lmActive ? lmPrice : basePrice

                        chartData.push({
                          occ: occPct,
                          price: Math.round(effectivePrice),
                          basePrice: Math.round(basePrice),
                          lmPrice: lmActive ? Math.round(lmPrice) : null,
                          // Verra' popolato sotto solo per i punti di TRANSIZIONE
                          // no-LM -> LM (soglia di attivazione).
                          lmThresholdPrice: null as number | null,
                          label: `${occPct}%`,
                          lmActive,
                          lmLevelName,
                          lmDiscountPct,
                        })
                      }

                      // Post-pass: identifica i punti di TRANSIZIONE (no-LM ->
                      // LM) e marcali con un puntino rosso. Sono i veri "momenti
                      // di attivazione" del Last-Minute lungo la curva.
                      for (let i = 0; i < chartData.length; i++) {
                        const prev = chartData[i - 1]
                        const cur = chartData[i]
                        const enteringLm = cur.lmActive && (!prev || !prev.lmActive)
                        if (enteringLm) {
                          cur.lmThresholdPrice = cur.price
                        }
                      }

                      const curPrice = calculateSuggestedPrice(selectedChartRtId, selectedDate, baseOccupancy)
                      const minPrice = Math.min(...chartData.map(d => d.price ?? 0).filter(Boolean))
                      const maxPrice = Math.max(...chartData.map(d => d.price ?? 0).filter(Boolean))

                      // Band boundaries for reference lines
                      const bandBoundaries = bands.map((b) => ({
                        pct: b.min_pct,
                        label: b.label || `${b.min_pct}%`,
                      })).filter(b => b.pct > 0)

                      return (
                        <div className="mt-4 p-3 rounded-lg border bg-background">
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="h-4 w-4 text-purple-600" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Curva Tariffaria vs Occupazione
                            </span>
                            <Badge variant="outline" className="text-[9px] ml-auto">
                              {selectedChartRt.name}
                              {selectedChartRtId === referenceRoomTypeId && " (Rif.)"}
                            </Badge>
                          </div>
                          <ResponsiveContainer width="100%" height={220}>
                            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                              <defs>
                                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="occ"
                                tickFormatter={(v) => `${v}%`}
                                tick={{ fontSize: 10, fill: "#6b7280" }}
                                axisLine={{ stroke: "#d1d5db" }}
                              />
                              <YAxis
                                tick={{ fontSize: 10, fill: "#6b7280" }}
                                tickFormatter={(v) => `${v}`}
                                axisLine={{ stroke: "#d1d5db" }}
                                domain={[Math.floor(minPrice * 0.9), Math.ceil(maxPrice * 1.05)]}
                              />
                              <RechartsTooltip
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                                content={({ active, payload }) => {
                                  if (!active || !payload || payload.length === 0) return null
                                  const p: any = payload[0]?.payload
                                  if (!p) return null
                                  return (
                                    <div className="rounded-md border bg-background px-2.5 py-2 shadow-sm text-[11px] space-y-0.5">
                                      <div className="font-medium text-foreground">
                                        Occupazione: {p.occ}%
                                      </div>
                                      {p.lmActive ? (
                                        <>
                                          <div className="text-muted-foreground line-through">
                                            K-driven: {Number(p.basePrice).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                                          </div>
                                          <div className="font-semibold text-red-700 dark:text-red-400">
                                            Prezzo LM: {Number(p.price).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                                          </div>
                                          <div className="mt-1 flex items-center gap-1.5 rounded bg-red-50 px-1.5 py-0.5 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                                            <span className="font-semibold">
                                              {p.lmThresholdPrice != null ? "Last-minute si attiva qui" : "Last-minute attivo"}
                                            </span>
                                            {p.lmLevelName && <span>· {p.lmLevelName}</span>}
                                            {p.lmDiscountPct > 0 && <span>· -{p.lmDiscountPct}%</span>}
                                          </div>
                                        </>
                                      ) : (
                                        <div className="font-semibold text-purple-700 dark:text-purple-400">
                                          Prezzo K-driven: {Number(p.price).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                                        </div>
                                      )}
                                    </div>
                                  )
                                }}
                              />
                              {/* Band boundary lines */}
                              {bandBoundaries.map((b, i) => (
                                <ReferenceLine key={i} x={b.pct} stroke="#93c5fd" strokeDasharray="4 4" strokeWidth={1} />
                              ))}
                              {/* Current occupancy marker */}
                              <ReferenceLine x={curPct} stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" label={{ value: `Attuale ${curPct}%`, position: "top", fontSize: 10, fill: "#7c3aed" }} />
                              {/* Curva base: K-driven + bande di occupazione,
                                  SENZA sconto Last-Minute. La curva resta pulita
                                  e mostra la "logica di pricing struttura". */}
                              <Area
                                type="stepAfter"
                                dataKey="price"
                                stroke="#7c3aed"
                                strokeWidth={2}
                                fill="url(#priceGrad)"
                                dot={false}
                                activeDot={(props: any) => {
                                  const { cx, cy, key } = props
                                  return (
                                    <circle
                                      key={key}
                                      cx={cx}
                                      cy={cy}
                                      r={4}
                                      fill="#7c3aed"
                                      stroke="#fff"
                                      strokeWidth={2}
                                    />
                                  )
                                }}
                              />
                              {/* Overlay Last-Minute: puntini rossi posizionati
                                  sulla curva K-driven dove lo sconto si ATTIVA.
                                  Non disegnamo una seconda curva per non confondere
                                  visivamente la "logica di base" del motore. */}
                              {chartData.some(d => d.lmThresholdPrice != null) && (
                                <Scatter
                                  dataKey="lmThresholdPrice"
                                  fill="#ef4444"
                                  // Dot rosso = SOGLIA di attivazione del Last
                                  // Minute (transizione no-LM -> LM). Da quel
                                  // punto in poi la curva segue la logica LM.
                                  shape={
                                    ((props: { cx?: number; cy?: number; payload?: { lmThresholdPrice?: number | null } }) => {
                                      const { cx, cy, payload } = props
                                      if (payload?.lmThresholdPrice == null || cx == null || cy == null) {
                                        return <g />
                                      }
                                      return (
                                        <g>
                                          {/* Halo per renderlo piu' visibile */}
                                          <circle cx={cx} cy={cy} r={9} fill="#ef4444" opacity={0.15} />
                                          <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="#fff" strokeWidth={2} />
                                        </g>
                                      )
                                    }) as never
                                  }
                                  isAnimationActive={false}
                                />
                              )}
                              {/* Current price dot */}
                              {curPrice !== null && (
                                <ReferenceDot x={curPct} y={curPrice} r={6} fill="#7c3aed" stroke="#fff" strokeWidth={2} />
                              )}
                            </ComposedChart>
                          </ResponsiveContainer>
                          <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                            <span>Min: {formatEuro(minPrice)}</span>
                            <span className="font-semibold text-purple-700">Attuale: {curPrice ? formatEuro(curPrice) : "-"} @ {curPct}%</span>
                            <span>Max: {formatEuro(maxPrice)}</span>
                          </div>
                          {/* Legenda inline: la curva e' la tariffa effettiva.
                              Segue il K-driven (o bande di occupazione) fino
                              alla soglia rossa, da li' segue le indicazioni del
                              Last-Minute. */}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground border-t pt-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block h-0.5 w-4 bg-purple-600" />
                              <span>Tariffa (K-driven / bande)</span>
                            </div>
                            {chartData.some(d => d.lmThresholdPrice != null) && (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                                <span>Soglia attivazione Last-Minute</span>
                              </div>
                            )}
                            {chartData.some(d => d.lmActive) && (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-block h-0.5 w-4 bg-red-500" />
                                <span>Da qui la curva segue il Last-Minute</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Multi-date overview table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Panoramica Mese</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="p-1.5 text-left font-medium sticky left-0 bg-muted/50 z-10">Tipologia</th>
                      {production.map((day) => (
                        <th
                          key={day.date}
                          className={`p-1 text-center font-medium min-w-[44px] cursor-pointer hover:bg-primary/10 transition-colors ${day.isWeekend ? "bg-orange-50" : ""} ${day.isToday ? "bg-primary/10" : ""} ${day.date === selectedDate ? "ring-2 ring-primary ring-inset" : ""}`}
                          onClick={() => setSelectedDate(day.date)}
                        >
                          <div className="text-[9px] uppercase">{day.dayOfWeek}</div>
                          <div>{format(new Date(day.date + "T12:00:00"), "d")}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Hotel occupancy row */}
                    <tr className="bg-indigo-50/50">
                      <td className="p-1.5 font-bold text-indigo-800 sticky left-0 bg-indigo-50/50 z-10">Occ. Struttura %</td>
                      {production.map((day) => {
                        let totalCap = 0, totalSold = 0
                        for (const rt of roomTypes) {
                          const data = occupancyData[rt.id]?.[day.date]
                          const rtTotal = data?.total || rt.total_rooms || 0
                          const rtAvail = data?.available ?? rtTotal
                          totalCap += rtTotal
                          totalSold += rtTotal - rtAvail
                        }
                        const pct = totalCap > 0 ? Math.round((totalSold / totalCap) * 100) : null
                        return (
                          <td key={day.date} className={`p-1 text-center font-bold ${pct !== null ? (pct >= 90 ? "text-red-700 bg-red-50" : pct >= 70 ? "text-orange-700 bg-orange-50/60" : "text-indigo-700") : "text-muted-foreground"}`}>
                            {pct !== null ? `${pct}%` : "-"}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Price per room type */}
                    {roomTypes.map((rt) => {
                      const isRef = rt.id === referenceRoomTypeId
                      return (
                        <tr key={rt.id} className={`border-t ${isRef ? "bg-amber-50/50" : ""}`}>
                          <td className={`p-1.5 font-medium sticky left-0 z-10 ${isRef ? "bg-amber-50/50 text-amber-800" : "bg-background"}`}>
                            {rt.name}
                          </td>
                          {production.map((day) => {
                            const price = calculateSuggestedPrice(rt.id, day.date, baseOccupancy)
                            return (
                              <td key={day.date} className={`p-1 text-center ${day.date === selectedDate ? "ring-2 ring-primary ring-inset" : ""} ${day.isWeekend ? "bg-orange-50/30" : ""}`}>
                                {price !== null ? price.toFixed(0) : "-"}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </div>
      
    </div>
  )
}
