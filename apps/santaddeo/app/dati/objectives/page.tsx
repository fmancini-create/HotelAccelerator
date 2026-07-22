"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, Save, RefreshCw, Target, TrendingUp, TrendingDown, Minus, Filter, Settings2, ArrowRight, Info } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { ProductionLegendIntro } from "@/components/objectives/production-legend-intro"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import Link from "next/link"
import { useVatView } from "@/lib/contexts/vat-view-context"

interface MonthData {
  month: number
  monthLabel: string
  produzioneAdOggi: number
  produzioneTotale: number
  prevYearProduction: number
  obiettivo: number
  delta: number
  revpar: number
  revpor: number
  prevYearRevpor: number
  deltaRevpor: number
  coefficienteRevenue: number
  occupancyPct: number
  prevYearOccupancyPct: number
  camereVendute: number
  camereInvendute: number
  camereDisponibili: number
  prevYearCamereVendute: number
  prevYearCamereDisponibili: number
  remainingUnsold: number
  percentualeInvendutoPrevisionale: number
  prevYearPercInvenduto: number
  revporTarget: number
  roomsExpectedToSell: number
}

/**
 * Valuta quanto e' REALISTICAMENTE raggiungibile il RevPor Target.
 *
 * Idea: il target e' il prezzo medio/camera richiesto sulle notti rimaste per
 * chiudere il gap di budget. Per capire se e' fattibile lo confrontiamo con un
 * prezzo davvero ottenibile e CERTO: il RevPor effettivamente realizzato lo
 * stesso periodo dell'anno scorso (benchmark stagionale, proven). Se manca lo
 * storico ripieghiamo sul RevPor che stai gia' ottenendo quest'anno.
 *
 * ratio = revporTarget / benchmark  (quanto sopra/sotto il proven)
 *
 * Restituisce null quando non e' valutabile (nessun obiettivo, o nessun
 * benchmark di prezzo disponibile) -> in quel caso non mostriamo il badge,
 * per non inventare un giudizio su dati assenti.
 */
type FeasibilityLevel = {
  key: "reached" | "easy" | "ok" | "hard" | "veryhard" | "impossible" | "norooms"
  label: string
  badgeClass: string
  ratio: number | null
  benchmark: number
  benchmarkSource: "storico" | "attuale" | null
  description: string
}

function assessFeasibility(m: MonthData): FeasibilityLevel | null {
  // Nessun budget impostato -> niente da valutare.
  if (!m.obiettivo || m.obiettivo <= 0) return null

  // Budget gia' raggiunto/superato: nessun gap residuo.
  if (m.delta <= 0) {
    return {
      key: "reached",
      label: "Obiettivo raggiunto",
      badgeClass: "border-green-300 bg-green-100 text-green-800",
      ratio: null,
      benchmark: 0,
      benchmarkSource: null,
      description: "La produzione ha gia' centrato (o superato) il budget del mese.",
    }
  }

  // C'e' ancora un gap ma non restano camere vendibili (mese finito o sold-out
  // sulle notti future): il target non e' piu' materialmente raggiungibile.
  if (m.remainingUnsold <= 0 || m.roomsExpectedToSell <= 0) {
    return {
      key: "norooms",
      label: "Non più raggiungibile",
      badgeClass: "border-red-300 bg-red-100 text-red-800",
      ratio: null,
      benchmark: 0,
      benchmarkSource: null,
      description: "Non restano camere vendibili da qui a fine mese per recuperare il gap di budget.",
    }
  }

  // Benchmark di prezzo reale: prima lo storico stesso periodo, poi l'attuale.
  let benchmark = 0
  let benchmarkSource: "storico" | "attuale" | null = null
  if (m.prevYearRevpor > 0) {
    benchmark = m.prevYearRevpor
    benchmarkSource = "storico"
  } else if (m.revpor > 0) {
    benchmark = m.revpor
    benchmarkSource = "attuale"
  }

  // Nessun benchmark certo -> non esprimiamo un giudizio inventato.
  if (!benchmark || benchmark <= 0 || m.revporTarget <= 0) return null

  const ratio = m.revporTarget / benchmark
  const srcLabel = benchmarkSource === "storico" ? "RevPor dello stesso periodo dell'anno scorso" : "RevPor che stai ottenendo quest'anno"
  const pct = Math.round((ratio - 1) * 100)
  const vsText =
    pct === 0
      ? `in linea con il ${srcLabel}`
      : pct > 0
        ? `${pct}% sopra il ${srcLabel}`
        : `${Math.abs(pct)}% sotto il ${srcLabel}`

  if (ratio <= 0.85) {
    return {
      key: "easy",
      label: "Facilmente raggiungibile",
      badgeClass: "border-green-300 bg-green-100 text-green-800",
      ratio, benchmark, benchmarkSource,
      description: `Il prezzo richiesto e' ${vsText}: hai ampio margine.`,
    }
  }
  if (ratio <= 1.1) {
    return {
      key: "ok",
      label: "Raggiungibile",
      badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-800",
      ratio, benchmark, benchmarkSource,
      description: `Il prezzo richiesto e' ${vsText}: obiettivo alla portata mantenendo la rotta.`,
    }
  }
  if (ratio <= 1.3) {
    return {
      key: "hard",
      label: "Difficilmente raggiungibile",
      badgeClass: "border-amber-300 bg-amber-50 text-amber-800",
      ratio, benchmark, benchmarkSource,
      description: `Il prezzo richiesto e' ${vsText}: serve spingere tariffe e/o vendere piu' camere del previsto.`,
    }
  }
  if (ratio <= 1.6) {
    return {
      key: "veryhard",
      label: "Molto difficile",
      badgeClass: "border-orange-300 bg-orange-100 text-orange-800",
      ratio, benchmark, benchmarkSource,
      description: `Il prezzo richiesto e' ${vsText}: raggiungibile solo con una domanda eccezionale.`,
    }
  }
  return {
    key: "impossible",
    label: "Non raggiungibile",
    badgeClass: "border-red-300 bg-red-100 text-red-800",
    ratio, benchmark, benchmarkSource,
    description: `Il prezzo richiesto e' ${vsText}: fuori dai valori storicamente ottenibili. Valuta di rivedere il budget o la % di invenduto previsto.`,
  }
}

export default function DebugObjectivesPage() {
  const { vatView } = useVatView()
  const [year, setYear] = useState(new Date().getFullYear())
  const [months, setMonths] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterAdOggi, setFilterAdOggi] = useState(false)
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set())
  const [showStatusFilter, setShowStatusFilter] = useState(false)
  // Codice del connettore PMS attivo per l'hotel selezionato (es. "scidoo",
  // "bedzzle", "brig"). Usato per scegliere il testo della legenda corretto:
  // ogni PMS espone i prezzi in modo diverso e la spiegazione cambia.
  const [connector, setConnector] = useState<string>("unknown")


  // Editable fields per month
  const [editObiettivi, setEditObiettivi] = useState<Record<number, string>>({})
  const [editPercInvenduto, setEditPercInvenduto] = useState<Record<number, string>>({})

  useEffect(() => {
    loadUserHotel()
  }, [])

  const loadData = useCallback(async () => {
    if (!hotelId) return
    setLoading(true)

    try {
      const filterParam = filterAdOggi ? "&filter=ad_oggi" : ""
      const statusParam = selectedStatuses.size > 0 ? `&statuses=${Array.from(selectedStatuses).join(",")}` : ""
      const vatParam = vatView ? `&vatView=${vatView}` : ""
      const res = await fetch(`/api/dati/objectives?hotel_id=${hotelId}&year=${year}${filterParam}${statusParam}${vatParam}`)
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login"
          return
        }
        throw new Error(`Errore ${res.status}`)
      }

      const data = await res.json()
      setMonths(data.months || [])
      if (data.availableStatuses?.length > 0) {
        setAvailableStatuses(data.availableStatuses)
      }
      if (typeof data.connector === "string") {
        setConnector(data.connector)
      }

      // Init editable fields
      const obi: Record<number, string> = {}
      const perc: Record<number, string> = {}
      for (const m of data.months || []) {
        // Budget a euro interi: niente decimali/virgola nell'input
        // (es. budget annuo ÷ mesi = 70909.0909 -> 70909).
        obi[m.month] = m.obiettivo > 0 ? String(Math.round(m.obiettivo)) : ""
        perc[m.month] = String(m.percentualeInvendutoPrevisionale)
      }
      setEditObiettivi(obi)
      setEditPercInvenduto(perc)


    } catch (error) {
      console.error("Error loading objectives:", error)
    } finally {
      setLoading(false)
    }
  }, [hotelId, year, filterAdOggi, selectedStatuses, vatView])

  useEffect(() => {
    if (hotelId) {
      loadData()
    }
  }, [hotelId, year, filterAdOggi, selectedStatuses, vatView, loadData])

  async function loadUserHotel() {
    try {
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

  async function saveAll() {
    if (!hotelId) return
    setSaving(true)

    try {
      const monthsPayload = months.map(m => ({
        month: m.month,
        obiettivo_produzione: parseFloat(editObiettivi[m.month] || "0") || 0,
        percentuale_invenduto_previsionale: parseFloat(editPercInvenduto[m.month] || "10") || 10,
      }))

      const res = await fetch("/api/dati/objectives", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          year,
          months: monthsPayload,
          // La vista IVA corrente: il server ri-lorda i valori netti prima di
          // salvarli (storage canonico lordo). Vedi fix round-trip 22/06/2026.
          vatView,
        }),
      })

      if (!res.ok) throw new Error("Errore nel salvataggio")

      // Reload to get updated calculations
      await loadData()
    } catch (error) {
      console.error("Error saving objectives:", error)
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount)

  const formatCurrencyDecimals = (amount: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)

  const currentMonth = new Date().getMonth() + 1

  // Compute annual totals
  const annualProduction = months.reduce((s, m) => s + (filterAdOggi ? m.produzioneAdOggi : m.produzioneTotale), 0)
  const annualPrevYearProduction = months.reduce((s, m) => s + m.prevYearProduction, 0)
  const annualObiettivo = months.reduce((s, m) => s + m.obiettivo, 0)
  const annualDelta = annualObiettivo - annualProduction
  const annualSold = months.reduce((s, m) => s + m.camereVendute, 0)
  const annualCapacity = months.reduce((s, m) => s + m.camereDisponibili, 0)
  const annualRevpar = annualCapacity > 0 ? annualProduction / annualCapacity : 0
  const annualRevpor = annualSold > 0 ? annualProduction / annualSold : 0
  const annualOccupancy = annualCapacity > 0 ? (annualSold / annualCapacity) * 100 : 0
  const annualPrevYearSold = months.reduce((s, m) => s + (m.prevYearCamereVendute || 0), 0)
  const annualPrevYearCapacity = months.reduce((s, m) => s + (m.prevYearCamereDisponibili || 0), 0)
  const annualRemainingUnsold = months.reduce((s, m) => s + (m.remainingUnsold || 0), 0)
  const annualPrevYearRevpar = annualPrevYearCapacity > 0 ? annualPrevYearProduction / annualPrevYearCapacity : 0
  const annualPrevYearRevpor = annualPrevYearSold > 0 ? annualPrevYearProduction / annualPrevYearSold : 0
  const annualPrevYearOccupancy = annualPrevYearCapacity > 0 ? (annualPrevYearSold / annualPrevYearCapacity) * 100 : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Obiettivi di Revenue</h1>
          <p className="text-sm text-muted-foreground mt-1">{`${hotelName} - Budget, produzione e KPI mensili`}</p>
        </div>
      </div>

      <main className="p-6">
        <div className="mx-auto max-w-[1800px] space-y-4">
          {/* Year selector */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target className="h-5 w-5 text-blue-600" />
                  <CardTitle>Tabella Obiettivi</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setYear(y => y - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-bold text-lg min-w-20 text-center">{year}</span>
                  <Button variant="outline" size="icon" onClick={() => setYear(y => y + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={filterAdOggi ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterAdOggi(f => !f)}
                    className={`ml-4 ${filterAdOggi ? "" : "bg-transparent"}`}
                    title={filterAdOggi ? "Mostra produzione totale del mese" : "Filtra produzione e dati ad oggi"}
                  >
                    <Filter className="h-4 w-4 mr-1" />
                    {filterAdOggi ? "Ad Oggi" : "Totale Mese"}
                  </Button>
                  {availableStatuses.length > 0 && (
                    <Button
                      variant={selectedStatuses.size > 0 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowStatusFilter(f => !f)}
                      className={`ml-2 ${selectedStatuses.size > 0 ? "" : "bg-transparent"}`}
                      title="Filtra per stato prenotazione"
                    >
                      <Settings2 className="h-4 w-4 mr-1" />
                      {selectedStatuses.size > 0
                        ? `${selectedStatuses.size} stati`
                        : "Filtra Stati"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={loadData} className="ml-2 bg-transparent">
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Aggiorna
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveAll}
                    disabled={saving}
                    className="ml-2"
                  >
                    {saving ? (
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    {saving ? "Salvataggio..." : "Salva Tutto"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Mode info banner */}
              <div className={`mb-4 rounded-lg px-4 py-2 text-sm ${filterAdOggi ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-100 text-muted-foreground border border-gray-200"}`}>
                {filterAdOggi
                  ? "Modalita AD OGGI: Anno corrente completo (tutto l'OTB in casa). Anno precedente: tutte le prenotazioni ricevute fino alla data di oggi, di un anno fa (booking date) — fotografia di quello che c'era di prenotazioni un anno fa, alla stessa data di oggi."
                  : "Modalita TOTALE MESE: Produzione totale del mese (tutte le prenotazioni confermate/partite in casa). Anno precedente: mese intero."}
              </div>
              {/* Status filter panel */}
              {showStatusFilter && availableStatuses.length > 0 && (
                <div className="mb-4 rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold">Filtra per stato prenotazione</h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedStatuses(new Set(availableStatuses))}
                        className="text-xs text-primary hover:underline"
                      >
                        Seleziona tutti
                      </button>
                      <span className="text-muted-foreground text-xs">|</span>
                      <button
                        onClick={() => setSelectedStatuses(new Set())}
                        className="text-xs text-primary hover:underline"
                      >
                        Deseleziona tutti
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableStatuses.map(status => {
                      const isSelected = selectedStatuses.has(status)
                      const statusConfig: Record<string, { code: string; label: string; color: string }> = {
                        opzione:            { code: "DC",  label: "Opzione - Da Confermare",       color: "bg-gray-500" },
                        attesa_pagamento:   { code: "CSG", label: "In Attesa di Pagamento",        color: "bg-yellow-500" },
                        confermata_manuale: { code: "CM",  label: "Confermata Manualmente",        color: "bg-orange-500" },
                        confermata_pagamento: { code: "CCA", label: "Confermata con Pagamento",    color: "bg-orange-600" },
                        confermata_carta:   { code: "CCC", label: "Confermata con Carta di Credito", color: "bg-red-500" },
                        check_in:           { code: "AS",  label: "Arrivata nella Struttura",      color: "bg-green-500" },
                        saldo:              { code: "PS",  label: "Prenotazione Saldata",          color: "bg-blue-500" },
                        check_out:          { code: "CH",  label: "Check-out Eseguito",            color: "bg-indigo-500" },
                      }
                      const cfg = statusConfig[status] || { code: status.slice(0, 3).toUpperCase(), label: status, color: "bg-gray-400" }
                      return (
                        <button
                          key={status}
                          onClick={() => {
                            setSelectedStatuses(prev => {
                              const next = new Set(prev)
                              if (next.has(status)) {
                                next.delete(status)
                              } else {
                                next.add(status)
                              }
                              return next
                            })
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                            isSelected
                              ? "bg-muted border-primary ring-1 ring-primary/30 text-foreground"
                              : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                          }`}
                        >
                          <span className={`inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold text-white ${cfg.color}`}>
                            {cfg.code}
                          </span>
                          {cfg.label}
                        </button>
                      )
                    })}
                  </div>
                  {selectedStatuses.size > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Filtro attivo: i dati mostrano solo le prenotazioni con gli stati selezionati. Deseleziona tutto per vedere tutti i non-annullati.
                    </p>
                  )}
                </div>
              )}

              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Caricamento dati...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border p-2 text-left sticky left-0 bg-muted z-10 min-w-[110px]">
                          <div className="font-bold">A</div>
                          <div className="text-xs text-muted-foreground font-normal">Mese</div>
                        </th>
                        <th className="border p-2 text-right min-w-[110px]">
                          <div className="font-bold">B</div>
                          <div className="text-xs text-muted-foreground font-normal">
                            {filterAdOggi ? "Produzione ad oggi" : "Produzione Totale"}
                          </div>
                        </th>
                        <th className="border p-2 text-center min-w-[130px] bg-blue-50">
                          <div className="font-bold text-blue-700">C</div>
                          <div className="text-xs text-blue-600 font-normal">Obiettivo Budget</div>
                        </th>
                        <th className="border p-2 text-right min-w-[110px]">
                          <div className="font-bold">D</div>
                          <div className="text-xs text-muted-foreground font-normal">Delta Budget</div>
                        </th>
                        <th className="border p-2 text-right min-w-[120px]">
                          <div className="font-bold">DP</div>
                          <div className="text-xs text-muted-foreground font-normal">Delta Budget Progressivo</div>
                        </th>
                        <th className="border p-2 text-right min-w-[90px]">
                          <div className="font-bold">E</div>
                          <div className="text-xs text-muted-foreground font-normal">RevPar</div>
                        </th>
                        <th className="border p-2 text-right min-w-[90px]">
                          <div className="font-bold">F</div>
                          <div className="text-xs text-muted-foreground font-normal">RevPor</div>
                        </th>
                        <th className="border p-2 text-right min-w-[100px]">
                          <div className="font-bold">G</div>
                          <div className="text-xs text-muted-foreground font-normal">Delta RevPor YoY</div>
                        </th>
                        <th className="border p-2 text-right min-w-[90px]">
                          <div className="font-bold">H</div>
                          <div className="text-xs text-muted-foreground font-normal">Coeff. Revenue</div>
                        </th>
                        <th className="border p-2 text-right min-w-[80px]">
                          <div className="font-bold">I</div>
                          <div className="text-xs text-muted-foreground font-normal">% Occupazione</div>
                        </th>
                        <th className="border p-2 text-right min-w-[80px]">
                          <div className="font-bold">J</div>
                          <div className="text-xs text-muted-foreground font-normal">Cam. Vendute</div>
                        </th>
                        <th className="border p-2 text-right min-w-[80px]">
                          <div className="font-bold">K</div>
                          <div className="text-xs text-muted-foreground font-normal">Cam. Invendute</div>
                        </th>
                        <th className="border p-2 text-right min-w-[80px]">
                          <div className="font-bold">L</div>
                          <div className="text-xs text-muted-foreground font-normal">Cam. Disponibili</div>
                        </th>
                        <th className="border p-2 text-right min-w-[100px] bg-green-50">
                          <div className="font-bold text-green-700">O</div>
                          <div className="text-xs text-green-600 font-normal">Cam. Disponibili alla Vendita</div>
                        </th>
                        <th className="border p-2 text-center min-w-[110px] bg-amber-50">
                          <div className="font-bold text-amber-700">M</div>
                          <div className="text-xs text-amber-600 font-normal">RevPor Target</div>
                        </th>
                        <th className="border p-2 text-center min-w-[110px] bg-amber-50">
                          <div className="font-bold text-amber-700">N</div>
                          <div className="text-xs text-amber-600 font-normal">% Inv. Previsionale</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Somma progressiva del Delta Budget mese per mese.
                        // Tracciata con una closure variable perche' months e'
                        // gia' sortato Jan->Dec dall'API e renderizziamo in
                        // ordine. `hasAnyBudget` tiene traccia del fatto che
                        // almeno un mese precedente (incluso il corrente)
                        // abbia un obiettivo impostato — solo allora il
                        // progressivo ha senso da mostrare.
                        let cumulativeDelta = 0
                        let hasAnyBudget = false
                        return months.map(m => {
                          const isCurrent = m.month === currentMonth && year === new Date().getFullYear()
                          const isPast = year < new Date().getFullYear() || (year === new Date().getFullYear() && m.month < currentMonth)
                          const rowBg = isCurrent
                            ? "bg-blue-50/60"
                            : isPast
                              ? "bg-gray-50/50"
                              : "bg-background"

                          if (m.obiettivo > 0) {
                            cumulativeDelta += m.delta
                            hasAnyBudget = true
                          }
                          const showCumulative = hasAnyBudget

                          return (
                          <tr key={m.month} className={`${rowBg} hover:bg-muted/40`}>
                            {/* A - Mese */}
                            <td className={`border p-2 font-medium sticky left-0 z-10 capitalize ${isCurrent ? "bg-blue-100 font-bold" : "bg-background"}`}>
                              {m.monthLabel}
                              {isCurrent && <span className="ml-1 text-[10px] text-blue-600 uppercase font-semibold">ora</span>}
                            </td>

                            {/* B - Produzione */}
                            <td className={`border p-2 text-right font-mono ${
                              m.prevYearProduction > 0 && (filterAdOggi ? m.produzioneAdOggi : m.produzioneTotale) > 0
                                ? (filterAdOggi ? m.produzioneAdOggi : m.produzioneTotale) >= m.prevYearProduction
                                  ? "text-green-600"
                                  : "text-amber-600"
                                : ""
                            }`}>
                              <div>
                                {(filterAdOggi ? m.produzioneAdOggi : m.produzioneTotale) > 0
                                  ? formatCurrency(filterAdOggi ? m.produzioneAdOggi : m.produzioneTotale)
                                  : "-"}
                              </div>
                              {m.prevYearProduction > 0 && (
                                <div className="text-[10px] text-muted-foreground">
                                  (prev: {formatCurrency(m.prevYearProduction)})
                                </div>
                              )}
                            </td>

                            {/* C - Obiettivo Budget (editabile) */}
                            <td className="border p-1 text-center bg-blue-50/40">
                              <Input
                                type="number"
                                value={editObiettivi[m.month] || ""}
                                onChange={e => setEditObiettivi(prev => ({ ...prev, [m.month]: e.target.value }))}
                                placeholder="0"
                                className="h-8 text-right font-mono text-sm w-full"
                              />
                            </td>

                            {/* D - Delta */}
                            <td className={`border p-2 text-right font-mono font-medium ${
                              m.delta > 0 ? "text-red-600" : m.delta < 0 ? "text-green-600" : ""
                            }`}>
                              {m.obiettivo > 0 ? (
                                <div className="flex items-center justify-end gap-1">
                                  {m.delta > 0 ? <TrendingDown className="h-3 w-3" /> : m.delta < 0 ? <TrendingUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                  {formatCurrency(Math.abs(m.delta))}
                                </div>
                              ) : "-"}
                            </td>

                            {/* DP - Delta Budget Progressivo (somma cumulata
                                del Delta dai mesi precedenti, incluso questo).
                                Stesse convenzioni di colore di D: positivo
                                (= manca rispetto al budget cumulato) in rosso,
                                negativo (= si sta superando il budget cumulato)
                                in verde. */}
                            <td className={`border p-2 text-right font-mono font-medium ${
                              cumulativeDelta > 0 ? "text-red-600" : cumulativeDelta < 0 ? "text-green-600" : ""
                            }`}>
                              {showCumulative ? (
                                <div className="flex items-center justify-end gap-1">
                                  {cumulativeDelta > 0 ? <TrendingDown className="h-3 w-3" /> : cumulativeDelta < 0 ? <TrendingUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                  {formatCurrency(Math.abs(cumulativeDelta))}
                                </div>
                              ) : "-"}
                            </td>

                            {/* E - RevPar */}
                            {(() => {
                              const prevRevpar = m.prevYearProduction > 0 && m.prevYearCamereDisponibili > 0 ? m.prevYearProduction / m.prevYearCamereDisponibili : 0
                              const colorE = m.revpar > 0 && prevRevpar > 0
                                ? m.revpar >= prevRevpar ? "text-green-600" : "text-amber-600"
                                : ""
                              return (
                                <td className={`border p-2 text-right font-mono ${colorE}`}>
                                  <div>{m.revpar > 0 ? formatCurrencyDecimals(m.revpar) : "-"}</div>
                                  {prevRevpar > 0 && (
                                    <div className="text-[10px] text-muted-foreground">
                                      (prev: {formatCurrencyDecimals(prevRevpar)})
                                    </div>
                                  )}
                                </td>
                              )
                            })()}

                            {/* F - RevPor */}
                            <td className={`border p-2 text-right font-mono ${
                              m.revpor > 0 && m.prevYearRevpor > 0
                                ? m.revpor >= m.prevYearRevpor ? "text-green-600" : "text-amber-600"
                                : ""
                            }`}>
                              <div>{m.revpor > 0 ? formatCurrencyDecimals(m.revpor) : "-"}</div>
                              {m.prevYearRevpor > 0 && (
                                <div className="text-[10px] text-muted-foreground">
                                  (prev: {formatCurrencyDecimals(m.prevYearRevpor)})
                                </div>
                              )}
                            </td>

                            {/* G - Delta RevPor YoY */}
                            <td className={`border p-2 text-right font-mono ${
                              m.deltaRevpor > 0 ? "text-green-600" : m.deltaRevpor < 0 ? "text-red-600" : ""
                            }`}>
                              {m.revpor > 0 || m.prevYearRevpor > 0 ? (
                                <div>
                                  <div>{m.deltaRevpor >= 0 ? "+" : ""}{formatCurrencyDecimals(m.deltaRevpor)}</div>
                                  {m.prevYearRevpor > 0 && (
                                    <div className="text-[10px] text-muted-foreground">
                                      (prev: {formatCurrencyDecimals(m.prevYearRevpor)})
                                    </div>
                                  )}
                                </div>
                              ) : "-"}
                            </td>

                            {/* H - Coefficiente Revenue */}
                            <td className="border p-2 text-right font-mono">
                              {m.coefficienteRevenue > 0 ? m.coefficienteRevenue.toFixed(2) : "-"}
                            </td>

                            {/* I - % Occupazione */}
                            <td className={`border p-2 text-right font-mono font-medium ${
                              m.occupancyPct > 0 && m.prevYearOccupancyPct > 0
                                ? m.occupancyPct >= m.prevYearOccupancyPct ? "text-green-600" : "text-amber-600"
                                : m.occupancyPct > 0 ? "" : ""
                            }`}>
                              <div>{m.occupancyPct > 0 ? `${m.occupancyPct.toFixed(1)}%` : "-"}</div>
                              {m.prevYearOccupancyPct > 0 && (
                                <div className="text-[10px] text-muted-foreground font-normal">
                                  (prev: {m.prevYearOccupancyPct.toFixed(1)}%)
                                </div>
                              )}
                            </td>

                            {/* J - Camere vendute */}
                            <td className={`border p-2 text-right font-mono font-medium ${
                              m.camereVendute > 0 && m.prevYearCamereVendute > 0
                                ? m.camereVendute >= m.prevYearCamereVendute ? "text-green-600" : "text-amber-600"
                                : ""
                            }`}>
                              <div>{m.camereVendute > 0 ? m.camereVendute.toLocaleString("it-IT") : "-"}</div>
                              {m.prevYearCamereVendute > 0 && (
                                <div className="text-[10px] text-muted-foreground font-normal">
                                  (prev: {m.prevYearCamereVendute.toLocaleString("it-IT")})
                                </div>
                              )}
                            </td>

                            {/* K - Camere invendute */}
                            <td className="border p-2 text-right font-mono">
                              {m.camereInvendute > 0 ? m.camereInvendute.toLocaleString("it-IT") : "-"}
                            </td>

                            {/* L - Camere disponibili */}
                            <td className="border p-2 text-right font-mono">
                              <div>{m.camereDisponibili > 0 ? m.camereDisponibili.toLocaleString("it-IT") : "-"}</div>
                              {m.prevYearCamereDisponibili > 0 && (
                                <div className="text-[10px] text-muted-foreground font-normal">
                                  (prev: {m.prevYearCamereDisponibili.toLocaleString("it-IT")})
                                </div>
                              )}
                            </td>

                            {/* O - Camere Disponibili alla Vendita (Totale mese: tutte libere; Ad oggi: da oggi a fine mese) */}
                            <td className="border p-2 text-right font-mono font-medium bg-green-50/40">
                              {m.remainingUnsold > 0 ? (
                                <span className="text-green-700">{m.remainingUnsold.toLocaleString("it-IT")}</span>
                              ) : isPast ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <span>0</span>
                              )}
                            </td>

                            {/* M - RevPor Target.
                                Tooltip on hover spiega la formula con i numeri
                                concreti del mese, cosi' l'utente capisce da
                                dove esce il prezzo target. La cella resta
                                con lo stesso layout: aggiungiamo solo una
                                Info icon a destra del valore quando c'e' un
                                target da spiegare. */}
                            <td className={`border p-2 text-right font-mono font-medium bg-amber-50/40 ${
                              m.revporTarget > 0 ? "text-amber-700" : ""
                            }`}>
                              {m.obiettivo > 0 && m.delta > 0 && m.roomsExpectedToSell > 0 ? (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="cursor-help">
                                        <div className="flex items-center justify-end gap-1">
                                          <span>{formatCurrencyDecimals(m.revporTarget)}</span>
                                          <Info className="h-3 w-3 text-amber-600/70" aria-hidden="true" />
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                          ({m.roomsExpectedToSell} cam. previste)
                                        </div>
                                        {(() => {
                                          const f = assessFeasibility(m)
                                          if (!f) return null
                                          return (
                                            <div className="flex justify-end mt-1">
                                              <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${f.badgeClass}`}>
                                                {f.label}
                                              </span>
                                            </div>
                                          )
                                        })()}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-sm text-left">
                                      <div className="space-y-2 text-xs">
                                        <div className="font-semibold text-sm">RevPor Target — {m.monthLabel}</div>
                                        <p className="text-muted-foreground leading-relaxed">
                                          Il prezzo medio per camera che devi riuscire a spuntare,
                                          da oggi a fine mese, per chiudere il gap rispetto al budget.
                                        </p>
                                        <div className="border-t pt-2 space-y-1">
                                          <div className="font-semibold">Formula</div>
                                          <div className="font-mono text-[11px] leading-snug">
                                            RevPor Target = (Budget − Produzione) ÷ Camere previste
                                          </div>
                                          <div className="font-mono text-[11px] leading-snug text-muted-foreground">
                                            Camere previste = Cam. disponibili × (100% − % Invenduto)
                                          </div>
                                        </div>
                                        <div className="border-t pt-2 space-y-0.5">
                                          <div className="font-semibold">Calcolo del mese</div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-muted-foreground">D — Delta budget:</span>
                                            <span className="font-mono">{formatCurrency(m.delta)}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-muted-foreground">O — Cam. ancora vendibili:</span>
                                            <span className="font-mono">{m.remainingUnsold}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-muted-foreground">N — % Invenduto previsto:</span>
                                            <span className="font-mono">{m.percentualeInvendutoPrevisionale.toFixed(1)}%</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-muted-foreground">→ Cam. previste:</span>
                                            <span className="font-mono">{m.roomsExpectedToSell}</span>
                                          </div>
                                          <div className="flex justify-between gap-4 border-t pt-1 mt-1 font-semibold">
                                            <span>= RevPor Target:</span>
                                            <span className="font-mono">{formatCurrencyDecimals(m.revporTarget)}</span>
                                          </div>
                                        </div>
                                        {/* Raggiungibilita': confronto del prezzo RICHIESTO (target) con
                                            un prezzo realmente ottenibile (RevPor storico stesso periodo,
                                            fallback all'attuale). Da' un giudizio a livelli. */}
                                        {(() => {
                                          const f = assessFeasibility(m)
                                          if (!f) return null
                                          return (
                                            <div className="border-t pt-2 space-y-1">
                                              <div className="font-semibold">Raggiungibilità</div>
                                              <div className="flex items-center gap-1.5">
                                                <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${f.badgeClass}`}>
                                                  {f.label}
                                                </span>
                                              </div>
                                              <p className="text-[11px] leading-snug text-muted-foreground">{f.description}</p>
                                              {f.benchmarkSource && (
                                                <div className="flex justify-between gap-4 text-[11px]">
                                                  <span className="text-muted-foreground">
                                                    Benchmark ({f.benchmarkSource === "storico" ? "anno scorso" : "quest'anno"}):
                                                  </span>
                                                  <span className="font-mono">{formatCurrencyDecimals(f.benchmark)}</span>
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })()}
                                        {/* Considerazioni dinamiche: confronto RevPor attuale (col. F)
                                            vs RevPor Target. Margine 5% per evitare flip-flop su
                                            differenze trascurabili. Mostriamo solo se entrambi i
                                            valori sono > 0 (mese con vendite + budget definito). */}
                                        {m.revpor > 0 && m.revporTarget > 0 && (() => {
                                          const ratio = m.revpor / m.revporTarget
                                          const gapPct = ((m.revpor - m.revporTarget) / m.revporTarget) * 100
                                          const tone: "good" | "neutral" | "bad" =
                                            ratio >= 1.05 ? "good" : ratio >= 0.95 ? "neutral" : "bad"
                                          const colorClass =
                                            tone === "good"
                                              ? "border-green-200 bg-green-50 text-green-900"
                                              : tone === "neutral"
                                                ? "border-amber-200 bg-amber-50 text-amber-900"
                                                : "border-red-200 bg-red-50 text-red-900"
                                          const TrendIcon =
                                            tone === "good" ? TrendingUp : tone === "neutral" ? Minus : TrendingDown
                                          let title: string
                                          let body: React.ReactNode
                                          if (tone === "good") {
                                            title = "Sei sopra il target"
                                            body = (
                                              <>
                                                Stai vendendo a <strong>{formatCurrencyDecimals(m.revpor)}</strong> a camera,
                                                {" "}<strong>{gapPct.toFixed(1)}%</strong> sopra il prezzo necessario.
                                                Se mantieni questo ritmo superi il budget di {m.monthLabel}.
                                              </>
                                            )
                                          } else if (tone === "neutral") {
                                            title = "Sei in linea con il target"
                                            body = (
                                              <>
                                                Stai vendendo a <strong>{formatCurrencyDecimals(m.revpor)}</strong> a camera,
                                                molto vicino al target di <strong>{formatCurrencyDecimals(m.revporTarget)}</strong>.
                                                Tieni la rotta: piccoli cali del prezzo possono compromettere il budget.
                                              </>
                                            )
                                          } else {
                                            title = "Sei sotto il target"
                                            body = (
                                              <>
                                                Stai vendendo a <strong>{formatCurrencyDecimals(m.revpor)}</strong> a camera,
                                                {" "}<strong>{Math.abs(gapPct).toFixed(1)}%</strong> sotto il prezzo necessario.
                                                Se non alzi i prezzi (o vendi piu&apos; camere del previsto), difficilmente raggiungi il budget di {m.monthLabel}.
                                              </>
                                            )
                                          }
                                          return (
                                            <div className="border-t pt-2 mt-1">
                                              <div className={`rounded border ${colorClass} px-2 py-1.5 space-y-1`}>
                                                <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                                                  <TrendIcon className="h-3 w-3" aria-hidden="true" />
                                                  <span>{title}</span>
                                                </div>
                                                <p className="text-[11px] leading-snug">{body}</p>
                                              </div>
                                            </div>
                                          )
                                        })()}
                                        <p className="text-[11px] text-muted-foreground border-t pt-2 leading-relaxed">
                                          Abbassa la % di invenduto previsto (col. N) se sei piu&apos; ottimista:
                                          piu&apos; camere previste = target piu&apos; basso, piu&apos; raggiungibile.
                                        </p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : m.delta <= 0 && m.obiettivo > 0 ? (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-green-600 text-xs font-semibold cursor-help inline-flex items-center gap-1">
                                        Raggiunto
                                        <Info className="h-3 w-3 text-green-600/70" aria-hidden="true" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-xs text-left">
                                      <div className="space-y-1 text-xs">
                                        <div className="font-semibold">Budget gia&apos; raggiunto</div>
                                        <p className="text-muted-foreground leading-relaxed">
                                          La produzione di {m.monthLabel} ha gia&apos; superato l&apos;obiettivo:
                                          non serve un prezzo target perche&apos; il delta e&apos; in positivo.
                                        </p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : "-"}
                            </td>

                            {/* N - % Invenduto previsionale (editabile) */}
                            <td className="border p-1 text-center bg-amber-50/40">
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={editPercInvenduto[m.month] || "10"}
                                  onChange={e => setEditPercInvenduto(prev => ({ ...prev, [m.month]: e.target.value }))}
                                  className="h-8 text-center font-mono text-sm w-full"
                                  title={m.prevYearPercInvenduto > 0 ? `Anno prec.: ${m.prevYearPercInvenduto.toFixed(1)}%` : ""}
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                              {m.prevYearPercInvenduto > 0 && (
                                <div className="text-[9px] text-muted-foreground mt-0.5">
                                  (prec: {m.prevYearPercInvenduto.toFixed(1)}%)
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                        })
                      })()}

                      {/* Annual totals row */}
                      <tr className="bg-muted font-bold">
                        <td className="border p-2 sticky left-0 bg-muted z-10">TOTALE ANNUO</td>
                        <td className={`border p-2 text-right font-mono ${
                          annualPrevYearProduction > 0 && annualProduction > 0
                            ? annualProduction >= annualPrevYearProduction ? "text-green-600" : "text-amber-600"
                            : ""
                        }`}>
                          <div>{formatCurrency(annualProduction)}</div>
                          {annualPrevYearProduction > 0 && (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              (prev: {formatCurrency(annualPrevYearProduction)})
                            </div>
                          )}
                        </td>
                        <td className="border p-2 text-right font-mono">{formatCurrency(annualObiettivo)}</td>
                        <td className={`border p-2 text-right font-mono ${annualDelta > 0 ? "text-red-600" : "text-green-600"}`}>
                          {annualObiettivo > 0 ? formatCurrency(Math.abs(annualDelta)) : "-"}
                        </td>
                        {/* DP — Delta Budget Progressivo a fine anno: e' la
                            stessa quantita' del Delta Budget annuo (la somma
                            progressiva dopo l'ultimo mese == somma totale dei
                            delta == annualDelta). Replicata per coerenza
                            visiva con la colonna mese-per-mese. */}
                        <td className={`border p-2 text-right font-mono ${annualDelta > 0 ? "text-red-600" : "text-green-600"}`}>
                          {annualObiettivo > 0 ? formatCurrency(Math.abs(annualDelta)) : "-"}
                        </td>
                        <td className={`border p-2 text-right font-mono ${
                          annualPrevYearRevpar > 0 && annualRevpar > 0
                            ? annualRevpar >= annualPrevYearRevpar ? "text-green-600" : "text-amber-600"
                            : ""
                        }`}>
                          <div>{formatCurrencyDecimals(annualRevpar)}</div>
                          {annualPrevYearRevpar > 0 && (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              (prev: {formatCurrencyDecimals(annualPrevYearRevpar)})
                            </div>
                          )}
                        </td>
                        <td className={`border p-2 text-right font-mono ${
                          annualPrevYearRevpor > 0 && annualRevpor > 0
                            ? annualRevpor >= annualPrevYearRevpor ? "text-green-600" : "text-amber-600"
                            : ""
                        }`}>
                          <div>{formatCurrencyDecimals(annualRevpor)}</div>
                          {annualPrevYearRevpor > 0 && (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              (prev: {formatCurrencyDecimals(annualPrevYearRevpor)})
                            </div>
                          )}
                        </td>
                        {/* G - Delta RevPor YoY annuo: differenza tra RevPor
                            annuo e RevPor annuo precedente (NON la somma dei
                            delta mensili, che non avrebbe senso su una media). */}
                        <td className={`border p-2 text-right font-mono ${
                          annualRevpor - annualPrevYearRevpor > 0 ? "text-green-600"
                            : annualRevpor - annualPrevYearRevpor < 0 ? "text-red-600" : ""
                        }`}>
                          {annualRevpor > 0 && annualPrevYearRevpor > 0
                            ? `${annualRevpor - annualPrevYearRevpor >= 0 ? "+" : ""}${formatCurrencyDecimals(annualRevpor - annualPrevYearRevpor)}`
                            : "-"}
                        </td>
                        <td className="border p-2 text-right font-mono">
                          {annualRevpar > 0 ? (annualRevpor / annualRevpar).toFixed(2) : "-"}
                        </td>
                        <td className={`border p-2 text-right font-mono font-medium ${
                          annualPrevYearOccupancy > 0 && annualOccupancy > 0
                            ? annualOccupancy >= annualPrevYearOccupancy ? "text-green-600" : "text-amber-600"
                            : ""
                        }`}>
                          <div>{annualCapacity > 0 ? `${annualOccupancy.toFixed(1)}%` : "-"}</div>
                          {annualPrevYearOccupancy > 0 && (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              (prev: {annualPrevYearOccupancy.toFixed(1)}%)
                            </div>
                          )}
                        </td>
                        <td className={`border p-2 text-right font-mono ${
                          annualPrevYearSold > 0 && annualSold > 0
                            ? annualSold >= annualPrevYearSold ? "text-green-600" : "text-amber-600"
                            : ""
                        }`}>
                          <div>{annualSold.toLocaleString("it-IT")}</div>
                          {annualPrevYearSold > 0 && (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              (prev: {annualPrevYearSold.toLocaleString("it-IT")})
                            </div>
                          )}
                        </td>
                        <td className="border p-2 text-right font-mono">{(annualCapacity - annualSold).toLocaleString("it-IT")}</td>
                        <td className="border p-2 text-right font-mono">
                          <div>{annualCapacity.toLocaleString("it-IT")}</div>
                          {annualPrevYearCapacity > 0 && (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              (prev: {annualPrevYearCapacity.toLocaleString("it-IT")})
                            </div>
                          )}
                        </td>
                        <td className="border p-2 text-right font-mono bg-green-50/40 text-green-700">
                          {annualRemainingUnsold > 0 ? annualRemainingUnsold.toLocaleString("it-IT") : "-"}
                        </td>
                        <td className="border p-2 text-center">-</td>
                        <td className="border p-2 text-center">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Legend */}
              <div className="mt-6 p-4 bg-muted/30 rounded-lg space-y-3">
                <ProductionLegendIntro connector={connector} />
                <div>
                  <h4 className="font-semibold text-sm mb-2">Legenda colonne</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div><strong>B - Produzione:</strong> {filterAdOggi ? "Ricavi maturati fino ad oggi" : "Totale ricavi camera (incluso colazione)"} dalle prenotazioni in casa nel mese. In grigio: produzione anno precedente</div>
                    <div><strong>C - Obiettivo Budget:</strong> Target di ricavo mensile (editabile)</div>
                    <div><strong>D - Delta Budget:</strong> Differenza tra obiettivo e produzione (rosso = manca, verde = superato)</div>
                    <div><strong>DP - Delta Budget Progressivo:</strong> Somma progressiva del Delta Budget mese per mese (rosso = ritardo cumulato, verde = anticipo cumulato). A dicembre coincide con il Delta annuo.</div>
                    <div><strong>E - RevPar:</strong> Revenue Per Available Room (Produzione / Camere disponibili)</div>
                    <div><strong>F - RevPor:</strong> Revenue Per Occupied Room (Produzione / Camere vendute)</div>
                    <div><strong>G - Delta RevPor YoY:</strong> Differenza RevPor rispetto allo stesso mese anno precedente</div>
                    <div><strong>H - Coeff. Revenue:</strong> Rapporto RevPor / RevPar</div>
                    <div><strong>I - % Occupazione:</strong> Percentuale camere occupate (Vendute / Disponibili). In grigio: occupazione anno precedente</div>
                    <div><strong>J - Cam. Vendute:</strong> Totale camere vendute nel mese. In grigio: anno precedente</div>
                    <div><strong>K - Cam. Invendute:</strong> Capacità effettiva del mese (scorporando camere fuori servizio o non disponibili) meno le camere vendute</div>
                    <div><strong>L - Cam. Disponibili:</strong> Capacita totale del mese. In grigio: anno precedente</div>
                    <div><strong>O - Cam. Disponibili alla Vendita:</strong> Camere ancora vendibili da oggi in poi. Mesi passati: 0. Mese corrente: da oggi a fine mese. Mesi futuri: invenduto totale del mese</div>
                    <div><strong>M - RevPor Target:</strong> Media ricavo per camera necessaria per raggiungere l&apos;obiettivo</div>
                    <div><strong>N - % Inv. Previsionale:</strong> Stima percentuale camere invendute (editabile, default = anno precedente)</div>
                  </div>
                </div>
              </div>

              {/* CTA: Imposta i tuoi KPI personalizzati */}
              <div className="mt-6 p-5 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Settings2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-base">Imposta i tuoi KPI personalizzati</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Hai definito gli obiettivi di budget? Ora personalizza le soglie dei KPI
                        per ricevere avvisi su misura nella dashboard quando le metriche escono dai tuoi target.
                      </p>
                    </div>
                  </div>
                  <Button asChild className="flex-shrink-0">
                    <Link href="/settings/kpi">
                      Configura KPI
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
