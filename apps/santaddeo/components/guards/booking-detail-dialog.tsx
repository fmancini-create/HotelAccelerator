"use client"

/**
 * BookingDetailDialog
 *
 * Lightweight read-only detail view used from the Guard page when the user
 * clicks on a check row. It fetches the full booking via /api/ui/bookings
 * (which already joins the raw PMS payload) and shows the fields that matter
 * for auditing a price mismatch: channel, guest, dates, room, tariff, daily
 * prices, totals.
 *
 * We intentionally do NOT recreate the full multi-tab experience of the
 * Prenotazioni page — the goal here is to answer "is this booking legit?"
 * as quickly as possible, not to duplicate that whole screen.
 */

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  User,
  Mail,
  Phone,
  CalendarDays,
  BedDouble,
  Tag,
  Globe,
  Loader2,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  hotelId: string | null
  /** PMS booking id, i.e. price_guard_checks.booking_id */
  pmsBookingId: string | null
}

interface BookingRecord {
  booking_code?: string
  checkin_date?: string
  checkout_date?: string
  source_data?: {
    internal_id?: string
    status?: string
    total_price?: number | null
    origin_name?: string | null
    room_type_name?: string | null
    assigned_room?: string | null
    creation?: string | null
    nights?: number | null
    guest_count?: number | null
    customer?: {
      first_name?: string | null
      last_name?: string | null
      email?: string | null
      phone?: string | null
      mobile?: string | null
      city?: string | null
      citizenship?: string | null
    }
    daily_price?: Record<string, number>
    notes?: string | Array<{ content?: string }> | null
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return "--"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "--"
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
}

function formatCurrency(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return "--"
  return `€${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function sumDaily(daily?: Record<string, number>): number {
  if (!daily) return 0
  return Object.values(daily).reduce((s, v) => s + (Number(v) || 0), 0)
}

export function BookingDetailDialog({ open, onOpenChange, hotelId, pmsBookingId }: Props) {
  const [loading, setLoading] = useState(false)
  const [booking, setBooking] = useState<BookingRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !hotelId || !pmsBookingId) return
    setLoading(true)
    setError(null)
    setBooking(null)
    fetch(`/api/ui/bookings?hotelId=${encodeURIComponent(hotelId)}&pmsBookingId=${encodeURIComponent(pmsBookingId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json()
        const first = (data.bookings || [])[0] || null
        setBooking(first)
        if (!first) setError("Prenotazione non trovata in archivio")
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Errore sconosciuto")
      })
      .finally(() => setLoading(false))
  }, [open, hotelId, pmsBookingId])

  const rd = booking?.source_data
  const customer = rd?.customer
  const fullName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "--"
  const dailyEntries = rd?.daily_price ? Object.entries(rd.daily_price).sort() : []
  const dailySum = sumDaily(rd?.daily_price)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Prenotazione #{pmsBookingId || "--"}</span>
            {rd?.status && (
              <Badge
                variant="secondary"
                className={
                  rd.status.toLowerCase().includes("annull") || rd.status.toLowerCase().includes("cancel")
                    ? "bg-red-100 text-red-800"
                    : "bg-emerald-100 text-emerald-800"
                }
              >
                {rd.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Ricevuta il {formatDate(rd?.creation)}
            {rd?.origin_name && (
              <span className="ml-2">
                da <strong>{rd.origin_name}</strong>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Caricamento dettagli...</span>
          </div>
        )}

        {error && !loading && (
          <div className="py-8 text-center text-sm text-red-600">{error}</div>
        )}

        {!loading && !error && rd && (
          <div className="space-y-4 text-sm">
            {/* Customer */}
            <section className="space-y-2">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Cliente
              </h4>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-foreground">{fullName}</span>
                {customer?.citizenship && (
                  <Badge variant="outline" className="text-[10px]">
                    {customer.citizenship}
                  </Badge>
                )}
              </div>
              {customer?.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <a href={`mailto:${customer.email}`} className="hover:underline">
                    {customer.email}
                  </a>
                </div>
              )}
              {(customer?.mobile || customer?.phone) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  <span>{customer.mobile || customer.phone}</span>
                </div>
              )}
              {customer?.city && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4 flex-shrink-0" />
                  <span>{customer.city}</span>
                </div>
              )}
            </section>

            <Separator />

            {/* Stay */}
            <section className="space-y-2">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Soggiorno
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">Check-in:</span>
                  <span className="font-medium">{formatDate(booking?.checkin_date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">Check-out:</span>
                  <span className="font-medium">{formatDate(booking?.checkout_date)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Notti:</span>{" "}
                  <span className="font-medium">{rd.nights ?? "--"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Ospiti:</span>{" "}
                  <span className="font-medium">{rd.guest_count ?? "--"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <BedDouble className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Camera:</span>
                <span className="font-medium">
                  {rd.room_type_name || "N/D"}
                  {rd.assigned_room ? ` · ${rd.assigned_room}` : ""}
                </span>
              </div>
              {rd.origin_name && (
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">Canale:</span>
                  <Badge variant="outline">{rd.origin_name}</Badge>
                </div>
              )}
            </section>

            <Separator />

            {/* Daily prices */}
            <section className="space-y-2">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Prezzi giornalieri
              </h4>
              {dailyEntries.length > 0 ? (
                <div className="rounded-md border border-border divide-y divide-border text-xs">
                  {dailyEntries.map(([date, price]) => (
                    <div
                      key={date}
                      className="flex items-center justify-between px-3 py-1.5"
                    >
                      <span className="tabular-nums text-muted-foreground">
                        {formatDate(date)}
                      </span>
                      <span className="font-medium tabular-nums">{formatCurrency(Number(price))}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/40 font-semibold">
                    <span>Totale soggiorno</span>
                    <span className="tabular-nums">{formatCurrency(dailySum)}</span>
                  </div>
                </div>
              ) : rd.total_price != null ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 font-semibold">
                  <span>Totale</span>
                  <span className="tabular-nums">{formatCurrency(rd.total_price)}</span>
                </div>
              ) : (
                <p className="text-muted-foreground italic">Nessun prezzo giornaliero disponibile.</p>
              )}
            </section>

            {/* Link to full booking page */}
            <div className="pt-2">
              <Link
                href={`/dati/bookings?search=${encodeURIComponent(pmsBookingId || "")}`}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Apri scheda completa in Prenotazioni
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
