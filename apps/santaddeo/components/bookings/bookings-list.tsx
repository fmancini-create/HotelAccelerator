"use client"

import { useState, useEffect } from "react"
import { getSupabaseClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  Search,
  RefreshCw,
  Calendar,
  Users,
  Euro,
  ChevronLeft,
  ChevronRight,
  Eye,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  FileText,
  Building,
  User,
  Bed,
} from "lucide-react"

interface BookingsListProps {
  hotelId: string
}

interface RawBookingData {
  id?: string
  internal_id?: string
  account_id?: number
  property_id?: number
  creation?: string
  cancellation?: {
    date?: string
    reason?: string
  }
  last_modification?: string
  checkin_date?: string
  checkin_time?: string
  checkout_date?: string
  checkout_time?: string
  nights?: number
  status?: string
  rate_id?: string
  room_type_id?: number
  room_type_name?: string // Added
  assigned_room?: string // Added
  room?: string // Added
  guest_count?: number
  origin?: number
  origin_name?: string
  total_price?: number
  extra_price?: number
  no_show?: boolean
  stato_ospiti?: string
  type?: string
  group_id?: number
  creation_date?: string // Added

  // Customer info
  customer?: {
    guest_id?: number
    first_name?: string
    last_name?: string
    address?: string
    city?: string
    province?: string
    postal_code?: string
    birth_date?: string
    birth_city?: string
    birth_province?: string
    citizenship?: string
    email?: string
    phone?: string
    mobile?: string
    id_type?: string
    id_number?: string
    id_date?: string
    id_city?: string
    id_province?: string
  }

  // Guests array
  guests?: Array<{
    type?: string
    age?: string | number
    guest_id?: number
    first_name?: string
    last_name?: string
    address?: string
    city?: string
    province?: string
    postal_code?: string
    birth_date?: string
    birth_city?: string
    birth_province?: string
    citizenship?: string
    email?: string
    phone?: string
    mobile?: string
    id_type?: string
    id_number?: string
    id_date?: string
    id_city?: string
    id_province?: string
  }>

  // Daily prices
  daily_price?: Record<string, number>

  // Extras
  extras?: Array<{
    id?: string
    description?: string
    date_time?: string
    price?: number
  }>

  // Payments
  payments?: Array<{
    amount?: string | number
    payment_method?: string
    document_type?: string
    date_time?: string
  }>

  // Agency
  agency?: {
    id?: string | number
    name?: string
    reservation_id?: string
  }

  // Notes
  notes?: Array<{
    id_type?: string
    type?: string
    description?: string
  }>

  // Room info
  list_dates_type_room?: Array<{
    from?: string
    to?: string
    room_type_id?: number
  }>

  list_dates_room?: Array<{
    from?: string
    to?: string
    room_id?: number
  }>

  bed_preference?: Array<{
    name?: string
    description?: string
  }>
}

interface RawBooking {
  id: string
  hotel_id: string
  booking_code: string
  source_data: RawBookingData
  synced_at: string
}

interface Booking {
  id: string
  booking_code: string
  source_data: RawBookingData
  synced_at: string
}

const PAGE_SIZE = 20

export function BookingsList({ hotelId }: BookingsListProps) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const supabase = getSupabaseClient()

  useEffect(() => {
    loadBookings()
  }, [hotelId, page, statusFilter, dateFilter])

  const loadBookings = async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams({
        hotelId,
        page: page.toString(),
        pageSize: PAGE_SIZE.toString(),
      })

      const response = await fetch(`/api/ui/bookings?${params}`)
      if (!response.ok) {
        const err = await response.json()
        console.error("[v0] Error loading bookings:", err.error)
        return
      }

      const { bookings: data, totalCount } = await response.json()

      let transformedBookings: Booking[] = (data || []).map((raw: any) => ({
        id: raw.id,
        booking_code: raw.booking_code || raw.id,
        source_data: raw.source_data || {},
        synced_at: raw.synced_at,
      }))

      const today = new Date().toISOString().split("T")[0]

      // Apply filters client-side
      if (statusFilter !== "all") {
        transformedBookings = transformedBookings.filter(
          (b) => b.source_data?.status?.toLowerCase() === statusFilter.toLowerCase(),
        )
      }

      if (dateFilter === "upcoming") {
        transformedBookings = transformedBookings.filter((b) => (b.source_data?.checkin_date || "") >= today)
      } else if (dateFilter === "past") {
        transformedBookings = transformedBookings.filter((b) => (b.source_data?.checkout_date || "") < today)
      } else if (dateFilter === "current") {
        transformedBookings = transformedBookings.filter(
          (b) => (b.source_data?.checkin_date || "") <= today && (b.source_data?.checkout_date || "") >= today,
        )
      }

      // Sort by checkin date
      transformedBookings.sort(
        (a, b) =>
          new Date(b.source_data?.checkin_date || 0).getTime() - new Date(a.source_data?.checkin_date || 0).getTime(),
      )

      setBookings(transformedBookings)
      setTotalCount(totalCount || 0)
    } catch (error: any) {
      console.error("[v0] Error loading bookings:", error.message || error)
    } finally {
      setLoading(false)
    }
  }

  const filteredBookings = bookings.filter((booking) => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    const rd = booking.source_data
    return (
      rd?.customer?.first_name?.toLowerCase().includes(search) ||
      rd?.customer?.last_name?.toLowerCase().includes(search) ||
      rd?.customer?.email?.toLowerCase().includes(search) ||
      booking.booking_code.includes(search) ||
      rd?.internal_id?.toString().includes(search)
    )
  })

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const formatDateTime = (dateString: string | null | undefined) => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatCurrency = (amount: number | string | null | undefined) => {
    if (amount === null || amount === undefined) return "-"
    const num = typeof amount === "string" ? Number.parseFloat(amount) : amount
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(num)
  }

  const getStatusBadge = (status: string | undefined, cancellation: string | null | undefined) => {
    if (cancellation) {
      return <Badge variant="destructive">Cancellata</Badge>
    }
    switch (status?.toLowerCase()) {
      case "confirmed":
      case "confermata":
        return <Badge className="bg-green-500">Confermata</Badge>
      case "pending":
      case "in attesa":
        return <Badge variant="secondary">In attesa</Badge>
      case "check_in":
      case "checked_in":
      case "checkin":
        return <Badge className="bg-blue-500">Check-in</Badge>
      case "check_out":
      case "checked_out":
      case "checkout":
        return <Badge variant="outline">Check-out</Badge>
      case "no_show":
        return <Badge variant="destructive">No show</Badge>
      default:
        return <Badge variant="outline">{status || "N/D"}</Badge>
    }
  }

  const openDetail = (booking: Booking) => {
    setSelectedBooking(booking)
    setDetailOpen(true)
  }

  // Calculate total from daily prices
  const calculateDailyTotal = (dailyPrices: Record<string, number> | undefined) => {
    if (!dailyPrices) return 0
    return Object.values(dailyPrices).reduce((sum, price) => sum + (price || 0), 0)
  }

  // Calculate total payments
  const calculatePaymentsTotal = (payments: Array<{ amount?: string | number }> | undefined) => {
    if (!payments) return 0
    return payments.reduce(
      (sum, p) => sum + (typeof p.amount === "string" ? Number.parseFloat(p.amount) : p.amount || 0),
      0,
    )
  }

  // Numero notti: usa il campo `nights` se valorizzato, altrimenti lo calcola
  // dalla differenza checkin/checkout (per BRiG `nights` e' spesso assente/0).
  const getNights = (rd: RawBookingData | undefined): number => {
    if (!rd) return 0
    if (typeof rd.nights === "number" && rd.nights > 0) return rd.nights
    if (rd.checkin_date && rd.checkout_date) {
      const ci = new Date(rd.checkin_date).getTime()
      const co = new Date(rd.checkout_date).getTime()
      if (Number.isFinite(ci) && Number.isFinite(co) && co > ci) {
        return Math.round((co - ci) / (1000 * 60 * 60 * 24))
      }
    }
    return 0
  }

  // Importo totale della prenotazione (camera + extra).
  const getBookingTotal = (rd: RawBookingData | undefined): number => {
    if (!rd) return 0
    return calculateDailyTotal(rd.daily_price) + (rd.extra_price || 0)
  }

  // Totali calcolati sulle prenotazioni attualmente visualizzate (pagina corrente).
  const totalNights = filteredBookings.reduce((sum, b) => sum + getNights(b.source_data), 0)
  const totalRevenue = filteredBookings.reduce((sum, b) => sum + getBookingTotal(b.source_data), 0)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Prenotazioni ({totalCount})
              </CardTitle>
              <CardDescription>Lista delle prenotazioni sincronizzate dal PMS</CardDescription>
            </div>
            <Button onClick={loadBookings} disabled={loading} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome, email o ID prenotazione..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="confirmed">Confermate</SelectItem>
                <SelectItem value="pending">In attesa</SelectItem>
                <SelectItem value="check_in">Check-in</SelectItem>
                <SelectItem value="check_out">Check-out</SelectItem>
                <SelectItem value="cancelled">Cancellate</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le date</SelectItem>
                <SelectItem value="upcoming">Future</SelectItem>
                <SelectItem value="current">In corso</SelectItem>
                <SelectItem value="past">Passate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessuna prenotazione trovata</p>
              <p className="text-sm mt-2">Sincronizza le prenotazioni dalla pagina Impostazioni PMS</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Data Pren.</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead className="text-right">Numero notti</TableHead>
                      <TableHead>Tipologia</TableHead>
                      <TableHead>Camera</TableHead>
                      <TableHead>Ospiti</TableHead>
                      <TableHead>Canale</TableHead>
                      <TableHead>Totale</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Cancellazione</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookings.map((booking) => {
                      const rd = booking.source_data
                      return (
                        <TableRow
                          key={booking.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openDetail(booking)}
                        >
                          <TableCell className="font-mono text-sm">{rd?.id || booking.booking_code}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {rd?.customer?.first_name} {rd?.customer?.last_name}
                              </div>
                              {rd?.customer?.email && (
                                <div className="text-sm text-muted-foreground">{rd.customer.email}</div>
                              )}
                            </div>
                          </TableCell>
<TableCell>
                                            <div className="text-sm">{formatDateTime(rd?.creation || rd?.creation_date)}</div>
                                          </TableCell>
                          <TableCell>
                            <div>
                              <div>{formatDate(rd?.checkin_date)}</div>
                              {rd?.checkin_time && (
                                <div className="text-xs text-muted-foreground">{rd.checkin_time}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div>{formatDate(rd?.checkout_date)}</div>
                              {rd?.checkout_time && (
                                <div className="text-xs text-muted-foreground">{rd.checkout_time}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{getNights(rd)}</TableCell>
                          <TableCell>
                            <span className="text-sm">{rd?.room_type_name || rd?.room_type_id || "-"}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">{rd?.assigned_room || rd?.room || "-"}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              {rd?.guest_count || 0}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{rd?.origin_name || "Diretto"}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Euro className="h-4 w-4 text-muted-foreground" />
                              {formatCurrency(calculateDailyTotal(rd?.daily_price) + (rd?.extra_price || 0))}
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(rd?.status, rd?.cancellation?.date)}</TableCell>
                          <TableCell>
                            {rd?.cancellation?.date ? (
                              <span className="text-sm text-destructive">{formatDate(rd.cancellation.date)}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                openDetail(booking)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="font-medium">
                        Totale (pagina corrente) - {filteredBookings.length} prenotazioni
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{totalNights}</TableCell>
                      <TableCell colSpan={4} />
                      <TableCell className="font-semibold">
                        <div className="flex items-center gap-1">
                          <Euro className="h-4 w-4 text-muted-foreground" />
                          {formatCurrency(totalRevenue)}
                        </div>
                      </TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Pagina {page + 1} di {totalPages} ({totalCount} prenotazioni)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Precedente
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Successiva
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Booking Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Prenotazione #{selectedBooking.source_data?.id || selectedBooking.booking_code}
                </DialogTitle>
                <DialogDescription>
                  Creata il {formatDateTime(selectedBooking.source_data?.creation)} - Ultima modifica:{" "}
                  {formatDateTime(selectedBooking.source_data?.last_modification)}
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="general" className="mt-4">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="general">Generale</TabsTrigger>
                  <TabsTrigger value="guests">Ospiti ({selectedBooking.source_data?.guests?.length || 0})</TabsTrigger>
                  <TabsTrigger value="prices">Prezzi</TabsTrigger>
                  <TabsTrigger value="payments">Pagamenti</TabsTrigger>
                  <TabsTrigger value="extras">Extra</TabsTrigger>
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
                          <span>
                            {formatDate(selectedBooking.source_data?.checkin_date)}{" "}
                            {selectedBooking.source_data?.checkin_time}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Check-out:</span>
                          <span>
                            {formatDate(selectedBooking.source_data?.checkout_date)}{" "}
                            {selectedBooking.source_data?.checkout_time}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Notti:</span>
                          <span>{selectedBooking.source_data?.nights}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ospiti:</span>
                          <span>{selectedBooking.source_data?.guest_count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Stato:</span>
                          {getStatusBadge(
                            selectedBooking.source_data?.status,
                            selectedBooking.source_data?.cancellation?.date,
                          )}
                        </div>
                        {selectedBooking.source_data?.stato_ospiti && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Stato Ospiti:</span>
                            <span>{selectedBooking.source_data.stato_ospiti}</span>
                          </div>
                        )}
                        {selectedBooking.source_data?.no_show && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">No Show:</span>
                            <Badge variant="destructive">Sì</Badge>
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
                            {selectedBooking.source_data?.customer?.first_name}{" "}
                            {selectedBooking.source_data?.customer?.last_name}
                          </span>
                        </div>
                        {selectedBooking.source_data?.customer?.email && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              <Mail className="h-3 w-3 inline mr-1" />
                              Email:
                            </span>
                            <a
                              href={`mailto:${selectedBooking.source_data.customer.email}`}
                              className="text-blue-500 hover:underline"
                            >
                              {selectedBooking.source_data.customer.email}
                            </a>
                          </div>
                        )}
                        {(selectedBooking.source_data?.customer?.phone ||
                          selectedBooking.source_data?.customer?.mobile) && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              <Phone className="h-3 w-3 inline mr-1" />
                              Telefono:
                            </span>
                            <span>
                              {selectedBooking.source_data.customer.mobile ||
                                selectedBooking.source_data.customer.phone}
                            </span>
                          </div>
                        )}
                        {selectedBooking.source_data?.customer?.city && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              <MapPin className="h-3 w-3 inline mr-1" />
                              Città:
                            </span>
                            <span>
                              {selectedBooking.source_data.customer.city} (
                              {selectedBooking.source_data.customer.province})
                            </span>
                          </div>
                        )}
                        {selectedBooking.source_data?.customer?.birth_date && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Data Nascita:</span>
                            <span>{formatDate(selectedBooking.source_data.customer.birth_date)}</span>
                          </div>
                        )}
                        {selectedBooking.source_data?.customer?.citizenship && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cittadinanza:</span>
                            <span>{selectedBooking.source_data.customer.citizenship}</span>
                          </div>
                        )}
                        {selectedBooking.source_data?.customer?.id_type && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Documento:</span>
                            <span>
                              {selectedBooking.source_data.customer.id_type} -{" "}
                              {selectedBooking.source_data.customer.id_number}
                            </span>
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
                          <Badge variant="outline">{selectedBooking.source_data?.origin_name || "Diretto"}</Badge>
                        </div>
                        {selectedBooking.source_data?.agency && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Agenzia:</span>
                              <span>{selectedBooking.source_data.agency.name}</span>
                            </div>
                            {selectedBooking.source_data.agency.reservation_id && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">ID Prenotazione Agenzia:</span>
                                <span className="font-mono text-xs">
                                  {selectedBooking.source_data.agency.reservation_id}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tipo Camera:</span>
                          <span>
                            {selectedBooking.source_data?.room_type_name ||
                              selectedBooking.source_data?.room_type_id ||
                              "N/D"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tariffa:</span>
                          <span>{selectedBooking.source_data?.rate_id || "N/D"}</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Notes */}
                    {selectedBooking.source_data?.notes && selectedBooking.source_data.notes.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Note ({selectedBooking.source_data.notes.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          {selectedBooking.source_data.notes.map((note, idx) => (
                            <div key={idx} className="p-2 bg-muted rounded">
                              {note.type && (
                                <Badge variant="outline" className="mb-1">
                                  {note.type}
                                </Badge>
                              )}
                              <p>{note.description}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                {/* Guests Tab */}
                <TabsContent value="guests" className="space-y-4">
                  {selectedBooking.source_data?.guests && selectedBooking.source_data.guests.length > 0 ? (
                    <div className="grid gap-4">
                      {selectedBooking.source_data.guests.map((guest, idx) => (
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
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Data Nascita:</span>
                                <span>{formatDate(guest.birth_date)}</span>
                              </div>
                            )}
                            {guest.birth_city && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Luogo Nascita:</span>
                                <span>
                                  {guest.birth_city} ({guest.birth_province})
                                </span>
                              </div>
                            )}
                            {guest.citizenship && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Cittadinanza:</span>
                                <span>{guest.citizenship}</span>
                              </div>
                            )}
                            {guest.city && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Residenza:</span>
                                <span>
                                  {guest.city} ({guest.province})
                                </span>
                              </div>
                            )}
                            {guest.id_type && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Documento:</span>
                                <span>
                                  {guest.id_type} - {guest.id_number}
                                </span>
                              </div>
                            )}
                            {guest.mobile && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Cellulare:</span>
                                <span>{guest.mobile}</span>
                              </div>
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
                      {selectedBooking.source_data?.daily_price &&
                      Object.keys(selectedBooking.source_data.daily_price).length > 0 ? (
                        <div className="space-y-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead className="text-right">Prezzo</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Object.entries(selectedBooking.source_data.daily_price)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([date, price]) => (
                                  <TableRow key={date}>
                                    <TableCell>{formatDate(date)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(price)}</TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                          <Separator />
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Subtotale Soggiorno:</span>
                              <span>
                                {formatCurrency(calculateDailyTotal(selectedBooking.source_data.daily_price))}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Extra:</span>
                              <span>{formatCurrency(selectedBooking.source_data.extra_price || 0)}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between font-medium">
                              <span>Totale:</span>
                              <span>
                                {formatCurrency(
                                  calculateDailyTotal(selectedBooking.source_data.daily_price) +
                                    (selectedBooking.source_data.extra_price || 0),
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          Nessun dettaglio prezzi disponibile
                        </div>
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
                        Pagamenti ({selectedBooking.source_data?.payments?.length || 0})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedBooking.source_data?.payments && selectedBooking.source_data.payments.length > 0 ? (
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
                              {selectedBooking.source_data.payments.map((payment, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{formatDateTime(payment.date_time)}</TableCell>
                                  <TableCell>{payment.payment_method}</TableCell>
                                  <TableCell>{payment.document_type}</TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(payment.amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <Separator />
                          <div className="flex justify-between font-medium">
                            <span>Totale Pagato:</span>
                            <span className="text-green-600">
                              {formatCurrency(calculatePaymentsTotal(selectedBooking.source_data.payments))}
                            </span>
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
                        Servizi Extra ({selectedBooking.source_data?.extras?.length || 0})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedBooking.source_data?.extras && selectedBooking.source_data.extras.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Descrizione</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead className="text-right">Prezzo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedBooking.source_data.extras.map((extra, idx) => (
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

                  {/* Bed Preference */}
                  {selectedBooking.source_data?.bed_preference &&
                    selectedBooking.source_data.bed_preference.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Preferenza Letti</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedBooking.source_data.bed_preference.map((pref, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="font-medium">{pref.name}</span>
                              <span className="text-muted-foreground">{pref.description}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
