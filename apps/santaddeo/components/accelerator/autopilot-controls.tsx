"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/client"
import { Send, Bell, Plane, Mail, Settings2, X, Plus, Loader2, Check, AlertTriangle, Shield, Upload, CalendarRange, Filter } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

type AutopilotMode = "disabled" | "notify" | "autopilot"

/**
 * UI-only mode: includes the "autopilot + notifiche email" variant.
 * Internally this is still mode="autopilot" with notify_emails non-empty,
 * but in the dropdown we show it as a distinct fourth option so users can
 * explicitly opt-in to receive emails while in Autopilot mode.
 */
type UiMode = "disabled" | "notify" | "autopilot" | "autopilot_email"

function deriveUiMode(mode: AutopilotMode, emails: string[]): UiMode {
  if (mode === "autopilot" && emails.length > 0) return "autopilot_email"
  return mode
}

/** Days pushed during the first-time full sync when Autopilot is activated. */
const FIRST_SYNC_DAYS_AHEAD = 400

interface AutopilotConfig {
  mode: AutopilotMode
  notify_emails: string[]
  last_notification_at?: string | null
  last_push_at?: string | null
  /** Null = never done; timestamp = first 400-day sync was completed at this time. */
  last_full_sync_at?: string | null
}

interface PriceChange {
  date: string
  roomTypeId: string
  roomTypeName: string
  rateId?: string
  occupancy: number
  currentPrice: number
  suggestedPrice: number
}

interface PushResult {
  success: boolean
  changesCount?: number
  error?: string
  /** Keys (format "roomTypeId_rateId_occ_date") of the cells that were pushed */
  pushedKeys?: string[]
  /** Variant of push: whole grid or only user-edited cells */
  variant?: "all" | "modified"
}

interface AutopilotControlsProps {
  hotelId: string
  /** Returns current price changes for manual push (suggestedPrice vs currentPrice) */
  getChanges?: () => PriceChange[]
  /** Returns only the price changes the user has manually edited in this session */
  getModifiedChanges?: () => PriceChange[]
  /**
   * Returns every price (one per roomType × rate × occupancy × date) for
   * the next `daysAhead` days starting from today. Used during the first-
   * time activation of Autopilot to seed the PMS with a complete picture.
   */
  getAllFutureChanges?: (daysAhead: number) => PriceChange[]
  /** Called BEFORE pushing to PMS - use to save suggested prices to DB first. Returns true if save succeeded. */
  onBeforePush?: () => Promise<boolean>
  /** Called after a manual push (success or error) to update UI state */
  onPushComplete?: (result: PushResult) => void
  /** Called whenever the autopilot mode changes so the parent can react */
  onModeChange?: (mode: AutopilotMode) => void
}

export function AutopilotControls({ hotelId, getChanges, getModifiedChanges, getAllFutureChanges, onBeforePush, onPushComplete, onModeChange }: AutopilotControlsProps) {
  const [config, setConfig] = useState<AutopilotConfig>({ mode: "disabled", notify_emails: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushingVariant, setPushingVariant] = useState<"all" | "modified" | null>(null)
  const [pushResult, setPushResult] = useState<PushResult | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [emailInput, setEmailInput] = useState("")
  const [localEmails, setLocalEmails] = useState<string[]>([])
  // First-time activation dialog state
  const [firstSyncDialogOpen, setFirstSyncDialogOpen] = useState(false)
  const [firstSyncing, setFirstSyncing] = useState(false)
  // Superadmin: manual full re-push of all prices for the next FIRST_SYNC_DAYS_AHEAD days
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [forcePushDialogOpen, setForcePushDialogOpen] = useState(false)
  const [forcePushing, setForcePushing] = useState(false)
  // Pending UI mode that needs email capture before persisting
  const [pendingEmailMode, setPendingEmailMode] = useState<"notify" | "autopilot_email" | null>(null)
  // Range push dialog (accessibile a tutti gli utenti dell'hotel)
  const [rangePushDialogOpen, setRangePushDialogOpen] = useState(false)
  const [rangePushing, setRangePushing] = useState(false)
  const [rangeDateFrom, setRangeDateFrom] = useState<string>(() => new Date().toISOString().split("T")[0])
  const [rangeDateTo, setRangeDateTo] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split("T")[0]
  })
  // 23/05/2026: filtro per tariffa nel dialog "Invia range".
  // Mostro tutte le tariffe ATTIVE dell'hotel, marcando quelle derivate
  // (parent_rate_id != NULL o rate_type in 'nr'/'derived'). Inizialmente
  // filtravamo `parent_rate_id IS NULL` ma su hotel con mappature non
  // configurate (es. Tenuta Moriano) la lista risultava vuota.
  const [availableRates, setAvailableRates] = useState<
    Array<{ id: string; name: string; isDerived: boolean }>
  >([])
  const [selectedRateIds, setSelectedRateIds] = useState<Set<string>>(new Set())
  const [ratesLoading, setRatesLoading] = useState(false)
  // 20/07/2026: filtri per tipologia camera e occupazione nel dialog "Invia
  // range". Stessa semantica del filtro tariffa: selezione vuota = nessun
  // filtro (tutte le camere / tutte le occupazioni).
  const [availableRoomTypes, setAvailableRoomTypes] = useState<
    Array<{ id: string; name: string; minOccupancy: number; maxOccupancy: number }>
  >([])
  const [selectedRoomTypeIds, setSelectedRoomTypeIds] = useState<Set<string>>(new Set())
  const [roomTypesLoading, setRoomTypesLoading] = useState(false)
  const [selectedOccupancies, setSelectedOccupancies] = useState<Set<number>>(new Set())
  const [rangePushResult, setRangePushResult] = useState<{
    success: boolean
    pushed?: number
    totalInGrid?: number
    errors?: string[]
    /** Soft warnings: skip per occ fuori range della camera (residui legacy
     *  di pricing_grid). Non bloccanti, mostrati come info non come errore. */
    warnings?: string[]
    error?: string
  } | null>(null)

  // Detect superadmin role on mount (best-effort, fail-silent)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const authRes = await supabase.auth.getUser()
        const userId = (authRes.data?.user as { id?: string } | null | undefined)?.id
        if (!userId || cancelled) return
        const r = await fetch(`/api/internal/user-role?userId=${userId}`)
        if (!r.ok || cancelled) return
        const body = await r.json()
        if (!cancelled) setIsSuperAdmin(body?.role === "super_admin")
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Fetch config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`/api/autopilot/config?hotelId=${hotelId}`)
        if (res.ok) {
          const data = await res.json()
          setConfig(data)
          setLocalEmails(data.notify_emails || [])
          onModeChange?.(data.mode)
        }
      } catch (e) {
        console.error("Error fetching autopilot config:", e)
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [hotelId])

  // 23/05/2026: carico tutte le tariffe ATTIVE dell'hotel quando si apre il
  // dialog range push. Tentativo iniziale con Supabase client browser falliva:
  // la SELECT su `rates` ritornava 0 righe per RLS lato client (la stessa
  // query lato server in /api/accelerator/pricing-grid funziona). Quindi uso
  // un endpoint server-side dedicato che valida l'accesso hotel e ritorna la
  // lista pronta con flag isDerived.
  useEffect(() => {
    if (!rangePushDialogOpen || !hotelId) return
    if (availableRates.length > 0) return // gia' caricate
    setRatesLoading(true)
    fetch(`/api/accelerator/rates-list?hotel_id=${encodeURIComponent(hotelId)}`)
      .then(async (res) => {
        const text = await res.text()
        let json: any
        try {
          json = JSON.parse(text)
        } catch {
          throw new Error(`Risposta non valida (HTTP ${res.status})`)
        }
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
        return json
      })
      .then((json: { rates?: Array<{ id: string; name: string; isDerived: boolean }> }) => {
        if (json.rates) setAvailableRates(json.rates)
      })
      .catch((err) => {
        console.error("[v0] [autopilot-controls] error loading rates", err)
        toast.error("Errore caricamento tariffe")
      })
      .finally(() => {
        setRatesLoading(false)
      })
  }, [rangePushDialogOpen, hotelId, availableRates.length])

  // 20/07/2026: carico le tipologie camera (con min/max occupazione) quando si
  // apre il dialog range push. Stesso pattern del fetch tariffe: endpoint
  // server-side dedicato che valida l'accesso ed evita lo svuotamento RLS.
  useEffect(() => {
    if (!rangePushDialogOpen || !hotelId) return
    if (availableRoomTypes.length > 0) return // gia' caricate
    setRoomTypesLoading(true)
    fetch(`/api/accelerator/room-types-list?hotel_id=${encodeURIComponent(hotelId)}`)
      .then(async (res) => {
        const text = await res.text()
        let json: any
        try {
          json = JSON.parse(text)
        } catch {
          throw new Error(`Risposta non valida (HTTP ${res.status})`)
        }
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
        return json
      })
      .then(
        (json: {
          roomTypes?: Array<{ id: string; name: string; minOccupancy: number; maxOccupancy: number }>
        }) => {
          if (json.roomTypes) setAvailableRoomTypes(json.roomTypes)
        },
      )
      .catch((err) => {
        console.error("[v0] [autopilot-controls] error loading room types", err)
        toast.error("Errore caricamento camere")
      })
      .finally(() => {
        setRoomTypesLoading(false)
      })
  }, [rangePushDialogOpen, hotelId, availableRoomTypes.length])

  // 20/07/2026: occupazioni selezionabili = unione dei range [min..max] delle
  // camere. Se l'utente ha selezionato alcune camere, mostro solo le occupazioni
  // di quelle; altrimenti l'unione di tutte. Cosi' la lista occupazioni resta
  // coerente con le camere scelte.
  const availableOccupancies = useMemo<number[]>(() => {
    const source =
      selectedRoomTypeIds.size > 0
        ? availableRoomTypes.filter((rt) => selectedRoomTypeIds.has(rt.id))
        : availableRoomTypes
    const set = new Set<number>()
    for (const rt of source) {
      const min = Math.max(1, rt.minOccupancy)
      const max = Math.max(min, rt.maxOccupancy)
      for (let o = min; o <= max; o++) set.add(o)
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [availableRoomTypes, selectedRoomTypeIds])

  // Se cambiano le occupazioni disponibili, elimino dalla selezione quelle non
  // piu' valide (es. l'utente deseleziona una camera con occupazione alta).
  useEffect(() => {
    setSelectedOccupancies((prev) => {
      if (prev.size === 0) return prev
      const valid = new Set(availableOccupancies)
      let changed = false
      const next = new Set<number>()
      for (const o of prev) {
        if (valid.has(o)) next.add(o)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [availableOccupancies])

  // Handler: invia tutti i prezzi del range selezionato al PMS.
  // Chiama /api/autopilot/push-range che:
  //  - valida l'accesso all'hotel via validateHotelAccess
  //  - legge pricing_grid per il range
  //  - manda al PMS, aggiorna last_sent_prices + price_change_log
  //  - manda email best-effort se notify_emails configurate
  const handleRangePush = useCallback(async () => {
    if (!rangeDateFrom || !rangeDateTo) {
      toast.error("Seleziona data inizio e data fine")
      return
    }
    if (rangeDateFrom > rangeDateTo) {
      toast.error("La data di inizio deve essere prima della data di fine")
      return
    }
    setRangePushing(true)
    setRangePushResult(null)
    try {
      // 22/07/2026: come il push manuale "all" (runManualPush), salva PRIMA i
      // prezzi suggeriti calcolati in pricing_grid via onBeforePush. Senza
      // questo, il push range falliva con "Nessun prezzo in pricing_grid" per
      // le celle mai salvate/ricalcolate (la route legge SOLO pricing_grid,
      // mentre la griglia UI mostra prezzi calcolati al volo). Visto su Hotel
      // Superlusso: deluxe 04/08 visibile in griglia ma assente a DB.
      // NB: onBeforePush salva la finestra di date caricata in UI; per range
      // oltre la finestra visibile le celle non calcolate restano assenti.
      if (onBeforePush) {
        const saved = await onBeforePush()
        if (!saved) {
          const errMsg = "Errore nel salvataggio dei prezzi suggeriti prima dell'invio. Riprova."
          setRangePushResult({ success: false, error: errMsg })
          toast.error(errMsg)
          return
        }
      }
      const res = await fetch("/api/autopilot/push-range", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          dateFrom: rangeDateFrom,
          dateTo: rangeDateTo,
          // 23/05/2026: filtro per tariffa. Set vuoto = nessun filtro =
          // tutte le tariffe madri (comportamento storico). Set non vuoto =
          // solo i rate_id selezionati.
          rateIds: selectedRateIds.size > 0 ? Array.from(selectedRateIds) : undefined,
          // 20/07/2026: filtri per camera e occupazione. Set vuoto = tutte.
          roomTypeIds: selectedRoomTypeIds.size > 0 ? Array.from(selectedRoomTypeIds) : undefined,
          occupancies: selectedOccupancies.size > 0 ? Array.from(selectedOccupancies) : undefined,
        }),
      })
      // 23/05/2026: parse difensivo. Se l'edge function va in timeout (504)
      // oppure Cloudflare/Vercel restituisce una pagina di errore HTML, il
      // client riceve qualcosa tipo "An error occurred..." e `res.json()`
      // esplode con "Unexpected token 'A', \"An error o\"... is not valid
      // JSON" — esattamente l'errore visto in dialog. Normalizziamo:
      //  - leggo il testo grezzo,
      //  - provo JSON.parse,
      //  - se fallisce mostro un messaggio sensato in base allo status HTTP.
      const rawText = await res.text()
      let data: any = null
      try {
        data = rawText ? JSON.parse(rawText) : null
      } catch {
        data = null
      }
      if (data === null) {
        const fallback =
          res.status === 504 || res.status === 408
            ? `Timeout: l'invio del range ${rangeDateFrom} -> ${rangeDateTo} ha superato il limite del server. Prova a dividere il periodo in piu' invii (es. semestri).`
            : res.status >= 500
              ? `Errore server (HTTP ${res.status}). Il PMS o Supabase non hanno risposto in tempo. Riprova tra qualche secondo.`
              : `Risposta non valida dal server (HTTP ${res.status})`
        setRangePushResult({ success: false, error: fallback })
        toast.error(fallback)
        return
      }
      if (!res.ok) {
        const errMsg = data?.error || "Errore push range"
        setRangePushResult({ success: false, error: errMsg })
        toast.error(errMsg)
        return
      }
      setRangePushResult(data)
      if (data.success) {
        toast.success(`Inviati ${data.pushed ?? 0} prezzi al PMS per il range ${rangeDateFrom} -> ${rangeDateTo}`)
      } else if (data.deferred) {
        // Lock di concorrenza: un altro push per questo hotel e' in corso.
        toast.warning("Un altro invio prezzi e' gia' in corso per questo hotel. Riprova tra qualche secondo.")
      } else {
        toast.warning(data.message || "Nessun prezzo da inviare per il range selezionato")
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Errore di rete"
      setRangePushResult({ success: false, error: errMsg })
      toast.error(errMsg)
    } finally {
      setRangePushing(false)
    }
  }, [hotelId, rangeDateFrom, rangeDateTo, selectedRateIds, selectedRoomTypeIds, selectedOccupancies, onBeforePush])

  // Persist the mode change to the backend and update local state.
  // Optionally override the emails to persist (used when switching from
  // "autopilot" to "autopilot_email" or to clear emails on plain "autopilot").
  const persistMode = useCallback(async (newMode: AutopilotMode, opts?: { markFirstSync?: boolean; emails?: string[] }) => {
    const res = await fetch("/api/autopilot/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotelId,
        mode: newMode,
        notify_emails: opts?.emails !== undefined ? opts.emails : config.notify_emails,
        mark_first_sync_completed: !!opts?.markFirstSync,
      }),
    })
    if (!res.ok) throw new Error("Save failed")
    const data = await res.json()
    setConfig(data)
    setLocalEmails(data.notify_emails || [])
    onModeChange?.(data.mode)
    return data as AutopilotConfig
  }, [hotelId, config.notify_emails, onModeChange])

  // Handle UI mode change. UI mode includes "autopilot_email" which maps to
  // mode=autopilot + notify_emails non-empty.
  const handleUiModeChange = useCallback(async (newUiMode: UiMode) => {
    // notify mode requires at least one email
    if (newUiMode === "notify" && config.notify_emails.length === 0) {
      setPendingEmailMode("notify")
      setShowSettings(true)
      return
    }

    // autopilot_email also requires at least one email
    if (newUiMode === "autopilot_email" && config.notify_emails.length === 0) {
      setPendingEmailMode("autopilot_email")
      setShowSettings(true)
      return
    }

    // First-time activation of Autopilot (with or without email): show dialog
    // to confirm the 400-day initial push.
    const isFirstAutopilotActivation =
      (newUiMode === "autopilot" || newUiMode === "autopilot_email") &&
      config.mode !== "autopilot" &&
      !config.last_full_sync_at &&
      getAllFutureChanges
    if (isFirstAutopilotActivation) {
      // Track whether the user wants emails so we keep them after the sync
      if (newUiMode === "autopilot") {
        // Switching to autopilot WITHOUT email: clear any existing emails first
        // so that the autopilot push routes don't send notifications.
        setSaving(true)
        try {
          await persistMode("autopilot", { emails: [] })
          // Don't open the dialog yet because persistMode already ran. Open it
          // now so the user confirms the 400-day push.
          setFirstSyncDialogOpen(true)
        } catch (e) {
          console.error("Error clearing emails:", e)
          toast.error("Errore nel salvare la modalita")
        } finally {
          setSaving(false)
        }
        return
      }
      setFirstSyncDialogOpen(true)
      return
    }

    setSaving(true)
    try {
      // Map UiMode → DB mode + optional emails reset
      if (newUiMode === "autopilot") {
        // Autopilot WITHOUT email: clear notify_emails to opt-out of notifications
        await persistMode("autopilot", { emails: [] })
        toast.success("Autopilot attivo (senza notifiche email)")
      } else if (newUiMode === "autopilot_email") {
        // Autopilot WITH email: keep existing emails
        await persistMode("autopilot")
        toast.success("Autopilot + notifiche email attivo")
      } else {
        await persistMode(newUiMode)
      }
    } catch (e) {
      console.error("Error saving autopilot mode:", e)
      toast.error("Errore nel salvare la modalita Autopilot")
    } finally {
      setSaving(false)
    }
  }, [config.mode, config.notify_emails.length, config.last_full_sync_at, getAllFutureChanges, persistMode])

  // Execute the first-time activation: enable autopilot + push every price
  // for the next 400 days to the PMS, then mark last_full_sync_at so future
  // re-activations skip the dialog.
  const handleConfirmFirstSync = useCallback(async () => {
    if (!getAllFutureChanges) return
    setFirstSyncing(true)
    try {
      // 1. Activate autopilot immediately. If the full-sync fails partway we
      //    still leave autopilot enabled so subsequent edits keep syncing.
      await persistMode("autopilot")

      // 2. Collect all future prices and push them in one batch
      const changes = getAllFutureChanges(FIRST_SYNC_DAYS_AHEAD)
      if (changes.length === 0) {
        toast.warning("Nessun prezzo da inviare per i prossimi 400 giorni. Autopilot attivato comunque.")
        await persistMode("autopilot", { markFirstSync: true })
        setFirstSyncDialogOpen(false)
        return
      }

      toast.info(`Invio iniziale di ${changes.length} prezzi al PMS per i prossimi 400 giorni...`)

      const res = await fetch("/api/autopilot/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, mode: "first_sync", changes }),
      })
      const data = await res.json()

      if (data.success) {
        // 3. Mark first-sync completed
        await persistMode("autopilot", { markFirstSync: true })
        toast.success(`Invio completato: ${data.cellsOrRecords || changes.length} prezzi sincronizzati su Scidoo.`)
        setFirstSyncDialogOpen(false)
      } else {
        // Autopilot rimane attivo (come richiesto). L'utente vede l'errore
        // e può rilanciare la sincronizzazione dal menu.
        const errMsg = data.errors?.join(", ") || data.error || "Errore sconosciuto"
        toast.error(`Errore durante il primo invio: ${errMsg}. Autopilot è attivo comunque.`)
        setFirstSyncDialogOpen(false)
      }
    } catch (e) {
      console.error("Error during first-sync:", e)
      toast.error("Errore di rete durante il primo invio. Autopilot è attivo comunque.")
      setFirstSyncDialogOpen(false)
    } finally {
      setFirstSyncing(false)
    }
  }, [hotelId, getAllFutureChanges, persistMode])

  // Save emails from dialog. If a pendingEmailMode is set we also persist
  // the new mode (used when the user clicks the dropdown to switch to
  // notify/autopilot_email but had no emails yet → the dialog opens to
  // capture them and saving here completes the mode change).
  const handleSaveEmails = useCallback(async () => {
    setSaving(true)
    try {
      // Decide which DB mode to persist based on the pending UI mode
      let dbMode: AutopilotMode = config.mode
      let needsFirstSync = false
      if (pendingEmailMode === "notify") {
        dbMode = "notify"
      } else if (pendingEmailMode === "autopilot_email") {
        dbMode = "autopilot"
        needsFirstSync = config.mode !== "autopilot" && !config.last_full_sync_at && !!getAllFutureChanges
      }

      const res = await fetch("/api/autopilot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, mode: dbMode, notify_emails: localEmails }),
      })
      if (res.ok) {
        const data = await res.json()
        setConfig(data)
        setLocalEmails(data.notify_emails || [])
        onModeChange?.(data.mode)
        setShowSettings(false)
        setPendingEmailMode(null)

        // If the user just switched to autopilot_email for the first time,
        // open the first-sync dialog so they can confirm the 400-day push.
        if (needsFirstSync) {
          setFirstSyncDialogOpen(true)
        } else if (pendingEmailMode === "notify") {
          toast.success("Notifiche attive")
        } else if (pendingEmailMode === "autopilot_email") {
          toast.success("Autopilot + notifiche email attivo")
        }
      }
    } catch (e) {
      console.error("Error saving emails:", e)
    } finally {
      setSaving(false)
    }
  }, [hotelId, config.mode, config.last_full_sync_at, getAllFutureChanges, localEmails, onModeChange, pendingEmailMode])

  // Add email
  //
  // FIX 01/05/2026: l'utente aveva salvato "f,mancini@4bid.it" perche' il
  // vecchio check era solo `.includes("@")`. La virgola al posto del punto
  // passava silenziosamente e l'email non arrivava mai. Allineo la regex
  // a quella server-side e do feedback immediato all'utente.
  const handleAddEmail = () => {
    const email = emailInput.trim().toLowerCase()
    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
    if (!email) return
    if (!emailRegex.test(email)) {
      toast.error("Indirizzo email non valido. Controlla che non ci siano virgole o spazi al posto dei punti.")
      return
    }
    if (localEmails.includes(email)) {
      toast.info("Email gia' presente nella lista")
      return
    }
    setLocalEmails(prev => [...prev, email])
    setEmailInput("")
  }

  // Remove email
  const handleRemoveEmail = (email: string) => {
    setLocalEmails(prev => prev.filter(e => e !== email))
  }

  // Manual push to PMS: save suggested prices to DB first, then push.
  // variant="all" pushes every cell where suggested != current (whole grid),
  // variant="modified" pushes only cells the user has manually edited in this session.
  const runManualPush = useCallback(async (variant: "all" | "modified") => {
    const collector = variant === "modified" ? getModifiedChanges : getChanges
    const changes = collector?.() || []
    if (changes.length === 0) {
      const msg = variant === "modified"
        ? "Nessun prezzo modificato manualmente da inviare"
        : "Nessuna variazione di prezzo da inviare"
      setPushResult({ success: false, error: msg, variant })
      setTimeout(() => setPushResult(null), 5000)
      return
    }
    // Build pushedKeys list so the parent can flash the matching cells
    const pushedKeys = changes.map(c => `${c.roomTypeId}_${c.rateId ?? ""}_${c.occupancy}_${c.date}`)
    setPushing(true)
    setPushingVariant(variant)
    setPushResult(null)
    try {
      // Step 1: Save suggested prices to DB (only for "all" variant, where we
      // also want to persist algorithm suggestions that were never saved yet).
      if (variant === "all" && onBeforePush) {
        const saved = await onBeforePush()
        if (!saved) {
          const result: PushResult = { success: false, error: "Errore nel salvataggio prezzi", variant, pushedKeys }
          setPushResult(result)
          onPushComplete?.(result)
          setTimeout(() => setPushResult(null), 5000)
          setPushing(false)
          setPushingVariant(null)
          return
        }
      }
      // Step 2: Push to PMS
      const res = await fetch("/api/autopilot/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, mode: "manual", changes }),
      })
      const data = await res.json()
      const result: PushResult = {
        success: data.success,
        changesCount: data.changesCount || changes.length,
        error: data.error,
        pushedKeys,
        variant,
      }
      setPushResult(result)
      onPushComplete?.(result)
      setTimeout(() => setPushResult(null), 5000)
    } catch (e) {
      const result: PushResult = { success: false, error: "Errore di rete", variant, pushedKeys }
      setPushResult(result)
      onPushComplete?.(result)
      setTimeout(() => setPushResult(null), 5000)
    } finally {
      setPushing(false)
      setPushingVariant(null)
    }
  }, [hotelId, getChanges, getModifiedChanges, onBeforePush, onPushComplete])

  const handleManualPush = useCallback(() => { runManualPush("all") }, [runManualPush])
  const handleModifiedPush = useCallback(() => { runManualPush("modified") }, [runManualPush])

  // Superadmin: re-push the entire grid (every cell, not just changes) for the
  // next FIRST_SYNC_DAYS_AHEAD days. Used to recover from a failed first sync
  // or after re-mapping rates/rooms when the autopilot incremental push leaves
  // gaps in the PMS calendar (e.g. dates where the price never changed).
  const handleForceFullPush = useCallback(async () => {
    if (!getAllFutureChanges) return
    setForcePushing(true)
    try {
      const changes = getAllFutureChanges(FIRST_SYNC_DAYS_AHEAD)
      if (changes.length === 0) {
        toast.warning("Nessun prezzo da inviare per i prossimi 400 giorni.")
        setForcePushDialogOpen(false)
        return
      }
      toast.info(`Re-invio di ${changes.length} prezzi al PMS...`)
      const res = await fetch("/api/autopilot/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, mode: "force_full", changes }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Inviati ${data.cellsOrRecords || changes.length} prezzi su Scidoo.`)
        setForcePushDialogOpen(false)
      } else {
        const errMsg = data.errors?.join(", ") || data.error || "Errore sconosciuto"
        toast.error(`Errore durante il re-invio: ${errMsg}`)
      }
    } catch (e) {
      console.error("Error during force-full push:", e)
      toast.error("Errore di rete durante il re-invio.")
    } finally {
      setForcePushing(false)
    }
  }, [hotelId, getAllFutureChanges])

  // UI mode config: includes the 4th option "autopilot_email" which maps to
  // mode=autopilot + notify_emails non-empty in the database.
  const modeConfig: Record<UiMode, { icon: typeof Bell | null; label: string; color: string; bg: string }> = {
    disabled: { icon: null, label: "Disabilitato", color: "text-muted-foreground", bg: "" },
    notify: { icon: Bell, label: "Solo notifiche", color: "text-amber-600", bg: "bg-amber-50" },
    autopilot: { icon: Plane, label: "Autopilot", color: "text-emerald-600", bg: "bg-emerald-50" },
    autopilot_email: { icon: Mail, label: "Autopilot + email", color: "text-blue-600", bg: "bg-blue-50" },
  }

  const currentUiMode = deriveUiMode(config.mode, config.notify_emails)
  const currentMode = modeConfig[currentUiMode]

  if (loading) {
    return <div className="flex items-center gap-1.5 h-7"><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /></div>
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {/* Autopilot Mode Select */}
        <div className="flex items-center gap-1.5">
          <Select value={currentUiMode} onValueChange={(v) => handleUiModeChange(v as UiMode)} disabled={saving}>
            <SelectTrigger className={`h-7 text-[11px] w-[170px] ${currentMode.bg} ${currentMode.color} border-border`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">
                <span className="text-muted-foreground">Disabilitato</span>
              </SelectItem>
              <SelectItem value="notify">
                <span className="flex items-center gap-1.5">
                  <Bell className="h-3 w-3 text-amber-500" />
                  <span className="text-amber-600">Solo notifiche</span>
                </span>
              </SelectItem>
              <SelectItem value="autopilot">
                <span className="flex items-center gap-1.5">
                  <Plane className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-600">Autopilot</span>
                </span>
              </SelectItem>
              <SelectItem value="autopilot_email">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 text-blue-500" />
                  <span className="text-blue-600">Autopilot + email</span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Settings button (visible when mode != disabled) */}
          {config.mode !== "disabled" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    setLocalEmails(config.notify_emails)
                    setShowSettings(true)
                  }}
                >
                  <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Configura destinatari email</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Separator */}
        <div className="h-5 w-px bg-border" />

        {/* Manual Push Button — invia tutta la griglia (suggested != current) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={handleManualPush}
              disabled={pushing}
            >
              {pushing && pushingVariant === "all" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : pushResult && pushResult.variant === "all" ? (
                pushResult.success ? <Check className="h-3 w-3 text-emerald-500" /> : <AlertTriangle className="h-3 w-3 text-destructive" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              {pushing && pushingVariant === "all"
                ? "Invio..."
                : pushResult?.variant === "all" && pushResult.success
                ? `Inviati ${pushResult.changesCount || 0}`
                : pushResult?.variant === "all" && pushResult.error
                ? "Errore"
                : "Invia al PMS"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {pushResult?.variant === "all" && pushResult.error
              ? pushResult.error
              : "Salva i prezzi suggeriti e inviali tutti al PMS (Scidoo/GSheets)"}
          </TooltipContent>
        </Tooltip>

        {/* Modified-only Push Button — invia solo le celle editate dall'utente */}
        {getModifiedChanges && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1 bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900"
                onClick={handleModifiedPush}
                disabled={pushing}
              >
                {pushing && pushingVariant === "modified" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : pushResult && pushResult.variant === "modified" ? (
                  pushResult.success ? <Check className="h-3 w-3 text-emerald-700" /> : <AlertTriangle className="h-3 w-3 text-destructive" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                {pushing && pushingVariant === "modified"
                  ? "Invio..."
                  : pushResult?.variant === "modified" && pushResult.success
                  ? `Inviati ${pushResult.changesCount || 0}`
                  : pushResult?.variant === "modified" && pushResult.error
                  ? "Errore"
                  : "Invia prezzi modificati"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {pushResult?.variant === "modified" && pushResult.error
                ? pushResult.error
                : "Invia al PMS solo le celle che hai modificato manualmente (evidenziate in giallo)"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Range push button (visibile a tutti gli utenti dell'hotel) — apre un
            dialog con date picker per inviare tutti i prezzi di un determinato
            periodo. Utile quando si vogliono ri-allineare al PMS solo le date
            di un mese specifico o di una stagione. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => {
                setRangePushResult(null)
                setRangePushDialogOpen(true)
              }}
              disabled={pushing || rangePushing}
            >
              <CalendarRange className="h-3 w-3" />
              Invia range
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Invia al PMS tutti i prezzi del periodo che selezioni (es. 1-15 giugno)
          </TooltipContent>
        </Tooltip>

        {/* Superadmin only: re-push the entire 400-day grid to the PMS.
            Useful when autopilot incremental push left gaps in the PMS calendar
            (e.g. dates where the price never changed since first sync). */}
        {isSuperAdmin && getAllFutureChanges && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1 border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900"
                onClick={() => setForcePushDialogOpen(true)}
                disabled={forcePushing}
              >
                {forcePushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                {forcePushing ? "Invio..." : "Push tutto"}
                <Badge variant="outline" className="ml-1 border-purple-400 bg-purple-100 text-purple-800 px-1 py-0 h-4 text-[9px] gap-0.5">
                  <Shield className="h-2 w-2" />
                  ADMIN
                </Badge>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Solo superadmin: invia al PMS tutti i prezzi dei prossimi 400 giorni (anche le date senza variazioni)
            </TooltipContent>
          </Tooltip>
        )}

        {/* Range push dialog (accessibile a tutti) */}
        <Dialog
          open={rangePushDialogOpen}
          onOpenChange={(open) => {
            if (!rangePushing) setRangePushDialogOpen(open)
            if (!open) setRangePushResult(null)
          }}
        >
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary" />
                Invia prezzi al PMS per un periodo
              </DialogTitle>
              <DialogDescription>
                Seleziona il range di date da inviare al PMS. Verranno mandati tutti i
                prezzi presenti nella griglia per quel periodo (camere x tariffe x occupazioni).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="range-from" className="text-xs">Da</Label>
                  <Input
                    id="range-from"
                    type="date"
                    value={rangeDateFrom}
                    onChange={(e) => setRangeDateFrom(e.target.value)}
                    disabled={rangePushing}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="range-to" className="text-xs">A</Label>
                  <Input
                    id="range-to"
                    type="date"
                    value={rangeDateTo}
                    onChange={(e) => setRangeDateTo(e.target.value)}
                    disabled={rangePushing}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground bg-muted/50 border rounded p-2">
                <strong>Nota:</strong> verranno inviati tutti i prezzi della griglia per il periodo
                selezionato, anche le date dove il prezzo non e&apos; cambiato dall&apos;ultimo invio.
                Massimo 730 giorni per richiesta.
              </p>

              {/* 20/07/2026: filtro per tipologia camera. Set vuoto = tutte. */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Filter className="h-3 w-3" />
                    Filtra per camera{selectedRoomTypeIds.size > 0 && (
                      <span className="text-muted-foreground font-normal">
                        ({selectedRoomTypeIds.size} selezionate)
                      </span>
                    )}
                  </Label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:opacity-50"
                      disabled={rangePushing || roomTypesLoading || availableRoomTypes.length === 0}
                      onClick={() =>
                        setSelectedRoomTypeIds(new Set(availableRoomTypes.map((r) => r.id)))
                      }
                    >
                      Tutte
                    </button>
                    <span className="text-muted-foreground">|</span>
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:opacity-50"
                      disabled={rangePushing || selectedRoomTypeIds.size === 0}
                      onClick={() => setSelectedRoomTypeIds(new Set())}
                    >
                      Nessuna
                    </button>
                  </div>
                </div>
                <div className="border rounded p-2 max-h-40 overflow-y-auto bg-background">
                  {roomTypesLoading ? (
                    <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      Caricamento camere...
                    </div>
                  ) : availableRoomTypes.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2 text-center">
                      Nessuna camera attiva configurata per questo hotel
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {availableRoomTypes.map((rt) => {
                        const checked = selectedRoomTypeIds.has(rt.id)
                        return (
                          <label
                            key={rt.id}
                            className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5"
                          >
                            <Checkbox
                              checked={checked}
                              disabled={rangePushing}
                              onCheckedChange={(v) => {
                                setSelectedRoomTypeIds((prev) => {
                                  const next = new Set(prev)
                                  if (v) next.add(rt.id)
                                  else next.delete(rt.id)
                                  return next
                                })
                              }}
                            />
                            <span className="flex-1">{rt.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {rt.minOccupancy === rt.maxOccupancy
                                ? `${rt.maxOccupancy} pax`
                                : `${rt.minOccupancy}-${rt.maxOccupancy} pax`}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Lascia vuoto per inviare <strong>tutte le camere</strong>.
                </p>
              </div>

              {/* 20/07/2026: filtro per occupazione. Le opzioni dipendono dalle
                  camere selezionate (unione dei loro range min/max). Set vuoto
                  = tutte le occupazioni. */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Filter className="h-3 w-3" />
                    Filtra per occupazione{selectedOccupancies.size > 0 && (
                      <span className="text-muted-foreground font-normal">
                        ({selectedOccupancies.size} selezionate)
                      </span>
                    )}
                  </Label>
                  {selectedOccupancies.size > 0 && (
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline disabled:opacity-50"
                      disabled={rangePushing}
                      onClick={() => setSelectedOccupancies(new Set())}
                    >
                      Azzera
                    </button>
                  )}
                </div>
                {availableOccupancies.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-1">
                    Occupazioni non disponibili
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {availableOccupancies.map((occ) => {
                      const active = selectedOccupancies.has(occ)
                      return (
                        <button
                          key={occ}
                          type="button"
                          disabled={rangePushing}
                          aria-pressed={active}
                          onClick={() =>
                            setSelectedOccupancies((prev) => {
                              const next = new Set(prev)
                              if (next.has(occ)) next.delete(occ)
                              else next.add(occ)
                              return next
                            })
                          }
                          className={`px-2.5 py-1 rounded-md border text-xs transition-colors disabled:opacity-50 ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background hover:bg-muted"
                          }`}
                        >
                          {occ} pax
                        </button>
                      )
                    })}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Lascia vuoto per inviare <strong>tutte le occupazioni</strong>.
                </p>
              </div>

              {/* 23/05/2026: filtro per tariffa. Mostro tutte le tariffe attive
                  (madri e derivate) cosi' l'utente puo' decidere. Se non
                  specifica nulla, il backend filtra automaticamente le
                  derivate; se le seleziona esplicitamente, le pusha lo stesso
                  (utile per debug). */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Filter className="h-3 w-3" />
                    Filtra per tariffa{selectedRateIds.size > 0 && (
                      <span className="text-muted-foreground font-normal">
                        ({selectedRateIds.size} selezionate)
                      </span>
                    )}
                  </Label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:opacity-50"
                      disabled={rangePushing || ratesLoading || availableRates.length === 0}
                      onClick={() =>
                        setSelectedRateIds(
                          new Set(availableRates.filter((r) => !r.isDerived).map((r) => r.id)),
                        )
                      }
                    >
                      Solo madri
                    </button>
                    <span className="text-muted-foreground">|</span>
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:opacity-50"
                      disabled={rangePushing || ratesLoading || availableRates.length === 0}
                      onClick={() => setSelectedRateIds(new Set(availableRates.map((r) => r.id)))}
                    >
                      Tutte
                    </button>
                    <span className="text-muted-foreground">|</span>
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:opacity-50"
                      disabled={rangePushing || selectedRateIds.size === 0}
                      onClick={() => setSelectedRateIds(new Set())}
                    >
                      Nessuna
                    </button>
                  </div>
                </div>
                <div className="border rounded p-2 max-h-40 overflow-y-auto bg-background">
                  {ratesLoading ? (
                    <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      Caricamento tariffe...
                    </div>
                  ) : availableRates.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2 text-center">
                      Nessuna tariffa attiva configurata per questo hotel
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {availableRates.map((rate) => {
                        const checked = selectedRateIds.has(rate.id)
                        return (
                          <label
                            key={rate.id}
                            className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5"
                          >
                            <Checkbox
                              checked={checked}
                              disabled={rangePushing}
                              onCheckedChange={(v) => {
                                setSelectedRateIds((prev) => {
                                  const next = new Set(prev)
                                  if (v) next.add(rate.id)
                                  else next.delete(rate.id)
                                  return next
                                })
                              }}
                            />
                            <span className="flex-1">{rate.name}</span>
                            {rate.isDerived && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal text-muted-foreground">
                                derivata
                              </Badge>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Lascia vuoto per inviare <strong>tutte le tariffe madri</strong> (le derivate
                  vengono escluse automaticamente perche&apos; il PMS le ricalcola). Per forzare il
                  push di una derivata, selezionala esplicitamente.
                </p>
              </div>

              {rangePushResult && (
                <div
                  className={`text-xs rounded border p-2 ${
                    rangePushResult.success
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-amber-300 bg-amber-50 text-amber-900"
                  }`}
                >
                  {rangePushResult.success ? (
                    <span className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      Inviati {rangePushResult.pushed ?? 0} prezzi su{" "}
                      {rangePushResult.totalInGrid ?? 0} presenti in griglia.
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {rangePushResult.error || "Push non riuscito"}
                    </span>
                  )}
                  {rangePushResult.errors && rangePushResult.errors.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-4 space-y-0.5">
                      {rangePushResult.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                      {rangePushResult.errors.length > 5 && (
                        <li>...e altri {rangePushResult.errors.length - 5}</li>
                      )}
                    </ul>
                  )}
                  {/* Soft warnings: skip per occ fuori range della camera. Non sono errori,
                      sono celle di pricing_grid legacy che il sistema ha correttamente
                      ignorato. Mostrati con tono neutro per chiarire che non hanno
                      bloccato il push. */}
                  {rangePushResult.warnings && rangePushResult.warnings.length > 0 && (
                    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                      <div className="text-xs font-medium">
                        Avvisi non bloccanti (prezzi correttamente ignorati):
                      </div>
                      <ul className="mt-1 list-disc pl-4 space-y-0.5 text-xs">
                        {rangePushResult.warnings.slice(0, 5).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                        {rangePushResult.warnings.length > 5 && (
                          <li>...e altri {rangePushResult.warnings.length - 5}</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRangePushDialogOpen(false)}
                disabled={rangePushing}
              >
                Chiudi
              </Button>
              <Button onClick={handleRangePush} disabled={rangePushing}>
                {rangePushing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Invio in corso...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Invia al PMS
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Email Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={(open) => {
          if (!open) setPendingEmailMode(null)
          setShowSettings(open)
        }}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {pendingEmailMode === "autopilot_email"
                  ? "Autopilot + notifiche email"
                  : pendingEmailMode === "notify"
                  ? "Configura notifiche email"
                  : "Configurazione Autopilot"}
              </DialogTitle>
              <DialogDescription>
                {pendingEmailMode === "autopilot_email"
                  ? "Aggiungi gli indirizzi email che riceveranno una notifica ad ogni variazione di prezzo applicata al PMS."
                  : pendingEmailMode === "notify"
                  ? "Aggiungi gli indirizzi email che riceveranno le notifiche di variazione prezzo (senza invio automatico al PMS)."
                  : config.mode === "notify"
                  ? "Configura gli indirizzi email che riceveranno le notifiche di variazione prezzo."
                  : "Configura gli indirizzi email che riceveranno le notifiche quando i prezzi vengono inviati automaticamente al PMS."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Destinatari email</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="email@esempio.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddEmail()
                      }
                    }}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={handleAddEmail} disabled={!emailInput.includes("@")}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {localEmails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {localEmails.map(email => (
                    <Badge key={email} variant="secondary" className="gap-1 text-xs">
                      {email}
                      <button
                        onClick={() => handleRemoveEmail(email)}
                        className="ml-0.5 hover:text-destructive"
                        aria-label={`Rimuovi ${email}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {localEmails.length === 0 && (pendingEmailMode === "notify" || pendingEmailMode === "autopilot_email" || config.mode === "notify") && (
                <p className="text-xs text-amber-600">
                  Aggiungi almeno un indirizzo email per attivare questa modalita.
                </p>
              )}

              {pendingEmailMode === "autopilot_email" && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                  In <strong>Autopilot + email</strong> i prezzi vengono inviati automaticamente al PMS
                  e ricevi una email di recap ad ogni variazione (push manuale, sync incrementale, primo sync).
                </p>
              )}

              {config.mode === "autopilot" && !pendingEmailMode && config.notify_emails.length > 0 && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                  Riceverai email ad ogni variazione di prezzo. Per disattivarle scegli
                  &quot;Autopilot&quot; (senza email) dal dropdown.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowSettings(false); setPendingEmailMode(null) }}>Annulla</Button>
              <Button
                onClick={handleSaveEmails}
                disabled={saving || ((pendingEmailMode === "notify" || pendingEmailMode === "autopilot_email" || config.mode === "notify") && localEmails.length === 0)}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salva
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Superadmin force full push dialog */}
        <AlertDialog open={forcePushDialogOpen} onOpenChange={(open) => !forcePushing && setForcePushDialogOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-purple-600" />
                Push completo al PMS
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-foreground">
                  <p>
                    Stai per re-inviare al PMS <strong>tutti i prezzi dei prossimi {FIRST_SYNC_DAYS_AHEAD} giorni</strong>
                    {" "}(ogni camera, ogni tariffa, ogni occupancy), anche le date dove il prezzo non e&apos; cambiato.
                  </p>
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
                    <strong>Quando usarlo:</strong> dopo un primo sync fallito, dopo aver re-mappato tariffe/camere,
                    o quando il push autopilot incrementale ha lasciato date scoperte sul PMS (es. periodi senza variazioni).
                    I prezzi attuali sul PMS per le prossime {FIRST_SYNC_DAYS_AHEAD} giornate verranno <strong>sovrascritti</strong>.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={forcePushing}>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleForceFullPush() }}
                disabled={forcePushing}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {forcePushing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Invio in corso...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />Re-invia tutti i prezzi</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/*
          First-time activation dialog. Shown only when:
            - user is switching to "autopilot" mode
            - config.last_full_sync_at is null (never synced before)
          Subsequent re-activations skip this dialog and just flip the mode.
        */}
        <AlertDialog open={firstSyncDialogOpen} onOpenChange={(open) => !firstSyncing && setFirstSyncDialogOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Plane className="h-5 w-5 text-emerald-600" />
                Prima attivazione Autopilot
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-foreground">
                  <p>
                    È la prima volta che attivi Autopilot per questa struttura.
                    Per allineare il PMS con i prezzi attuali, il sistema invierà
                    immediatamente <strong>tutti i prezzi dei prossimi {FIRST_SYNC_DAYS_AHEAD} giorni</strong>
                    {" "}(ogni tipologia camera, ogni tariffa, ogni occupancy).
                  </p>
                  <p>
                    Dopo questo invio iniziale, ogni modifica futura verrà
                    sincronizzata automaticamente sul PMS — non dovrai più
                    cliccare "Invia prezzi modificati".
                  </p>
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2 flex gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Attenzione:</strong> i prezzi attualmente presenti sul PMS per i prossimi {FIRST_SYNC_DAYS_AHEAD} giorni verranno sovrascritti.
                      Verifica che i prezzi in questa pagina siano corretti prima di procedere.
                    </span>
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={firstSyncing}>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleConfirmFirstSync()
                }}
                disabled={firstSyncing}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {firstSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Invio in corso...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Attiva e invia prezzi
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
