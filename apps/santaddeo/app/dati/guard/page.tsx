"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  RefreshCw, ShieldCheck, ShieldAlert, ShieldX,
  Settings2, Save, AlertCircle
} from "lucide-react"
import { BookingDetailDialog } from "@/components/guards/booking-detail-dialog"

interface GuardCheck {
  id: string
  hotel_id: string
  booking_id: string
  booking_date: string
  checkin_date: string
  checkout_date: string | null
  room_type_id: string
  rate_id: string
  occupancy: number
  booked_price: number
  expected_price: number | null
  difference_pct: number | null
  tolerance_pct: number
  result: "ok" | "warning" | "mismatch"
  checked_at: string
  night_index?: number | null
  sent_at?: string | null
  minutes_before_booking?: number | null
  notes?: string | null
  // Enriched from bookings join in /api/guard/check GET
  channel?: string | null
  guest_name?: string | null
  stay_nights?: number | null
  rate_name?: string | null
  // FEATURE 01/05/2026 (incident Barronci #4867): flag multi-tariffa
  // popolato dal Guard auto-detect (booked > expected*1.20 AND nights>=2)
  // o tramite override manuale dal toggle UI.
  is_multi_rate?: boolean
  // True se la tariffa di QUESTA notte e' stata overridden manualmente
  // dall'utente (price_guard_checks.rate_id_override IS NOT NULL).
  is_overridden?: boolean
  // UUID della rate di override (NON il rate del booking).
  rate_id_override?: string | null
  // UUID della rate effettivamente usata per il check di questa notte
  // (override se presente, sennò la rate del booking).
  rate_id?: string | null
}

const RESULT_CONFIG: Record<string, { label: string; badgeClass: string; icon: typeof ShieldCheck }> = {
  ok: {
    label: "OK",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: ShieldCheck,
  },
  warning: {
    label: "Attenzione",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: ShieldAlert,
  },
  mismatch: {
    label: "Mismatch",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: ShieldX,
  },
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}

function formatPrice(n: number | null) {
  if (n == null) return "--"
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(n)
}

/**
 * FIX 30/04/2026 — single source of truth per la classificazione visiva.
 *
 * Deriviamo il result EFFETTIVO direttamente dai prezzi grezzi salvati nel
 * record (booked_price, expected_price) invece di fidarci del campo `result`
 * memorizzato. Motivo: i record scansionati prima del fix di ieri hanno
 * `difference_pct` ASSOLUTO, quindi una prenotazione sopra-prezzo del 30%
 * (favorevole) finiva in `result='mismatch'` con badge rosso. Forziamo a OK
 * tutti i casi `booked >= expected` indipendentemente dal valore salvato.
 *
 * Regola unica: rosso/ambra SOLO se booked < expected oltre soglia.
 *  - booked >= expected            → "ok" (verde, anche se di tanto)
 *  - booked < expected, |diff| > tol → "mismatch" (rosso)
 *  - booked < expected, |diff| > tol/2 → "warning" (ambra)
 *  - altrimenti                    → "ok"
 */
function getEffectiveResult(check: GuardCheck): "ok" | "warning" | "mismatch" {
  if (check.booked_price == null || check.expected_price == null || check.expected_price <= 0) {
    return check.result // niente da derivare, conserva quello salvato
  }
  if (check.booked_price >= check.expected_price) {
    // Sovra-prezzo o pareggio: sempre OK, indipendentemente da quello che dice
    // il vecchio campo `result` (legacy abs-based).
    return "ok"
  }
  const absPct = Math.abs(((check.booked_price - check.expected_price) / check.expected_price) * 100)
  const tol = check.tolerance_pct ?? 5
  if (absPct > tol) return "mismatch"
  if (absPct > tol / 2) return "warning"
  return "ok"
}

/**
 * Diff% firmato per il display: positivo = sovra-prezzo (favorevole),
 * negativo = sotto-prezzo. Calcolato dai grezzi cosi' funziona anche con
 * record vecchi che hanno `difference_pct` salvato come valore assoluto.
 */
function getSignedDiffPct(check: GuardCheck): number | null {
  if (check.booked_price == null || check.expected_price == null || check.expected_price <= 0) {
    return null
  }
  return ((check.booked_price - check.expected_price) / check.expected_price) * 100
}

/**
 * Restituisce classi CSS per colorare il badge del canale di prenotazione.
 * Ogni OTA/canale ha un colore distintivo per identificarli a colpo d'occhio.
 */
function getChannelColorClasses(channel: string | null | undefined): string {
  if (!channel) return ""
  const ch = channel.toLowerCase()
  // Booking.com - blu
  if (ch.includes("booking")) return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700"
  // Expedia / Hotels.com - giallo/oro
  if (ch.includes("expedia") || ch.includes("hotels.com")) return "bg-yellow-100 text-yellow-800 border-yellow-400 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700"
  // Airbnb - rosso/rosa
  if (ch.includes("airbnb")) return "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700"
  // Diretto / Sito / Direct - verde
  if (ch.includes("dirett") || ch.includes("direct") || ch.includes("sito") || ch.includes("website")) return "bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700"
  // Telefono / Walk-in - verde chiaro
  if (ch.includes("telefon") || ch.includes("phone") || ch.includes("walk")) return "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700"
  // Agenzie / Tour operator - viola
  if (ch.includes("agenz") || ch.includes("agency") || ch.includes("tour") || ch.includes("operator")) return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700"
  // Google - arancione
  if (ch.includes("google")) return "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700"
  // TripAdvisor - verde lime
  if (ch.includes("tripadvisor")) return "bg-lime-100 text-lime-800 border-lime-400 dark:bg-lime-900/40 dark:text-lime-300 dark:border-lime-700"
  // Default - grigio neutro
  return "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600"
}

/**
 * Riassume il motivo per cui `expected_price` e' null in 2-3 parole,
 * cosi' la cella della tabella resta corta. Il dettaglio completo resta
 * nel `title=` (tooltip) della cella stessa.
 *
 * Mappa i pattern di `notes` generati da /api/guard/scan:
 *  - "Nessun prezzo mai inviato..."        → "Mai pushata"
 *  - "Tariffa non monitorata..."           → "Tariffa non monitorata"
 *  - "...l'ultimo invio (...) e' DOPO..."  → "Push dopo prenotazione"
 *  - "Prezzi inviati per questa cella esistono ma tutti DOPO..." → "Push dopo prenotazione"
 */
function summarizeMissingExpectedReason(notes: string | null | undefined): string {
  if (!notes) return "Non disponibile"
  if (/Tariffa non monitorata/i.test(notes)) return "Tariffa non monitorata"
  if (/DOPO la prenotazione|tutti DOPO/i.test(notes)) return "Push dopo prenotazione"
  if (/Nessun prezzo mai inviato/i.test(notes)) return "Mai pushata"
  return "Non disponibile"
}

export default function GuardPage() {
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)

  const [checks, setChecks] = useState<GuardCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ total: number; nights?: number; verified: number; ok: number; warning: number; mismatch: number; skipped: number } | null>(null)
  const [resultFilter, setResultFilter] = useState<string>("all")
  // FEATURE 01/05/2026: filtri aggiuntivi per canale (Booking, Expedia,
  // Diretto, ...) e tariffa (B&B, Be Safe, ...). Le opzioni sono derivate
  // dinamicamente dai checks correnti tramite distinct, cosi' non
  // mostriamo voci vuote quando il dataset e' piccolo.
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [rateFilter, setRateFilter] = useState<string>("all")

  // Config
  const [tolerancePct, setTolerancePct] = useState<number>(5.0)
  const [toleranceInput, setToleranceInput] = useState<string>("5")
  const [timeToleranceMin, setTimeToleranceMin] = useState<number>(60)
  const [timeToleranceInput, setTimeToleranceInput] = useState<string>("60")
  // Ambito tariffe da confrontare: "active" (solo attive) o "all" (tutte).
  // rateScope = valore persistito, rateScopeInput = selezione in sospeso.
  const [rateScope, setRateScope] = useState<"active" | "all">("active")
  const [rateScopeInput, setRateScopeInput] = useState<"active" | "all">("active")
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  // Lookback window for scan + list, based on booking receipt date.
  // Default: 2 days (the typical pace at which Santaddeo checks new bookings).
  // Accepted presets: 1, 2, 7, 30 days. "Custom" is also supported via a
  // numeric input next to the preset.
  const [scanDays, setScanDays] = useState<number>(2)

  // Booking detail dialog state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null)

  // FEATURE 01/05/2026 (per-night rate override): lista delle tariffe
  // dell'hotel per popolare il dropdown "Override tariffa" sulle righe
  // delle prenotazioni multi-tariffa. Caricata una volta all'apertura della
  // pagina e cached fin tanto che l'hotel non cambia.
  const [hotelRates, setHotelRates] = useState<Array<{ id: string; name: string | null; code: string | null }>>(
    [],
  )
  // Stato della cella "override in corso" — id del check su cui stiamo
  // applicando un cambio per disabilitare il dropdown durante la fetch.
  const [overridePendingId, setOverridePendingId] = useState<string | null>(null)

  // Auth
  useEffect(() => {
    loadUserHotel()
  }, [])

  async function loadUserHotel() {
    try {
      const meRes = await fetch("/api/ui/me")
      const meData = await meRes.json()
      const allowedRoles = ["super_admin", "system_admin", "property_admin", "villa_admin"]
      const userRole = meData.role || meData.user?.role
      if (!meData.isSuperAdmin && !allowedRoles.includes(userRole)) {
        setUnauthorized(true)
        setLoading(false)
        return
      }
      setIsSuperAdmin(meData.isSuperAdmin || false)

      const res = await fetch("/api/ui/selected-hotel")
      const data = await res.json()
      if (data.error || !data.hotel) {
        setLoading(false)
        return
      }
      setHotelId(data.hotel.id)
      setHotelName(data.hotel.name)
    } catch {
      setLoading(false)
    }
  }

  // Load guard config
  useEffect(() => {
    if (!hotelId) return
    fetch(`/api/guard/config?hotelId=${hotelId}`)
      .then((r) => r.json())
      .then((d) => {
        setTolerancePct(d.tolerancePct ?? 5.0)
        setToleranceInput(String(d.tolerancePct ?? 5))
        setTimeToleranceMin(d.timeToleranceMin ?? 60)
        setTimeToleranceInput(String(d.timeToleranceMin ?? 60))
        setRateScope(d.rateScope === "all" ? "all" : "active")
        setRateScopeInput(d.rateScope === "all" ? "all" : "active")
      })
      .catch(() => {})
  }, [hotelId])

  // Load checks scoped to the same lookback window as the scan, so the UI
  // shows exactly the bookings the user asked to inspect.
  const fetchChecks = useCallback(async () => {
    if (!hotelId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        hotelId,
        limit: "200",
        days: String(scanDays),
      })
      // FIX 30/04/2026: il filtro per "result" e' applicato CLIENT-SIDE via
      // getEffectiveResult, perche' il campo `result` salvato in DB e'
      // legacy abs-based per i record vecchi. Il backend ritorna tutto e
      // poi filtriamo qui sotto in displayedChecks.
      const [checksRes, ratesRes] = await Promise.all([
        fetch(`/api/guard/check?${params}`),
        // Carico in parallelo le rate dell'hotel per popolare il dropdown
        // di override per-night sulle prenotazioni multi-tariffa.
        fetch(`/api/rates?hotel_id=${hotelId}`),
      ])
      if (checksRes.ok) {
        const data = await checksRes.json()
        setChecks(data.checks || [])
      }
      if (ratesRes.ok) {
        const ratesData = await ratesRes.json()
        const sortedRates = (ratesData.rates ?? [])
          .map((r: any) => ({ id: r.id, name: r.name, code: r.code }))
          .sort((a: any, b: any) =>
            (a.name ?? "").localeCompare(b.name ?? "", "it"),
          )
        setHotelRates(sortedRates)
      }
    } catch {
      setChecks([])
    } finally {
      setLoading(false)
    }
  }, [hotelId, resultFilter, scanDays])

  // Run scan automatically on first load, then fetch checks.
  // `days` comes from the user-selected lookback window (booking receipt date).
  const runScan = useCallback(async (silent = false, force = false) => {
    if (!hotelId) return
    if (!silent) setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch("/api/guard/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, days: scanDays, force }),
      })
      if (res.ok) {
        const data = await res.json()
        setScanResult(data.summary)
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setScanning(false)
    }
  }, [hotelId, scanDays])

  // First-time initialization: run a silent scan with the default window
  // and then load the checks. We do NOT depend on runScan / fetchChecks refs
  // here, so changing the lookback selector doesn't re-trigger a scan.
  const [didInitialScan, setDidInitialScan] = useState(false)
  useEffect(() => {
    if (hotelId && !unauthorized && !didInitialScan) {
      setDidInitialScan(true)
      runScan(true).then(() => fetchChecks())
    }
  }, [hotelId, unauthorized, didInitialScan, runScan, fetchChecks])

  // Re-fetch the list when the user changes the lookback window or the
  // result filter. No scan is triggered: the list simply reflects what's
  // already stored, scoped to the selected window.
  useEffect(() => {
    if (hotelId && !unauthorized && didInitialScan) {
      fetchChecks()
    }
  }, [scanDays, resultFilter, hotelId, unauthorized, didInitialScan, fetchChecks])

  /**
   * Imposta o rimuove un override di tariffa per una specifica notte.
   *
   * Usato per le prenotazioni multi-tariffa quando l'operatore vuole
   * dichiarare "questa notte e' stata venduta come Pernottamento, non
   * come la tariffa B&B del booking". Update ottimistico in UI; al
   * prossimo scan il Guard ricalcola expected_price/result usando la
   * rate corretta.
   */
  async function setNightOverride(
    check: GuardCheck,
    rateId: string | null,
  ) {
    if (!hotelId || !check.booking_id || !check.checkin_date) return
    setOverridePendingId(check.id)
    // Optimistic update: aggiorna in UI il rate_id e is_overridden della
    // riga interessata. Il rate_name viene allineato dal lookup di
    // hotelRates per riflettere immediatamente il cambio.
    const newRate = rateId ? hotelRates.find((r) => r.id === rateId) : null
    setChecks((prev) =>
      prev.map((c) =>
        c.id === check.id
          ? {
              ...c,
              rate_id: rateId,
              rate_id_override: rateId,
              is_overridden: !!rateId,
              rate_name: newRate?.name ?? null,
            }
          : c,
      ),
    )
    try {
      const res = await fetch("/api/guard/night-rate-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          booking_id: check.booking_id,
          checkin_date: check.checkin_date,
          rate_id: rateId,
        }),
      })
      if (!res.ok) {
        // FIX 01/05/2026 (incident "il dropdown ricarica senza salvare"):
        // prima il rollback era silenzioso (`fetchChecks` riportava la
        // lista allo stato pre-click) e l'utente percepiva "la pagina si
        // ricarica senza modifiche". Ora mostriamo il messaggio di errore
        // esplicito cosi' si vede subito SE c'e' un problema di permessi,
        // di rate non trovata, di riga price_guard_checks mancante, ecc.
        const j = await res.json().catch(() => ({}))
        const msg =
          j?.error ||
          (res.status === 401
            ? "Sessione scaduta, ricarica la pagina"
            : res.status === 403
              ? "Non hai i permessi per modificare questa tariffa"
              : res.status === 404
                ? "Riga Guard non trovata. Lancia uno scan e riprova."
                : `Errore ${res.status}`)
        console.error("[v0] night-rate-override failed:", res.status, j)
        alert(`Override tariffa non riuscito: ${msg}`)
        // Rollback: ricarico la lista pulita dal server.
        await fetchChecks()
      }
    } catch (err) {
      console.error("[v0] night-rate-override network error:", err)
      alert("Override tariffa non riuscito: errore di rete. Riprova.")
      await fetchChecks()
    } finally {
      setOverridePendingId(null)
    }
  }

  /**
   * Toggle manuale del flag multi-tariffa su un booking.
   *
   * Used when the auto-detect heuristic (booked > expected*1.20 AND
   * nights >= 2) flags a booking incorrectly: cliccando il badge
   * "Multi-tariffa" l'operatore lo disattiva. Update ottimistico in UI
   * + rollback in caso di errore server.
   */
  async function toggleMultiRate(pmsBookingId: string, value: boolean) {
    if (!hotelId) return
    // Optimistic update: aggiorna in UI tutti i check di questo booking.
    setChecks((prev) =>
      prev.map((c) =>
        c.booking_id === pmsBookingId ? { ...c, is_multi_rate: value } : c,
      ),
    )
    try {
      const res = await fetch("/api/guard/booking-multi-rate-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: pmsBookingId,
          hotel_id: hotelId,
          value,
        }),
      })
      if (!res.ok) {
        // Rollback: rimetti il vecchio valore.
        setChecks((prev) =>
          prev.map((c) =>
            c.booking_id === pmsBookingId ? { ...c, is_multi_rate: !value } : c,
          ),
        )
      }
    } catch {
      setChecks((prev) =>
        prev.map((c) =>
          c.booking_id === pmsBookingId ? { ...c, is_multi_rate: !value } : c,
        ),
      )
    }
  }

  // Save tolerance (both % and time together, so a single "Salva" commits both)
  async function saveTolerance() {
    if (!hotelId) return
    const pct = parseFloat(toleranceInput)
    const minutes = parseInt(timeToleranceInput, 10)
    if (isNaN(pct) || pct < 0 || pct > 100) return
    if (isNaN(minutes) || minutes < 0 || minutes > 1440) return
    // Lo scope tariffe agisce lato server durante lo scan: se cambia, serve un
    // re-scan forzato per applicarlo alle righe gia' calcolate.
    const scopeChanged = rateScopeInput !== rateScope
    setSavingConfig(true)
    try {
      await fetch("/api/guard/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          tolerancePct: pct,
          timeToleranceMin: minutes,
          rateScope: rateScopeInput,
        }),
      })
      setTolerancePct(pct)
      setTimeToleranceMin(minutes)
      setRateScope(rateScopeInput)
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2000)
      if (scopeChanged) {
        await runScan(false, true)
        await fetchChecks()
      }
    } catch {
      // ignore
    } finally {
      setSavingConfig(false)
    }
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <ShieldX className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Accesso non autorizzato</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Devi essere un super admin per accedere al Price Guard.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // FIX 30/04/2026: counter e filtro UI basati su getEffectiveResult per
  // gestire anche i record scansionati prima del fix abs->signed (rispetto
  // del segno reale). I counter sono sempre calcolati sull'INTERA lista
  // (non filtrata) cosi' l'utente vede i totali del periodo selezionato
  // anche quando filtra per stato.
  const okCount = checks.filter((c) => getEffectiveResult(c) === "ok").length
  const warnCount = checks.filter((c) => getEffectiveResult(c) === "warning").length
  const mismatchCount = checks.filter((c) => getEffectiveResult(c) === "mismatch").length

  // Costanti di label per canale/tariffa "vuoti" — i record senza valore
  // vengono raggruppati sotto questa stringa nella distinct list e nel
  // filtraggio. "__none__" e' il marker interno (mai conflitto con valori
  // reali del PMS, che sono sempre stringhe non vuote o assenti).
  const NONE_KEY = "__none__"
  const distinctChannels = Array.from(
    new Set(checks.map((c) => (c.channel && c.channel.trim() ? c.channel : NONE_KEY))),
  ).sort((a, b) => {
    if (a === NONE_KEY) return 1
    if (b === NONE_KEY) return -1
    return a.localeCompare(b, "it")
  })
  const distinctRates = Array.from(
    new Set(checks.map((c) => (c.rate_name && c.rate_name.trim() ? c.rate_name : NONE_KEY))),
  ).sort((a, b) => {
    if (a === NONE_KEY) return 1
    if (b === NONE_KEY) return -1
    return a.localeCompare(b, "it")
  })

  // Lista visualizzata in tabella, filtrata client-side per stato effettivo,
  // canale e tariffa. Tutti e tre i filtri sono in AND.
  const displayedChecks = checks.filter((c) => {
    if (resultFilter !== "all" && getEffectiveResult(c) !== resultFilter) return false
    if (channelFilter !== "all") {
      const ch = c.channel && c.channel.trim() ? c.channel : NONE_KEY
      if (ch !== channelFilter) return false
    }
    if (rateFilter !== "all") {
      const rn = c.rate_name && c.rate_name.trim() ? c.rate_name : NONE_KEY
      if (rn !== rateFilter) return false
    }
    return true
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
              Price Guard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Controllo coerenza prezzi prenotati vs prezzi attesi
              {hotelName && <span className="font-medium"> - {hotelName}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/*
              Lookback window: the user picks how far back to scan based on
              the date the booking was received (booking_date). Default 2d.
              Same value is used by `fetchChecks` so the list always reflects
              the selected window.
            */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Periodo:
              </span>
              <Select
                value={String(scanDays)}
                onValueChange={(v) => setScanDays(Number(v))}
                disabled={scanning || loading}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">Ultime 12h</SelectItem>
                  <SelectItem value="1">Ultime 24h</SelectItem>
                  <SelectItem value="2">Ultimi 2 gg</SelectItem>
                  <SelectItem value="7">Ultimi 7 gg</SelectItem>
                  <SelectItem value="30">Ultimi 30 gg</SelectItem>
                  <SelectItem value="90">Ultimi 90 gg</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={async () => {
                setScanning(true)
                await runScan(false, true)
                await fetchChecks()
                setScanning(false)
              }}
              variant="default"
              size="sm"
              disabled={scanning || loading}
              className="gap-2"
            >
              <ShieldCheck className={`h-4 w-4 ${scanning ? "animate-pulse" : ""}`} />
              {scanning ? "Scansione..." : "Esegui Scansione"}
            </Button>
            <Button
              onClick={fetchChecks}
              variant="outline"
              size="sm"
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <ShieldCheck className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{checks.length}</p>
                <p className="text-xs text-muted-foreground">Totale Controlli</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
                <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{okCount}</p>
                <p className="text-xs text-muted-foreground">OK</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{warnCount}</p>
                <p className="text-xs text-muted-foreground">Attenzione</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="rounded-lg bg-red-100 dark:bg-red-900/30 p-2">
                <ShieldX className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{mismatchCount}</p>
                <p className="text-xs text-muted-foreground">Sotto-prezzo</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scan result banner */}
        {scanResult && scanResult.total > 0 && (
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-900 dark:text-blue-300">
                  Ultima scansione: {scanResult.total} prenotazioni
                  {scanResult.nights ? ` · ${scanResult.nights} notti` : ""}
                </span>
                <span className="text-blue-700 dark:text-blue-400">
                  {scanResult.verified} verificate ({scanResult.ok} OK, {scanResult.warning} attenzione, {scanResult.mismatch} mismatch)
                  {scanResult.skipped > 0 && ` - ${scanResult.skipped} notti saltate (dati incompleti o prezzo non tracciato)`}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Config: tolerances */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 min-w-[170px]">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Tolleranza prezzo:
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={toleranceInput}
                  onChange={(e) => setToleranceInput(e.target.value)}
                  className="w-20 h-8 text-sm"
                  min={0}
                  max={100}
                  step={0.5}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground ml-auto">
                Oltre {tolerancePct}% = mismatch, oltre {(tolerancePct / 2).toFixed(1)}% = attenzione
              </p>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 min-w-[170px]">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Tolleranza temporale:
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={timeToleranceInput}
                  onChange={(e) => setTimeToleranceInput(e.target.value)}
                  className="w-20 h-8 text-sm"
                  min={0}
                  max={1440}
                  step={5}
                />
                <span className="text-sm text-muted-foreground">min</span>
                <Button
                  onClick={saveTolerance}
                  size="sm"
                  variant="outline"
                  disabled={
                    savingConfig ||
                    (toleranceInput === String(tolerancePct) &&
                      timeToleranceInput === String(timeToleranceMin) &&
                      rateScopeInput === rateScope)
                  }
                  className="gap-1.5 h-8"
                >
                  {savingConfig ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : configSaved ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {configSaved ? "Salvato" : "Salva"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground ml-auto max-w-md text-right">
                Finestra di propagazione OTA: se il prezzo è stato inviato entro {timeToleranceMin} min prima della prenotazione, il sistema valuta come valido anche il prezzo precedente.
              </p>
            </div>

            <div className="flex items-center gap-4 flex-wrap border-t pt-3">
              <div className="flex items-center gap-2 min-w-[170px]">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Tariffe da controllare:
                </span>
              </div>
              <Select
                value={rateScopeInput}
                onValueChange={(v) => setRateScopeInput(v === "all" ? "all" : "active")}
              >
                <SelectTrigger className="h-8 w-[240px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Solo tariffe attive</SelectItem>
                  <SelectItem value="all">Tutte le tariffe</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground ml-auto max-w-md text-right">
                {rateScopeInput === "active"
                  ? "Confronta solo le prenotazioni su tariffe attive in Santaddeo (consigliato): evita falsi mismatch su tariffe non più gestite."
                  : "Confronta tutte le prenotazioni, incluse le tariffe derivate/-OTA/promo. Utile solo se l'RMS pubblica prezzi aggiornati anche per quelle."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Filter */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Filtra per:</span>
              <Select value={resultFilter} onValueChange={setResultFilter}>
                <SelectTrigger className="w-[180px] h-8 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i risultati</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="warning">Attenzione</SelectItem>
                  <SelectItem value="mismatch">Mismatch</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={channelFilter}
                onValueChange={setChannelFilter}
                disabled={distinctChannels.length === 0}
              >
                <SelectTrigger className="w-[180px] h-8 text-sm">
                  <SelectValue placeholder="Canale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i canali</SelectItem>
                  {distinctChannels.map((ch) => (
                    <SelectItem key={ch} value={ch}>
                      {ch === NONE_KEY ? "Senza canale" : ch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={rateFilter}
                onValueChange={setRateFilter}
                disabled={distinctRates.length === 0}
              >
                <SelectTrigger className="w-[200px] h-8 text-sm">
                  <SelectValue placeholder="Tariffa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le tariffe</SelectItem>
                  {distinctRates.map((rn) => (
                    <SelectItem key={rn} value={rn}>
                      {rn === NONE_KEY ? "Senza tariffa" : rn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(resultFilter !== "all" || channelFilter !== "all" || rateFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setResultFilter("all")
                    setChannelFilter("all")
                    setRateFilter("all")
                  }}
                >
                  Reset
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {displayedChecks.length} di {checks.length} controlli
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Controlli Prenotazioni</CardTitle>
            <CardDescription>
              Confronto tra prezzo prenotato e prezzo atteso al momento della prenotazione
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Caricamento...
              </div>
            )}

            {!loading && checks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ShieldCheck className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Nessun controllo registrato</p>
                <p className="text-xs mt-1">
                  I controlli appariranno quando vengono verificate le prenotazioni.
                </p>
              </div>
            )}

            {!loading && checks.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2.5 pr-3 font-medium">Stato</th>
                      <th className="text-left py-2.5 pr-3 font-medium">Booking ID</th>
                      <th className="text-left py-2.5 pr-3 font-medium">Canale</th>
                      <th
                        className="text-left py-2.5 pr-3 font-medium"
                        title="Tariffa applicata alla prenotazione (es. B&B Standard, Not Refundable). Guard confronta SOLO prezzi della stessa tariffa: confrontare tariffe diverse darebbe falsi mismatch."
                      >
                        Tariffa
                      </th>
                      <th className="text-left py-2.5 pr-3 font-medium">Notte</th>
                      <th
                        className="text-right py-2.5 pr-3 font-medium"
                        title="Prezzo a cui la prenotazione è stata effettivamente accettata + data e ora di ricevimento"
                      >
                        Prenotato
                      </th>
                      <th
                        className="text-right py-2.5 pr-3 font-medium"
                        title="Prezzo che era impostato sul PMS al momento della prenotazione + data e ora dell'ultimo invio del prezzo"
                      >
                        Atteso
                      </th>
                      <th className="text-right py-2.5 pr-3 font-medium">Diff %</th>
                      <th
                        className="text-right py-2.5 pr-3 font-medium"
                        title="Minuti tra l'invio del prezzo e la prenotazione. Entro la tolleranza temporale il prezzo precedente è considerato valido."
                      >
                        Δ min
                      </th>
                      <th className="text-left py-2.5 font-medium">Verificato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedChecks.map((check) => {
                      // FIX 30/04/2026: usiamo SEMPRE getEffectiveResult per
                      // il badge cosi' i record vecchi (scansionati con la
                      // logica abs pre-fix) vengono visualizzati correttamente
                      // basandosi sui prezzi grezzi salvati.
                      const effective = getEffectiveResult(check)
                      const cfg = RESULT_CONFIG[effective]
                      const Icon = cfg.icon
                      const signedDiff = getSignedDiffPct(check)
                      const totalNights =
                        check.checkout_date
                          ? Math.max(
                              1,
                              Math.round(
                                (new Date(check.checkout_date).getTime() -
                                  new Date(check.checkin_date).getTime()) /
                                  86_400_000
                              )
                            )
                          : null
                      const nightLabel =
                        check.night_index != null && totalNights != null && totalNights > 1
                          ? `${formatDate(check.checkin_date)} (${check.night_index + 1}/${totalNights})`
                          : check.checkin_date
                            ? formatDate(check.checkin_date)
                            : "--"
                      return (
                        <tr
                          key={check.id}
                          className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                          title={check.notes || "Clicca per vedere il dettaglio della prenotazione"}
                          onClick={(e) => {
                            // FIX 01/05/2026: il <select> nativo per
                            // l'override tariffa, dopo la chiusura del
                            // dropdown del browser, emette un click
                            // sintetico che bubblava fino a questa <tr>
                            // aprendo il modale dei dettagli — l'utente
                            // vedeva "la pagina ricarica senza salvare"
                            // mentre in realta' il fetch di setNightOverride
                            // partiva, ma il dialog dettagli copriva tutto.
                            // Soluzione: skippa il row-click se il target
                            // e' un controllo interattivo o discende da una
                            // zona marcata data-no-row-click.
                            const target = e.target as HTMLElement
                            if (
                              target.closest("[data-no-row-click]") ||
                              ["SELECT", "OPTION", "BUTTON", "INPUT", "TEXTAREA", "LABEL"].includes(target.tagName)
                            ) {
                              return
                            }
                            if (!check.booking_id) return
                            setDetailBookingId(check.booking_id)
                            setDetailOpen(true)
                          }}
                        >
                          <td className="py-2.5 pr-3">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 gap-1 ${cfg.badgeClass}`}
                            >
                              <Icon className="h-3 w-3" />
                              {cfg.label}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-3 text-foreground font-mono text-xs">
                            <span className="hover:underline">{check.booking_id || "--"}</span>
                          </td>
                          <td className="py-2.5 pr-3">
                            {check.channel ? (
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] font-medium ${getChannelColorClasses(check.channel)}`}
                              >
                                {check.channel}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </td>
                          <td
                            className="py-2.5 pr-3"
                            data-no-row-click
                            title={
                              check.is_overridden
                                ? "Tariffa override manuale: l'utente ha dichiarato che questa specifica notte e' stata venduta a una tariffa diversa da quella del booking. Usa il menu per cambiarla o resettarla. Lo scan successivo ricalcola il prezzo atteso usando la rate override."
                                : check.is_multi_rate
                                  ? "Possibile prenotazione multi-tariffa: il prezzo medio e' superiore di oltre il 20% rispetto a quello atteso per questa rate, su uno stay >= 2 notti. Usa il menu Override per assegnare una tariffa diversa a questa notte."
                                  : check.rate_name
                                    ? `Tariffa: ${check.rate_name}. Guard confronta solo prezzi inviati per questa esatta tariffa.`
                                    : "Tariffa non specificata dalla prenotazione: Guard confronta col prezzo piu' recente della camera/notte."
                            }
                          >
                            <div
                              className="flex items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {check.rate_name ? (
                                <span
                                  className={`text-xs truncate block max-w-[160px] ${
                                    check.is_overridden ? "text-purple-700 dark:text-purple-300 font-medium" : "text-foreground"
                                  }`}
                                >
                                  {check.is_overridden && <span className="mr-1">*</span>}
                                  {check.rate_name}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">non spec.</span>
                              )}
                              {(check.is_multi_rate || check.is_overridden) && (
                                <select
                                  value={check.rate_id_override ?? ""}
                                  disabled={overridePendingId === check.id || hotelRates.length === 0}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    void setNightOverride(check, v === "" ? null : v)
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] h-6 max-w-[140px] rounded border border-purple-300 bg-purple-50 px-1 text-purple-800 hover:bg-purple-100 disabled:opacity-50 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-200"
                                  aria-label="Override tariffa per questa notte"
                                  title="Cambia tariffa per questa notte (multi-tariffa)"
                                >
                                  <option value="">
                                    {check.is_overridden ? "(rimuovi override)" : "Override..."}
                                  </option>
                                  {hotelRates.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name || r.code || r.id.slice(0, 8)}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {check.is_multi_rate && !check.is_overridden && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void toggleMultiRate(check.booking_id, false)
                                  }}
                                  className="inline-flex items-center gap-0.5 rounded border border-purple-300 bg-purple-50 px-1 py-0.5 text-[9px] font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                  aria-label="Disattiva flag multi-tariffa per questa prenotazione"
                                  title="Rimuovi flag multi-tariffa: usa quando l'auto-detect ha sbagliato"
                                >
                                  x
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-foreground">{nightLabel}</td>
                          {/*
                            FIX 30/04/2026 — Timing visibility:
                            - "Prenotato": prezzo + timestamp del booking_date
                            - "Atteso":    prezzo + timestamp del sent_at
                            Entrambe le celle hanno tooltip esplicativo via title
                            attribute per dare contesto a colpo d'occhio senza
                            cliccare la riga.
                          */}
                          <td
                            className="py-2.5 pr-3 text-right text-foreground font-medium cursor-help"
                            title={
                              check.booking_date
                                ? `Prenotazione ricevuta il ${formatTimestamp(check.booking_date)}`
                                : "Data prenotazione non disponibile"
                            }
                          >
                            <div>{formatPrice(check.booked_price)}</div>
                            {check.booking_date && (
                              <div className="text-[10px] font-normal text-muted-foreground tabular-nums mt-0.5">
                                {formatTimestamp(check.booking_date)}
                              </div>
                            )}
                          </td>
                          <td
                            className="py-2.5 pr-3 text-right text-muted-foreground cursor-help"
                            title={
                              check.expected_price == null && check.notes
                                ? check.notes
                                : check.sent_at
                                  ? `Prezzo inviato al PMS il ${formatTimestamp(check.sent_at)}` +
                                    (check.minutes_before_booking != null
                                      ? ` (${check.minutes_before_booking} min prima della prenotazione)`
                                      : "")
                                  : "Data invio prezzo non disponibile"
                            }
                          >
                            {/*
                              FIX 30/04/2026: quando expected_price e' null
                              mostriamo il MOTIVO direttamente nella cella
                              (non solo "--"). Cosi' su Massabò l'utente vede
                              subito "Tariffa non monitorata" o "Cella mai
                              pushata", senza dover cliccare la riga.
                            */}
                            {check.expected_price == null ? (
                              <div className="text-[11px] font-normal text-amber-700 dark:text-amber-400 leading-tight max-w-[160px] ml-auto">
                                {summarizeMissingExpectedReason(check.notes)}
                              </div>
                            ) : (
                              <>
                                <div>{formatPrice(check.expected_price)}</div>
                                {check.sent_at && (
                                  <div className="text-[10px] font-normal text-muted-foreground/80 tabular-nums mt-0.5">
                                    {formatTimestamp(check.sent_at)}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          {/*
                            FIX 30/04/2026: usiamo signedDiff calcolato dai
                            grezzi (booked - expected) / expected. Cosi' anche
                            i record vecchi con difference_pct ASSOLUTO mostrano
                            il segno corretto in UI senza richiedere rescan.
                              - verde se signedDiff >= 0 (sovra-prezzo o pareggio)
                              - rosso se effective === "mismatch" (sotto-prezzo grave)
                              - ambra se effective === "warning" (sotto-prezzo lieve)
                          */}
                          <td className={`py-2.5 pr-3 text-right font-medium ${
                            signedDiff != null && signedDiff >= 0
                              ? "text-green-600 dark:text-green-400"
                              : effective === "mismatch"
                                ? "text-red-600 dark:text-red-400"
                                : effective === "warning"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-green-600 dark:text-green-400"
                          }`}>
                            {signedDiff != null
                              ? // FIX 01/05/2026 (richiesta utente "quando marchi
                                //   di verde deve essere di segno positivo"):
                                //   prefisso "+" anche per signedDiff === 0 e per
                                //   piccoli valori che `toFixed(1)` arrotonda a
                                //   "0.0" (es. +0.04% -> "+0.0%"). Cosi' nessuna
                                //   cella verde appare senza il segno positivo.
                                //   Il "-" lo mette gia' `toFixed` per i negativi.
                                `${signedDiff >= 0 ? "+" : ""}${signedDiff.toFixed(1)}%`
                              : "--"}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-xs text-muted-foreground tabular-nums">
                            {check.minutes_before_booking != null
                              ? check.minutes_before_booking < timeToleranceMin
                                ? (
                                  <span className="text-amber-600 font-medium" title="Prezzo inviato entro la tolleranza temporale: valutato anche il prezzo precedente">
                                    {check.minutes_before_booking}
                                  </span>
                                )
                                : check.minutes_before_booking
                              : "--"}
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground tabular-nums">
                            {formatTimestamp(check.checked_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && mismatchCount > 0 && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/10 rounded-lg p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {mismatchCount} prenotazion{mismatchCount === 1 ? "e" : "i"} entrat{mismatchCount === 1 ? "a" : "e"} sotto-prezzo
                  </p>
                  <p className="mt-1 text-red-600/80 dark:text-red-400/80">
                    Il prezzo prenotato e&apos; inferiore al prezzo atteso oltre la tolleranza. Verifica che il PMS stia ricevendo correttamente i prezzi aggiornati. Le prenotazioni con prezzo superiore a quello atteso sono considerate favorevoli e mostrate in verde.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Booking detail dialog — opens when the user clicks on a check row */}
      <BookingDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        hotelId={hotelId}
        pmsBookingId={detailBookingId}
      />
    </div>
  )
}
