"use client"

import { Suspense, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"
import { it } from "date-fns/locale"
import { PageHeader } from "@/components/layout/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Eye,
  Calendar,
  User,
  Building,
  FileText,
  Euro,
  CreditCard,
  Bed,
  Users,
  Mail,
  Phone,
  MapPin,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from "lucide-react"

interface RawBooking {
  id: string
  hotel_id: string
  pms_booking_id: string | null
  check_in_date: string
  check_out_date: string
  guest_name: string | null
  channel: string | null
  total_price: string | number | null
  number_of_guests: number | null
  number_of_nights: number | null
  is_cancelled: boolean
  cancellation_date: string | null
  booking_date: string | null
  // Timestamp PMS completo (data + ora) di quando la prenotazione e' stata
  // creata/ricevuta nel PMS. Per Scidoo contiene l'ora reale; per BRiG e'
  // solo la data a mezzanotte (BRiG non trasmette l'ora). Vedi colonna "Creata".
  booking_datetime: string | null
  booking_pickup_days: number | null
  cancellation_pickup_days: number | null
  room_type_id: string | null
  room_types?: { code: string; name: string } | null
  rate_id?: string | null
  rate_name?: string | null
  rate_code?: string | null
  raw_data?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function BookingsListPageInner() {
  // FIX 30/04/2026 (tenant switcher su /dati/bookings):
  // useSearchParams() is reactive: when the super-admin switches hotel via
  // app-header.tsx (which navigates with ?hotel=NEW_ID), this hook returns
  // the updated value and the useEffect below re-runs loadUserHotel(),
  // even if Next.js performs a soft navigation rather than a full reload.
  const searchParams = useSearchParams()
  const urlHotelParam = searchParams?.get("hotel") ?? null

  const [bookings, setBookings] = useState<RawBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState<string>("")
  const [selectedBooking, setSelectedBooking] = useState<RawBooking | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  
  // Date filters - default to "activity" to show both new bookings and cancellations (like Scidoo)
  // "imported" (FIX 30/04/2026) filtra per `imported_at` (data in cui la nostra
  // ETL ha SCOPERTO il booking). Diverso da booking_date che e' la data
  // creazione nel PMS — utile per vedere "cosa e' arrivato oggi nel sistema".
  const [filterType, setFilterType] = useState<
    "checkin" | "booking" | "cancellation" | "activity" | "imported"
  >("activity")
  const [todayCount, setTodayCount] = useState<number | null>(null)
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Nuovi filtri: cerca per nome, ID prenotazione, canale
  const [searchName, setSearchName] = useState("")
  const [searchId, setSearchId] = useState("")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  // Filtro per tipo: tutto / solo camere reali / solo servizi extra
  // (no_stay + restaurant) / solo testate gruppo. Filtro client-side
  // perche' la categoria deriva dal sentinel rate_code gia' caricato.
  const [kindFilter, setKindFilter] = useState<"all" | "rooms" | "extras" | "groups">("all")
  const [availableChannels, setAvailableChannels] = useState<string[]>([])
  
  // Sorting
  type SortField = "pms_booking_id" | "booking_date" | "cancellation_date" | "check_in_date" | "check_out_date"
  const [sortField, setSortField] = useState<SortField>("booking_date")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    loadUserHotel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlHotelParam])

  // Debounced search values
  const [debouncedName, setDebouncedName] = useState("")
  const [debouncedId, setDebouncedId] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(searchName), 400)
    return () => clearTimeout(timer)
  }, [searchName])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedId(searchId), 400)
    return () => clearTimeout(timer)
  }, [searchId])

  useEffect(() => {
    if (hotelId) {
      loadBookings()
    }
  }, [hotelId, startDate, endDate, filterType, statusFilter, channelFilter, debouncedName, debouncedId])

  async function loadUserHotel() {
    try {
      // Read `?hotel=` reactively via useSearchParams (above) and pass it
      // to the API. cache:"no-store" prevents the browser from serving a
      // stale response for the same URL across tenant switches.
      const apiUrl = urlHotelParam
        ? `/api/ui/selected-hotel?hotel=${encodeURIComponent(urlHotelParam)}`
        : "/api/ui/selected-hotel"
      const res = await fetch(apiUrl, { cache: "no-store" })
      const data = await res.json()

      if (data.error || !data.hotel) {
        setLoading(false)
        return
      }

      setHotelId(data.hotel.id)
      setHotelName(data.hotel.name)
      
      // Fetch available channels for filter dropdown
      try {
        const chRes = await fetch(`/api/dati/bookings?hotel_id=${data.hotel.id}&start_date=2020-01-01&end_date=2030-12-31&filter_type=booking`)
        if (chRes.ok) {
          const chData = await chRes.json()
          if (chData.channels) setAvailableChannels(chData.channels)
        }
      } catch {}

      // Fetch last sync time
      const syncRes = await fetch(`/api/pms/last-sync?hotel_id=${data.hotel.id}&module=bookings`)
      if (syncRes.ok) {
        const syncData = await syncRes.json()
        setLastSync(syncData.lastSync)
      }

      // FIX 30/04/2026: fetch separato del count "sincronizzate oggi" per
      // popolare il banner di overview, indipendente dal filtro corrente.
      // Cosi' l'utente vede sempre quante prenotazioni sono arrivate oggi
      // anche se il suo filtro attivo le esclude (es. ha filtrato per
      // booking_date di ieri ma vuole sapere se oggi e' arrivato qualcosa).
      try {
        const todayStr = format(new Date(), "yyyy-MM-dd")
        const todayRes = await fetch(
          `/api/dati/bookings?hotel_id=${data.hotel.id}&start_date=${todayStr}&end_date=${todayStr}&filter_type=imported&status=all`,
        )
        if (todayRes.ok) {
          const todayData = await todayRes.json()
          setTodayCount(todayData.count ?? 0)
        }
      } catch {}
    } catch (error) {
      console.error("Error loading hotel:", error)
      setLoading(false)
    }
  }

  async function loadBookings() {
    if (!hotelId) return
    setLoading(true)

    try {
      const params = new URLSearchParams({
        hotel_id: hotelId,
        start_date: startDate,
        end_date: endDate,
        filter_type: filterType,
        status: statusFilter,
      })
      if (debouncedName.trim()) params.set("search_name", debouncedName.trim())
      if (debouncedId.trim()) params.set("search_id", debouncedId.trim())
      if (channelFilter !== "all") params.set("channel", channelFilter)
      
      const res = await fetch(`/api/dati/bookings?${params}`)
      const data = await res.json()
      
      if (data.error) throw new Error(data.error)
      setBookings(data.bookings || [])
      if (data.channels) setAvailableChannels(data.channels)
    } catch (error) {
      console.error("Error loading bookings:", error)
    } finally {
      setLoading(false)
    }
  }

  function setPresetPeriod(preset: string) {
    const today = new Date()
    switch (preset) {
      case "today":
        // FIX 30/04/2026: preset "Oggi" — utile soprattutto con filtro
        // "Sincronizzate" per vedere cosa e' arrivato in giornata.
        setStartDate(format(today, "yyyy-MM-dd"))
        setEndDate(format(today, "yyyy-MM-dd"))
        break
      case "yesterday": {
        const yest = new Date(today)
        yest.setDate(yest.getDate() - 1)
        setStartDate(format(yest, "yyyy-MM-dd"))
        setEndDate(format(yest, "yyyy-MM-dd"))
        break
      }
      case "thisMonth":
        setStartDate(format(startOfMonth(today), "yyyy-MM-dd"))
        setEndDate(format(endOfMonth(today), "yyyy-MM-dd"))
        break
      case "lastMonth":
        const lastMonth = subMonths(today, 1)
        setStartDate(format(startOfMonth(lastMonth), "yyyy-MM-dd"))
        setEndDate(format(endOfMonth(lastMonth), "yyyy-MM-dd"))
        break
      case "last3Months":
        setStartDate(format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"))
        setEndDate(format(endOfMonth(today), "yyyy-MM-dd"))
        break
      case "last6Months":
        setStartDate(format(startOfMonth(subMonths(today, 5)), "yyyy-MM-dd"))
        setEndDate(format(endOfMonth(today), "yyyy-MM-dd"))
        break
      case "lastYear":
        setStartDate(format(startOfMonth(subMonths(today, 11)), "yyyy-MM-dd"))
        setEndDate(format(endOfMonth(today), "yyyy-MM-dd"))
        break
    }
  }

  // Classificazione del tipo di prenotazione basata sul sentinel di rate_code
  // scritto dal backfill /api/superadmin/backfill-rate-fields. I sentinel
  // marcano bookings che il PMS Scidoo non trasmette mai con un rate_id reale
  // (servizi extra, ristorante, testate di gruppo). Vedi memoria
  // santaddeo-room-cost-classification per dettagli.
  function classifyBooking(rateCode?: string | null): {
    kind:
      | "room"
      | "extra_no_stay"
      | "extra_restaurant"
      | "group_header"
      | "walkin_no_rate"
      | "ota_no_rate"
      | "no_rate_service"
    label: string
    badgeClass: string
  } {
    const code = (rateCode || "").trim().toUpperCase()
    // Tariffa NON trasmessa dal PMS (rate_code vuoto): per regola di business e'
    // un servizio venduto (non un pernotto di camera), quindi la notte NON va
    // conteggiata nei KPI notti/ADR/RevPOR. E' la rappresentazione reale usata
    // dai dati (es. Barronci), distinta dai sentinel espliciti EXTRA_*/GROUP_*.
    if (code === "") {
      return {
        kind: "no_rate_service",
        label: "Servizio (tariffa non trasmessa)",
        badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
      }
    }
    switch (code) {
      case "EXTRA_NO_STAY":
        return {
          kind: "extra_no_stay",
          label: "Extra (no pernotto)",
          badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
        }
      case "EXTRA_RESTAURANT":
        return {
          kind: "extra_restaurant",
          label: "Ristorante",
          badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
        }
      case "GROUP_HEADER":
        return {
          kind: "group_header",
          label: "Testata gruppo",
          badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
        }
      case "WALKIN_NO_RATE":
        return {
          kind: "walkin_no_rate",
          label: "Diretta (no tariffa)",
          badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
        }
      case "OTA_NO_RATE":
        return {
          kind: "ota_no_rate",
          label: "OTA (tariffa non trasmessa)",
          badgeClass: "bg-orange-50 text-orange-800 border-orange-200",
        }
      default:
        return {
          kind: "room",
          label: "Camera",
          badgeClass: "",
        }
    }
  }

  function openDetail(booking: RawBooking) {
    setSelectedBooking(booking)
    setDetailOpen(true)
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  function getSortIcon(field: SortField) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" /> 
      : <ArrowDown className="h-3 w-3 ml-1" />
  }

  // Sort bookings
  const sortedBookings = [...bookings].sort((a, b) => {
    let aVal: string | number | null = null
    let bVal: string | number | null = null

    switch (sortField) {
      case "pms_booking_id":
        aVal = parseInt(a.pms_booking_id) || 0
        bVal = parseInt(b.pms_booking_id) || 0
        break
      case "booking_date": {
        // FIX 28/05/2026: la colonna "Creata" rappresenta quando la
        // prenotazione e' stata creata NEL PMS. Ordiniamo quindi sul timestamp
        // PMS `booking_datetime` (per Scidoo include l'ora reale, per BRiG e' la
        // data a mezzanotte). Prima si ordinava su `created_at`, che e' l'ora in
        // cui il NOSTRO sync ha scaricato il record: ordinava per "ordine di
        // import" e non per "ordine di prenotazione" (poteva invertire
        // bookings importati nello stesso batch). Fallback su booking_date.
        aVal = a.booking_datetime || a.booking_date || ""
        bVal = b.booking_datetime || b.booking_date || ""
        break
      }
      case "cancellation_date":
        aVal = a.cancellation_date || ""
        bVal = b.cancellation_date || ""
        break
      case "check_in_date":
        aVal = a.check_in_date || ""
        bVal = b.check_in_date || ""
        break
      case "check_out_date":
        aVal = a.check_out_date || ""
        bVal = b.check_out_date || ""
        break
    }

    if (aVal === null || aVal === "") aVal = sortDirection === "asc" ? "9999-99-99" : "0000-00-00"
    if (bVal === null || bVal === "") bVal = sortDirection === "asc" ? "9999-99-99" : "0000-00-00"

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal
    }
    
    const comparison = String(aVal).localeCompare(String(bVal))
    return sortDirection === "asc" ? comparison : -comparison
  })

  // Conteggi per tipo (sui bookings caricati) — usati per le label dei chip.
  const kindCounts = sortedBookings.reduce(
    (acc, b) => {
      const k = classifyBooking(b.rate_code).kind
      if (k === "extra_no_stay" || k === "extra_restaurant" || k === "no_rate_service") acc.extras++
      else if (k === "group_header") acc.groups++
      else acc.rooms++
      return acc
    },
    { rooms: 0, extras: 0, groups: 0 },
  )

  const filteredBookings = sortedBookings.filter((b) => {
    if (kindFilter === "all") return true
    const k = classifyBooking(b.rate_code).kind
    if (kindFilter === "rooms")
      return k === "room" || k === "walkin_no_rate" || k === "ota_no_rate"
    if (kindFilter === "extras")
      return k === "extra_no_stay" || k === "extra_restaurant" || k === "no_rate_service"
    if (kindFilter === "groups") return k === "group_header"
    return true
  })

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-"
    try {
      return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: it })
    } catch {
      return dateStr
    }
  }

  const formatDateShort = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-"
    try {
      return format(new Date(dateStr), "dd/MM/yyyy", { locale: it })
    } catch {
      return dateStr
    }
  }

  // Formatta timestamp con ora (per campi tipo TIMESTAMP come created_at)
  const formatTimestamp = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-"
    try {
      const date = new Date(dateStr)
      return format(date, "dd/MM/yy HH:mm", { locale: it })
    } catch {
      return dateStr
    }
  }

  // Ora REALE di creazione prenotazione nel PMS, estratta da booking_datetime.
  // FIX 28/05/2026: prima la colonna "Creata" mostrava l'ora da `created_at`
  // (il momento in cui il NOSTRO sync ha scaricato il record), facendola
  // sembrare l'ora della prenotazione. Ora usiamo booking_datetime, che e' il
  // timestamp del PMS. Estraiamo "HH:mm" direttamente dalla stringa ISO (senza
  // conversione fuso) per restare fedeli a cio' che ha riportato il PMS.
  // Se l'ora e' "00:00" significa che il PMS non l'ha trasmessa (caso BRiG, che
  // manda solo la data): in quel caso NON mostriamo alcuna ora invece di
  // ripiegare sull'ora di download, che sarebbe fuorviante.
  const bookingTime = (dt: string | null | undefined): string | null => {
    if (!dt || dt.length < 16 || dt[10] !== "T") return null
    const hhmm = dt.slice(11, 16)
    return hhmm === "00:00" ? null : hhmm
  }

  const formatCurrency = (amount: number | string | undefined | null) => {
    if (amount === undefined || amount === null) return "0,00 EUR"
    const num = typeof amount === "string" ? parseFloat(amount) : amount
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(num)
  }

  // Numero notti: usa `number_of_nights` se valorizzato, altrimenti lo calcola
  // dalla differenza check-in/check-out (BRiG non sempre trasmette le notti).
  const getNights = (b: RawBooking): number => {
    if (typeof b.number_of_nights === "number" && b.number_of_nights > 0) {
      return b.number_of_nights
    }
    if (b.check_in_date && b.check_out_date) {
      const ci = new Date(b.check_in_date).getTime()
      const co = new Date(b.check_out_date).getTime()
      if (Number.isFinite(ci) && Number.isFinite(co) && co > ci) {
        return Math.round((co - ci) / (1000 * 60 * 60 * 24))
      }
    }
    return 0
  }

  // Una vendita SENZA tariffa trasmessa che ricade in questi sentinel NON e' un
  // pernotto ma un servizio (day-use/benessere/eventi, coperti ristorante) o una
  // riga-padre di gruppo (le notti reali sono sui figli). Non deve entrare nel
  // conteggio room-night usato per ADR/RevPOR ne' nel totale notti, altrimenti
  // gonfia il denominatore con notti inesistenti. Walk-in e OTA senza tariffa
  // (walkin_no_rate / ota_no_rate) sono invece soggiorni REALI e restano contati.
  const isServiceSale = (b: RawBooking): boolean => {
    const kind = classifyBooking(b.rate_code).kind
    return (
      kind === "extra_no_stay" ||
      kind === "extra_restaurant" ||
      kind === "group_header" ||
      kind === "no_rate_service"
    )
  }

  // Room-night "vere" ai fini KPI: 0 per i servizi/testate gruppo, altrimenti le
  // notti effettive. Da usare in TUTTI gli aggregati (totale notti, ADR/RevPOR).
  const getRoomNights = (b: RawBooking): number => (isServiceSale(b) ? 0 : getNights(b))

  const calculateDailyTotal = (dailyPrice: Record<string, number> | undefined) => {
    if (!dailyPrice) return 0
    return Object.values(dailyPrice).reduce((sum, price) => sum + price, 0)
  }

  const calculatePaymentsTotal = (payments: Array<{ amount?: string | number }> | undefined) => {
    if (!payments) return 0
    return payments.reduce((sum, p) => {
      const amount = typeof p.amount === "string" ? parseFloat(p.amount) : p.amount || 0
      return sum + amount
    }, 0)
  }

  // Controlla se la prenotazione ha dati Scidoo/API dettagliati
  const hasRawData = (b: any) => b?.raw_data && typeof b.raw_data === "object" && Object.keys(b.raw_data).length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Elenco Prenotazioni</h1>
        <p className="text-sm text-muted-foreground mt-1">{`${hotelName} - Prenotazioni importate`}</p>
      </div>
      
      {/* Last Sync Info */}
      {lastSync && (
        <div className="bg-muted/50 border-b px-6 py-2 flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Ultima sincronizzazione: <strong className="text-foreground">{format(new Date(lastSync), "dd MMM yyyy 'alle' HH:mm", { locale: it })}</strong></span>
        </div>
      )}
      
      <main className="p-6">
        <div className="mx-auto max-w-[1600px] space-y-6">

      {/* Today's sync summary banner.
          FIX 30/04/2026: distingue chiaramente cosa e' "arrivato oggi nel
          sistema" (imported_at=oggi) vs "creato oggi nel PMS" (booking_date=
          oggi). Caso classico: una prenotazione fatta nel PMS alle 23:50
          del 29/04 ed entrata nel nostro sync alle 00:50 del 30/04 ha
          booking_date=29/04 ma imported_at=30/04. Senza questo banner
          l'utente non si accorgeva di nuovi import giornalieri. */}
      {todayCount !== null && (
        <Card className={todayCount > 0 ? "border-primary/30 bg-primary/5" : ""}>
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <RefreshCw className={`h-5 w-5 ${todayCount > 0 ? "text-primary" : "text-muted-foreground"}`} />
              <div>
                <div className="font-medium">
                  {todayCount > 0
                    ? `${todayCount} ${todayCount === 1 ? "prenotazione sincronizzata" : "prenotazioni sincronizzate"} oggi`
                    : "Nessuna nuova prenotazione sincronizzata oggi"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Conteggio basato sulla data in cui il sistema ha ricevuto il record dal PMS (imported_at), non sulla data PMS della prenotazione.
                </div>
              </div>
            </div>
            {todayCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterType("imported")
                  setPresetPeriod("today")
                }}
              >
                Mostra solo queste
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtri Periodo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label>Filtra per</Label>
              <Select
                value={filterType}
                onValueChange={(v) =>
                  setFilterType(
                    v as "checkin" | "booking" | "cancellation" | "activity" | "imported",
                  )
                }
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activity">Attivita del Periodo</SelectItem>
                  <SelectItem value="booking">Data Prenotazione (PMS)</SelectItem>
                  <SelectItem value="imported">Sincronizzate (data import)</SelectItem>
                  <SelectItem value="cancellation">Data Cancellazione</SelectItem>
                  <SelectItem value="checkin">Data Check-in</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Dal</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[160px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Al</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[160px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Stato</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="check_out">Check-out</SelectItem>
                  <SelectItem value="annullata">Annullata</SelectItem>
                  <SelectItem value="confermata_carta">Confermata Carta</SelectItem>
                  <SelectItem value="confermata_manuale">Confermata Manuale</SelectItem>
                  <SelectItem value="check_in">Check-in</SelectItem>
                  <SelectItem value="attesa_pagamento">Attesa Pagamento</SelectItem>
                  <SelectItem value="saldo">Saldo</SelectItem>
                  <SelectItem value="opzione">Opzione</SelectItem>
                  <SelectItem value="confermata_pagamento">Confermata Pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPresetPeriod("today")}>
              Oggi
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetPeriod("yesterday")}>
              Ieri
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetPeriod("thisMonth")}>
              Mese Corrente
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetPeriod("lastMonth")}>
              Mese Scorso
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetPeriod("last3Months")}>
              Ultimi 3 Mesi
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetPeriod("last6Months")}>
              Ultimi 6 Mesi
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetPeriod("lastYear")}>
              Ultimo Anno
            </Button>
          </div>

          <Separator />

          {/* Chip "tipo prenotazione": distingue camere reali da servizi
              extra (centro benessere / day-use / ristorante) e da testate
              di gruppo. La classificazione deriva dal sentinel rate_code
              scritto dal backfill. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Tipo:</span>
            {(
              [
                { value: "all", label: "Tutti", count: sortedBookings.length },
                { value: "rooms", label: "Camere", count: kindCounts.rooms },
                { value: "extras", label: "Extra (benessere/ristorante)", count: kindCounts.extras },
                { value: "groups", label: "Testate gruppo", count: kindCounts.groups },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={kindFilter === opt.value ? "default" : "outline"}
                onClick={() => setKindFilter(opt.value)}
                disabled={opt.value !== "all" && opt.count === 0}
                className="h-7 text-xs"
              >
                {opt.label}
                <span className="ml-1.5 text-[10px] opacity-70">{opt.count}</span>
              </Button>
            ))}
          </div>

          {/* Filtri ricerca */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2 flex-1 min-w-[180px]">
              <Label>Cerca per nome ospite</Label>
              <Input
                placeholder="Es. Mario Rossi..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>

            <div className="space-y-2 min-w-[160px]">
              <Label>ID Prenotazione</Label>
              <Input
                placeholder="Es. 679..."
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
              />
            </div>

            <div className="space-y-2 min-w-[180px]">
              <Label>Canale</Label>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i canali</SelectItem>
                  {availableChannels.map((ch) => (
                    <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Risultati: {bookings.length} prenotazioni
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Caricamento...</p>
          ) : bookings.length === 0 ? (
            <div className="space-y-3 py-4">
              <p className="text-muted-foreground">
                Nessuna prenotazione trovata nel periodo selezionato con il filtro attivo.
              </p>
              {/* FIX 30/04/2026: suggerimento contestuale quando l'utente
                  cerca prenotazioni "di oggi" ma usa il filtro per
                  booking_date (data PMS). Le prenotazioni arrivate oggi nel
                  nostro sistema spesso hanno booking_date di ieri perche'
                  il PMS ha fuso orario diverso o ha tardato la
                  sincronizzazione. */}
              {todayCount !== null && todayCount > 0 && filterType !== "imported" && (
                <p className="text-sm text-muted-foreground">
                  Tuttavia oggi sono state{" "}
                  <strong className="text-foreground">sincronizzate {todayCount}</strong>{" "}
                  {todayCount === 1 ? "prenotazione" : "prenotazioni"} (data import). Vuoi vederle?{" "}
                  <Button
                    variant="link"
                    size="sm"
                    className="px-1 h-auto"
                    onClick={() => {
                      setFilterType("imported")
                      setPresetPeriod("today")
                    }}
                  >
                    Mostra le sincronizzate di oggi
                  </Button>
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="text-xs">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-1 py-1">
                      <button onClick={() => handleSort("pms_booking_id")} className="flex items-center hover:text-primary">
                        ID {getSortIcon("pms_booking_id")}
                      </button>
                    </th>
                    <th className="text-left px-1 py-1">Ospite</th>
                    <th className="text-left px-1 py-1">
                      <button onClick={() => handleSort("check_in_date")} className="flex items-center hover:text-primary">
                        In {getSortIcon("check_in_date")}
                      </button>
                    </th>
                    <th className="text-left px-1 py-1">
                      <button onClick={() => handleSort("check_out_date")} className="flex items-center hover:text-primary">
                        Out {getSortIcon("check_out_date")}
                      </button>
                    </th>
                    <th className="text-right px-1 py-1">Numero notti</th>
                    <th className="text-left px-1 py-1">Canale</th>
                    <th
                      className="text-left px-1 py-1"
                      title="Tariffa applicata (B&B, HB, Not Refundable, ecc.). Usata da Guard per confrontare solo prezzi della stessa tariffa."
                    >
                      Tariffa
                    </th>
                    <th className="text-right px-1 py-1">Tot</th>
                    <th className="text-left px-1 py-1">Stato</th>
                    <th className="text-left px-1 py-1">
                      <button onClick={() => handleSort("cancellation_date")} className="flex items-center hover:text-primary">
                        Canc. {getSortIcon("cancellation_date")}
                      </button>
                    </th>
                    <th className="text-left px-1 py-1">
                      <button onClick={() => handleSort("booking_date")} className="flex items-center hover:text-primary">
                        Creata {getSortIcon("booking_date")}
                      </button>
                    </th>
                    <th className="text-left px-1 py-1"></th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                    {filteredBookings.map((booking) => {
                    return (
                      <tr 
                        key={booking.id} 
                        className={`border-b hover:bg-muted/30 ${booking.is_cancelled ? "bg-red-50" : ""}`}
                      >
                        <td className="px-1 py-1 font-mono">{booking.pms_booking_id}</td>
                        <td className="px-1 py-1 truncate max-w-[120px]">{booking.guest_name || "-"}</td>
                        <td className="px-1 py-1 whitespace-nowrap">{formatDateShort(booking.check_in_date)}</td>
                        <td className="px-1 py-1 whitespace-nowrap">{formatDateShort(booking.check_out_date)}</td>
                        <td className="px-1 py-1 text-right tabular-nums">{getNights(booking)}</td>
                        <td className="px-1 py-1">
                          <span className={`px-1 py-0.5 rounded text-[10px] ${
                            booking.channel?.toLowerCase().includes('booking') || 
                            booking.channel?.toLowerCase().includes('expedia') ||
                            booking.channel?.toLowerCase().includes('hrs')
                              ? 'bg-orange-100 text-orange-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {booking.channel || "-"}
                          </span>
                        </td>
                        <td
                          className="px-1 py-1 truncate max-w-[140px]"
                          title={
                            booking.rate_name || booking.rate_code
                              ? `Tariffa: ${booking.rate_name || booking.rate_code}`
                              : // Quando il PMS (Scidoo) non ha mai trasmesso
                                // la tariffa sul record del booking
                                // (raw_data.rate_id vuoto), spieghiamo al
                                // tenant con un tooltip esteso anziche' una
                                // dash anonima. Il backfill DB non puo' fare
                                // nulla qui: serve azione sul PMS.
                                "Tariffa non trasmessa dal PMS. Verifica su Scidoo che il booking abbia un piano tariffario associato."
                          }
                        >
                          {(() => {
                            const cls = classifyBooking(booking.rate_code)
                            // I sentinel sono record che non sono camere reali
                            // (extra / ristorante / testate gruppo). Li mostriamo
                            // con un badge colorato distinto per non confonderli
                            // con tariffe vere e proprie.
                            if (cls.kind !== "room") {
                              return (
                                <span
                                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${cls.badgeClass}`}
                                  title={booking.rate_name ?? cls.label}
                                >
                                  {cls.label}
                                </span>
                              )
                            }
                            if (booking.rate_name || booking.rate_code) {
                              return (
                                <span className="text-[10px] text-muted-foreground">
                                  {booking.rate_name || booking.rate_code}
                                </span>
                              )
                            }
                            return (
                              <span className="inline-flex items-center rounded border border-dashed border-muted-foreground/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">
                                Non trasmessa
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-1 py-1 text-right whitespace-nowrap">{Number(booking.total_price || 0).toFixed(0)} EUR</td>
                        <td className="px-1 py-1">
                          <span className={`px-1 py-0.5 rounded text-[10px] ${
                            booking.is_cancelled 
                              ? "bg-red-100 text-red-800" 
                              : "bg-green-100 text-green-800"
                          }`}>
                            {booking.is_cancelled ? "Cancellata" : "Confermata"}
                          </span>
                        </td>
                        <td className="px-1 py-1 text-red-600 whitespace-nowrap">
                          {booking.cancellation_date ? formatDateShort(booking.cancellation_date) : "-"}
                        </td>
                        <td
                          className="px-1 py-1 whitespace-nowrap"
                          title={
                            booking.created_at
                              ? `Sincronizzata nel sistema: ${formatTimestamp(booking.created_at)}`
                              : undefined
                          }
                        >
                          {formatDateShort(booking.booking_date)}
                          {bookingTime(booking.booking_datetime) && (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {bookingTime(booking.booking_datetime)}
                            </span>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => openDetail(booking)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="text-xs border-t-2 font-semibold bg-muted/50">
                  <tr>
                    <td className="px-1 py-2" colSpan={4}>
                      Totale - {filteredBookings.length}{" "}
                      {filteredBookings.length === 1 ? "prenotazione" : "prenotazioni"}
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">
                      {filteredBookings.reduce((sum, b) => sum + getRoomNights(b), 0)}
                    </td>
                    <td className="px-1 py-2" colSpan={2} />
                    <td className="px-1 py-2 text-right whitespace-nowrap tabular-nums">
                      {filteredBookings
                        .reduce((sum, b) => sum + Number(b.total_price || 0), 0)
                        .toFixed(0)}{" "}
                      EUR
                    </td>
                    <td className="px-1 py-2" colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ADR per notti vendute vs cancellate.
          Calcolato sui bookings ATTUALMENTE filtrati (stesso set del footer della
          tabella), distinguendo per is_cancelled:
          - Vendute: revenue e notti dei bookings NON cancellati.
          - Cancellate: revenue e notti dei bookings cancellati.
          ADR = revenue / notti (n/d se notti = 0, per non mostrare numeri finti). */}
      {!loading && filteredBookings.length > 0 && (() => {
        const sold = filteredBookings.filter((b) => !b.is_cancelled)
        const cancelled = filteredBookings.filter((b) => b.is_cancelled)
        const soldNights = sold.reduce((s, b) => s + getRoomNights(b), 0)
        const soldRevenue = sold.reduce((s, b) => s + Number(b.total_price || 0), 0)
        const cancelledNights = cancelled.reduce((s, b) => s + getRoomNights(b), 0)
        const cancelledRevenue = cancelled.reduce((s, b) => s + Number(b.total_price || 0), 0)
        const adrSold = soldNights > 0 ? soldRevenue / soldNights : null
        const adrCancelled = cancelledNights > 0 ? cancelledRevenue / cancelledNights : null
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ADR (tariffa media giornaliera)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">ADR notti vendute</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {adrSold === null ? "n/d" : formatCurrency(adrSold)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatCurrency(soldRevenue)} / {soldNights.toLocaleString("it-IT")} notti camera
                    <span className="block text-[10px] opacity-70">servizi senza pernotto esclusi dalle notti</span>
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">ADR notti cancellate</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {adrCancelled === null ? "n/d" : formatCurrency(adrCancelled)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatCurrency(cancelledRevenue)} / {cancelledNights.toLocaleString("it-IT")} notti camera
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}
        </div>
      </main>

      {/* Booking Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Prenotazione #{selectedBooking.pms_booking_id}
                </DialogTitle>
                <DialogDescription>
                  {/* "Creata il" = data PMS + ora reale solo se il PMS l'ha
                      trasmessa (Scidoo si', BRiG no). "Sincronizzata" = quando
                      il nostro sistema ha aggiornato il record (updated_at): e'
                      un dato nostro, non una modifica lato PMS. */}
                  Creata il {formatDateShort(selectedBooking.booking_date)}
                  {bookingTime(selectedBooking.booking_datetime)
                    ? ` alle ${bookingTime(selectedBooking.booking_datetime)}`
                    : ""}{" "}
                  - Sincronizzata: {formatTimestamp(selectedBooking.updated_at)}
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="general" className="mt-4">
                <TabsList>
                  <TabsTrigger value="general">Generale</TabsTrigger>
                  {hasRawData(selectedBooking) && (
                    <>
                      <TabsTrigger value="guests">Ospiti ({selectedBooking.raw_data?.guests?.length || 0})</TabsTrigger>
                      <TabsTrigger value="prices">Prezzi</TabsTrigger>
                      <TabsTrigger value="payments">Pagamenti</TabsTrigger>
                      <TabsTrigger value="extras">Extra</TabsTrigger>
                    </>
                  )}
                </TabsList>

                {/* General Tab */}
                <TabsContent value="general" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Booking Info */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Informazioni Soggiorno
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Check-in:</span>
                          <span>{formatDateShort(selectedBooking.check_in_date)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Check-out:</span>
                          <span>{formatDateShort(selectedBooking.check_out_date)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Notti:</span>
                          <span>{selectedBooking.number_of_nights || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ospiti:</span>
                          <span>{selectedBooking.number_of_guests || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Stato:</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            selectedBooking.is_cancelled ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                          }`}>
                            {selectedBooking.is_cancelled ? "Cancellata" : "Confermata"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Camera:</span>
                          <span>{selectedBooking.room_types?.name || "-"}</span>
                        </div>
                        {selectedBooking.cancellation_date && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Data Cancellazione:</span>
                            <span className="text-red-600">{formatDateShort(selectedBooking.cancellation_date)}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Customer Info */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Cliente Principale
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Nome:</span>
                          <span className="font-medium">
                            {selectedBooking.raw_data?.customer
                              ? `${selectedBooking.raw_data.customer.first_name || ""} ${selectedBooking.raw_data.customer.last_name || ""}`.trim() || selectedBooking.guest_name || "-"
                              : selectedBooking.guest_name || "-"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ospiti:</span>
                          <span>{selectedBooking.number_of_guests || "-"}</span>
                        </div>
                        {selectedBooking.raw_data?.customer?.email && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground"><Mail className="h-3 w-3 inline mr-1" />Email:</span>
                            <a href={`mailto:${selectedBooking.raw_data.customer.email}`} className="text-blue-500 hover:underline text-xs">
                              {selectedBooking.raw_data.customer.email}
                            </a>
                          </div>
                        )}
                        {selectedBooking.raw_data?.customer?.mobile && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground"><Phone className="h-3 w-3 inline mr-1" />Telefono:</span>
                            <span>{selectedBooking.raw_data.customer.mobile}</span>
                          </div>
                        )}
                        {selectedBooking.raw_data?.customer?.city && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground"><MapPin className="h-3 w-3 inline mr-1" />Citta:</span>
                            <span>{selectedBooking.raw_data.customer.city} {selectedBooking.raw_data.customer.province ? `(${selectedBooking.raw_data.customer.province})` : ""}</span>
                          </div>
                        )}
                        {selectedBooking.raw_data?.customer?.citizenship && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cittadinanza:</span>
                            <span>{selectedBooking.raw_data.customer.citizenship}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Channel Info */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Building className="h-4 w-4" />
                          Canale di Provenienza
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Canale:</span>
                          <Badge variant="outline">{selectedBooking.channel || "Diretto"}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tipo Camera:</span>
                          <span>{selectedBooking.room_types?.name || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Totale:</span>
                          <span className="font-medium">{Number(selectedBooking.total_price || 0).toFixed(2)} EUR</span>
                        </div>
                      </CardContent>
                    </Card>

                  </div>
                </TabsContent>

                {/* Scidoo/API Tabs -- solo quando raw_data presente */}
                {hasRawData(selectedBooking) && (
                  <>
                    {/* Guests Tab */}
                    <TabsContent value="guests" className="space-y-4">
                      {selectedBooking.raw_data?.guests?.length > 0 ? (
                        <div className="grid gap-4">
                          {selectedBooking.raw_data.guests.map((guest: any, idx: number) => (
                            <Card key={idx}>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                  <User className="h-4 w-4" />
                                  {guest.first_name} {guest.last_name}
                                  <Badge variant="outline" className="ml-2">
                                    {guest.type === "adulto" ? "Adulto" : "Bambino"}
                                  </Badge>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                                {guest.birth_date && (
                                  <div className="flex justify-between"><span className="text-muted-foreground">Data Nascita:</span><span>{formatDateShort(guest.birth_date)}</span></div>
                                )}
                                {guest.birth_city && (
                                  <div className="flex justify-between"><span className="text-muted-foreground">Luogo Nascita:</span><span>{guest.birth_city} ({guest.birth_province})</span></div>
                                )}
                                {guest.citizenship && (
                                  <div className="flex justify-between"><span className="text-muted-foreground">Cittadinanza:</span><span>{guest.citizenship}</span></div>
                                )}
                                {guest.city && (
                                  <div className="flex justify-between"><span className="text-muted-foreground">Residenza:</span><span>{guest.city} ({guest.province})</span></div>
                                )}
                                {guest.id_type && (
                                  <div className="flex justify-between"><span className="text-muted-foreground">Documento:</span><span>{guest.id_type} - {guest.id_number}</span></div>
                                )}
                                {guest.mobile && (
                                  <div className="flex justify-between"><span className="text-muted-foreground">Cellulare:</span><span>{guest.mobile}</span></div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Nessun dettaglio ospiti disponibile</p>
                        </div>
                      )}
                    </TabsContent>

                    {/* Prices Tab */}
                    <TabsContent value="prices" className="space-y-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Euro className="h-4 w-4" />
                            Riepilogo Prezzi
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedBooking.raw_data?.daily_price && Object.keys(selectedBooking.raw_data.daily_price).length > 0 ? (
                            <div className="space-y-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead className="text-right">Prezzo</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {Object.entries(selectedBooking.raw_data.daily_price)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([date, price]: [string, any]) => (
                                      <TableRow key={date}>
                                        <TableCell>{formatDateShort(date)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(price)}</TableCell>
                                      </TableRow>
                                    ))}
                                </TableBody>
                              </Table>
                              <Separator />
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span>Subtotale Soggiorno:</span>
                                  <span>{formatCurrency(calculateDailyTotal(selectedBooking.raw_data.daily_price))}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span>Extra:</span>
                                  <span>{formatCurrency(selectedBooking.raw_data.extra_price || 0)}</span>
                                </div>
                                <Separator />
                                <div className="flex justify-between font-medium">
                                  <span>Totale:</span>
                                  <span>{formatCurrency(calculateDailyTotal(selectedBooking.raw_data.daily_price) + (selectedBooking.raw_data.extra_price || 0))}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-4 text-muted-foreground">Nessun dettaglio prezzi disponibile</div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    {/* Payments Tab */}
                    <TabsContent value="payments" className="space-y-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Pagamenti ({selectedBooking.raw_data?.payments?.length || 0})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedBooking.raw_data?.payments?.length > 0 ? (
                            <div className="space-y-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Metodo</TableHead>
                                    <TableHead>Documento</TableHead>
                                    <TableHead className="text-right">Importo</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {selectedBooking.raw_data.payments.map((payment: any, idx: number) => (
                                    <TableRow key={idx}>
                                      <TableCell>{formatDateTime(payment.date_time)}</TableCell>
                                      <TableCell>{payment.payment_method}</TableCell>
                                      <TableCell>{payment.document_type}</TableCell>
                                      <TableCell className="text-right font-medium">{formatCurrency(payment.amount)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              <Separator />
                              <div className="flex justify-between font-medium">
                                <span>Totale Pagato:</span>
                                <span className="text-green-600">{formatCurrency(calculatePaymentsTotal(selectedBooking.raw_data.payments))}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-4 text-muted-foreground">
                              <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              Nessun pagamento registrato
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    {/* Extras Tab */}
                    <TabsContent value="extras" className="space-y-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Bed className="h-4 w-4" />
                            Servizi Extra ({selectedBooking.raw_data?.extras?.length || 0})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedBooking.raw_data?.extras?.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Descrizione</TableHead>
                                  <TableHead>Data</TableHead>
                                  <TableHead className="text-right">Prezzo</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selectedBooking.raw_data.extras.map((extra: any, idx: number) => (
                                  <TableRow key={idx}>
                                    <TableCell>{extra.description}</TableCell>
                                    <TableCell>{formatDateTime(extra.date_time)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(extra.price)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <div className="text-center py-4 text-muted-foreground">
                              <Bed className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              Nessun servizio extra
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </>
                )}

              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Suspense boundary required by useSearchParams() — see Next.js docs:
// https://nextjs.org/docs/app/api-reference/functions/use-search-params#static-rendering
export default function BookingsListPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 md:p-6">
          <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        </div>
      }
    >
      <BookingsListPageInner />
    </Suspense>
  )
}
