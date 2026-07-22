"use client"

/**
 * Rate Mapping Editor (v2 — 30/04/2026)
 *
 * Modello "Reference Rate + offset daily" stile RoomPriceGenie:
 *  - Una sola "tariffa di riferimento" per hotel (BAR principale).
 *  - Tutte le altre tariffe dichiarano solo: tipo, parent opzionale, camere
 *    applicabili, note, stato attivo. Niente sconto fisso ne' release: gli
 *    scostamenti sono daily nella pagina Accelerator/Pricing
 *    (`rate_adj_<id>` in pricing_algo_params).
 *  - parent_rate_id e' OPZIONALE per ogni tipo (anche NR), serve solo come
 *    metadata "rispetto a cosa varia". Una stessa madre puo' avere N figlie.
 *
 * UI: tabella editabile inline. No piu' dialog modali per editing tariffe
 * esistenti. Selezione multipla per bulk actions.
 */

import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Tag,
  AlertCircle,
  Wand2,
  Loader2,
  Plus,
  Sparkles,
  Search,
  Star,
  Info,
  X,
  Settings2,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"

interface Rate {
  id: string
  name: string
  code?: string
  rate_type: "standard" | "nr" | "promo" | "package" | "derived"
  parent_rate_id: string | null
  applicable_room_type_ids: string[] | null
  min_occupancy: number
  max_occupancy: number | null
  // discount_percentage e release_days restano in DB come legacy fallback
  // ma NON sono modificabili da questa UI nel nuovo modello.
  discount_percentage: number | null
  release_days: number | null
  is_active: boolean
  is_mapped: boolean
  mapping_notes: string | null
}

interface RoomType {
  id: string
  name: string
  pms_room_type_id?: string
  min_occupancy?: number
  max_occupancy?: number
  capacity?: number
}

interface Stats {
  total: number
  mapped: number
  unmapped: number
  unmappedNr: number
  completionPercentage: number
}

interface RateMappingEditorProps {
  hotelId: string
  /**
   * Quando true mostra il pulsante "Crea tariffa" e abilita il dialog di
   * creazione di tariffe custom. Le tariffe normali sono sincronizzate dal
   * PMS via getRates: questo serve solo per recuperare booking storici che
   * referenziano tariffe archiviate non piu' restituite dal PMS.
   */
  isSuperAdmin?: boolean
}

const RATE_TYPE_LABELS: Record<
  Rate["rate_type"],
  { label: string; color: string; description: string }
> = {
  standard: {
    label: "Standard",
    color: "bg-slate-100 text-slate-700 border-slate-200",
    description: "Tariffa base (es. BAR, Flex)",
  },
  nr: {
    label: "Non Rimborsabile",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    description: "Sconto in cambio di nessun rimborso",
  },
  promo: {
    label: "Promo",
    color: "bg-purple-100 text-purple-700 border-purple-200",
    description: "Promozione temporanea",
  },
  package: {
    label: "Pacchetto",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    description: "Tariffa con servizi inclusi",
  },
  derived: {
    label: "Derivata",
    color: "bg-sky-100 text-sky-700 border-sky-200",
    description: "Variante con offset (mobile, weekend, ecc.)",
  },
}

type FilterType = "all" | "standard" | "nr" | "promo" | "package" | "derived"
type FilterStatus = "all" | "active" | "inactive"

export function RateMappingEditor({ hotelId, isSuperAdmin = false }: RateMappingEditorProps) {
  // ---- State ----
  const [rates, setRates] = useState<Rate[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  // BUG FIX 30/04/2026 (audit #4): rimosso stato `stats` server-side.
  // Le stats sono ora calcolate client-side da `rates` via useMemo per
  // riflettere edit inline in tempo reale (vedi `liveStats` piu' giu').
  const [loading, setLoading] = useState(true)
  const [autoDetecting, setAutoDetecting] = useState(false)

  const [referenceRateId, setReferenceRateId] = useState<string | null>(null)
  const [savingReference, setSavingReference] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Filtri
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<FilterType>("all")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")

  // Selezione multipla per bulk
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Dialog creazione tariffa custom (superadmin)
  const [creatingRate, setCreatingRate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    pms_rate_id: "",
    rate_type: "standard" as Rate["rate_type"],
    applicable_room_type_ids: [] as string[],
    mapping_notes: "",
  })

  // FIX 02/05/2026 (incident "duplicato 152994"): dialog di conferma duplicato.
  // Quando il backend rileva una tariffa con stesso name (case-insensitive) o
  // stesso scidoo_rate_id, ritorna 409 con la lista. Mostriamo i conflitti e
  // lasciamo all'utente la scelta tra: modifica esistente, forza creazione,
  // annulla. `can_force=false` per pms_id (constraint logico hard).
  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean
    conflicts: Array<{
      id: string
      name: string
      scidoo_rate_id: string | null
      is_active: boolean
      match_kind: "pms_id" | "name"
    }>
    canForce: boolean
    reason: string
  }>({ open: false, conflicts: [], canForce: false, reason: "" })

  // Track salvataggi in corso per cella, per spinner (set di "rate_id|field").
  const [busyCells, setBusyCells] = useState<Set<string>>(new Set())

  // Auto-clear messaggi di success
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- Lifecycle ----
  useEffect(() => {
    // Single fetch: la GET principale ritorna gia' `referenceRateId`. Prima
    // c'era una seconda chiamata in parallelo che causava race condition.
    loadData()
  }, [hotelId])

  // FEATURE 30/04/2026: deep-link per creare una tariffa custom precompilata.
  // Il pannello diagnose (/superadmin/connectors-health/diagnose) linka qui
  // con `?createPmsId=XXX&createName=YYY` quando l'utente clicca su una
  // tariffa orfana trovata nel backfill. Apriamo il dialog appena finito di
  // caricare i dati (per popolare la lista room_types nella modale) e
  // ripuliamo i query param per evitare di riaprire il dialog dopo un
  // refresh pagina.
  const searchParams = useSearchParams()
  const router = useRouter()
  const dialogAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (loading) return
    if (dialogAutoOpenedRef.current) return
    const createPmsId = searchParams?.get("createPmsId")
    if (!createPmsId) return
    dialogAutoOpenedRef.current = true

    // BUG FIX 30/04/2026: pulisci SEMPRE i query param dall'URL, anche se
    // l'utente non e' superadmin (in quel caso il dialog non si apre, ma
    // i query param resterebbero "sporchi" all'infinito).
    const cleanup = () => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("createPmsId")
      params.delete("createName")
      const qs = params.toString()
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
    }

    if (!isSuperAdmin) {
      // Utente non superadmin: niente dialog ma puliamo l'URL.
      cleanup()
      return
    }

    const createName = searchParams?.get("createName") ?? undefined
    openCreateDialog({ pms_rate_id: createPmsId, name: createName })
    cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isSuperAdmin])

  useEffect(() => {
    if (success) {
      if (successTimer.current) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => setSuccess(null), 4000)
    }
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current)
    }
  }, [success])

  // ---- Loaders ----
  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/settings/rate-mappings?hotel_id=${hotelId}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Errore caricamento")
      }
      const data = await res.json()
      setRates(data.rates || [])
      setRoomTypes(data.roomTypes || [])
      // `data.stats` non viene piu' usato: stats sono calcolate client-side.
      // Reference rate arriva dalla stessa GET (campo `referenceRateId`)
      // letto da pricing_algo_params: evita una seconda fetch.
      if (data.referenceRateId !== undefined) {
        setReferenceRateId(data.referenceRateId)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto")
    } finally {
      setLoading(false)
    }
  }

  // ---- Reference rate ----
  // BUG FIX 30/04/2026: rimossa funzione `loadReferenceRate` dead-code.
  // La GET principale di /api/settings/rate-mappings restituisce gia'
  // `referenceRateId`, quindi non serve una seconda fetch. La GET dedicata
  // `/api/settings/rate-mappings/set-reference?hotel_id=...` resta come
  // endpoint server riusabile per altri client (cron, debug) ma il componente
  // non la usa piu'.

  async function changeReferenceRate(newRateId: string | null) {
    try {
      setSavingReference(true)
      setError(null)
      const res = await fetch("/api/settings/rate-mappings/set-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, rate_id: newRateId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore salvataggio")
      setReferenceRateId(newRateId)
      setSuccess(
        newRateId
          ? "Tariffa di riferimento aggiornata. I prezzi delle altre tariffe verranno calcolati come scostamento da questa."
          : "Tariffa di riferimento rimossa.",
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto")
    } finally {
      setSavingReference(false)
    }
  }

  // ---- Single-row update (inline editing) ----
  async function updateRate(
    rateId: string,
    field: string,
    value: unknown,
  ): Promise<boolean> {
    const current = rates.find((r) => r.id === rateId)
    if (!current) return false

    // BUG FIX 30/04/2026 (audit #4): snapshot dei valori PRIMA dell'optimistic
    // per poter ripristinare TUTTI i campi modificati, non solo `[field]`.
    // L'optimistic forza `is_mapped: true`: senza snapshot del valore
    // originale, una rate `is_mapped=false` resta marcata "Classificata"
    // anche se l'update fallisce e revertiamo.
    const previousFieldValue = current[field as keyof Rate]
    const previousIsMapped = current.is_mapped

    // Optimistic update: marca is_mapped solo per campi che effettivamente
    // classificano (allineato al backend bulk endpoint).
    const isClassifyingField = [
      "rate_type",
      "parent_rate_id",
      "applicable_room_type_ids",
      "mapping_notes",
    ].includes(field)
    setRates((prev) =>
      prev.map((r) =>
        r.id === rateId
          ? { ...r, [field]: value, is_mapped: isClassifyingField ? true : r.is_mapped }
          : r,
      ),
    )
    const cellKey = `${rateId}|${field}`
    setBusyCells((prev) => new Set(prev).add(cellKey))

    const revert = () => {
      setRates((prev) =>
        prev.map((r) =>
          r.id === rateId
            ? { ...r, [field]: previousFieldValue, is_mapped: previousIsMapped }
            : r,
        ),
      )
    }

    try {
      const res = await fetch("/api/settings/rate-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rate_id: rateId,
          hotel_id: hotelId,
          // BUG FIX 30/04/2026 (audit #4): inviamo SOLO il campo cambiato.
          // Prima inviavamo tutti i campi (anche quelli non toccati) con i
          // valori da `current` — il backend POST ora costruisce l'update
          // payload dinamicamente in base ai campi presenti, quindi mandare
          // solo quello cambiato evita che valori legacy (discount_percentage,
          // release_days) vengano riscritti inutilmente ad ogni edit.
          [field]: value,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        revert()
        setError(data.error || "Errore salvataggio")
        return false
      }
      return true
    } catch (e) {
      revert()
      setError(e instanceof Error ? e.message : "Errore sconosciuto")
      return false
    } finally {
      setBusyCells((prev) => {
        const next = new Set(prev)
        next.delete(cellKey)
        return next
      })
    }
  }

  // Toggle is_active e' fuori dal POST regolare (richiede PATCH-style su un
  // singolo campo). Usiamo l'endpoint bulk con un solo id per riusare la
  // whitelist server-side e non duplicare logica.
  async function toggleActive(rateId: string, newActive: boolean) {
    const current = rates.find((r) => r.id === rateId)
    if (!current) return

    setRates((prev) =>
      prev.map((r) => (r.id === rateId ? { ...r, is_active: newActive } : r)),
    )
    const cellKey = `${rateId}|is_active`
    setBusyCells((prev) => new Set(prev).add(cellKey))

    try {
      const res = await fetch("/api/settings/rate-mappings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          rate_ids: [rateId],
          updates: { is_active: newActive },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRates((prev) =>
          prev.map((r) => (r.id === rateId ? { ...r, is_active: !newActive } : r)),
        )
        setError(data.error || "Errore salvataggio")
      }
    } finally {
      setBusyCells((prev) => {
        const next = new Set(prev)
        next.delete(cellKey)
        return next
      })
    }
  }

  // ---- Bulk actions ----
  // BUG FIX 30/04/2026 (audit #5):
  // - Aggiunto stato `bulkUpdating` per loading visibile durante l'azione e
  //   protezione contro doppi click rapidi sul Select bulk (un click parte
  //   ma la fetch e' lenta -> utente ri-seleziona stesso valore -> Radix
  //   non emette se valore identico, ma se diverso parte una seconda
  //   fetch concorrente).
  // - `bulkActionKey` viene incrementato dopo ogni bulk: lo passiamo come
  //   `key` ai Select del toolbar per forzarne il remount, cosi' selezionare
  //   lo stesso valore due volte di fila funziona correttamente. Senza
  //   questo, Radix Select non triggera onValueChange se si seleziona di
  //   nuovo lo stesso item gia' selezionato internamente.
  // - `setError(null)` esplicito per pulire errori precedenti.
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkActionKey, setBulkActionKey] = useState(0)

  async function bulkUpdate(updates: Record<string, unknown>) {
    if (selected.size === 0) return
    if (bulkUpdating) return // protezione doppio click
    const ids = Array.from(selected)
    setBulkUpdating(true)
    setError(null)
    try {
      const res = await fetch("/api/settings/rate-mappings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, rate_ids: ids, updates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore bulk update")
      setSuccess(`Aggiornate ${data.updated} tariffe`)
      setSelected(new Set())
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore bulk")
    } finally {
      setBulkUpdating(false)
      setBulkActionKey((k) => k + 1)
    }
  }

  // ---- Auto-detect ----
  async function handleAutoDetect() {
    try {
      setAutoDetecting(true)
      setError(null)
      const res = await fetch("/api/settings/rate-mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, auto_detect: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Auto-detect fallito")

      // Se il server suggerisce una reference rate e non ne abbiamo gia' una,
      // applichiamola automaticamente.
      if (!referenceRateId && data.suggestedReferenceRateId) {
        await changeReferenceRate(data.suggestedReferenceRateId)
      }

      setSuccess(
        `Auto-classificate ${data.updated || 0} tariffe (${data.typeChanged || 0} cambi tipo, ${data.parentInferred || 0} parent suggerite)`,
      )
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore auto-detect")
    } finally {
      setAutoDetecting(false)
    }
  }

  // ---- Create custom rate (superadmin) ----
  // FEATURE 30/04/2026: accetta opzionalmente un `prefill` con
  // `pms_rate_id` e `name`. Usato dal pannello "diagnose"
  // (`/superadmin/connectors-health/diagnose`) per aprire il dialog
  // precompilato sui pms_rate_id orfani trovati nel backfill: l'utente
  // arriva qui con un solo click e crea la tariffa custom mancante.
  function openCreateDialog(prefill?: { pms_rate_id?: string; name?: string }) {
    setCreateForm({
      name: prefill?.name ?? "",
      code: "",
      pms_rate_id: prefill?.pms_rate_id ?? "",
      rate_type: "standard",
      applicable_room_type_ids: [],
      mapping_notes: prefill?.pms_rate_id
        ? `Tariffa custom recuperata da diagnose (PMS ID ${prefill.pms_rate_id})`
        : "",
    })
    setError(null)
    setCreatingRate(true)
  }

  async function handleCreate(forceCreate = false) {
    if (!createForm.name.trim()) {
      setError("Inserisci il nome della tariffa")
      return
    }
    if (!createForm.pms_rate_id.trim()) {
      setError("Inserisci l'identificativo PMS della tariffa")
      return
    }
    try {
      setCreating(true)
      setError(null)
      const res = await fetch("/api/settings/rate-mappings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          name: createForm.name.trim(),
          code: createForm.code.trim() || undefined,
          pms_rate_id: createForm.pms_rate_id.trim(),
          rate_type: createForm.rate_type,
          applicable_room_type_ids:
            createForm.applicable_room_type_ids.length > 0
              ? createForm.applicable_room_type_ids
              : null,
          mapping_notes: createForm.mapping_notes.trim() || null,
          force_create: forceCreate,
        }),
      })
      const data = await res.json()

      // FIX 02/05/2026: il backend ritorna 409 quando trova una tariffa
      // duplicata per scidoo_rate_id o per name (case-insensitive). Apriamo
      // il dialog di conferma con la lista dei conflitti invece di fallire
      // muto con un toast di errore. L'utente vede esattamente quali
      // tariffe esistono gia' e decide se vuole comunque procedere.
      if (res.status === 409 && Array.isArray(data?.conflicts)) {
        setDuplicateDialog({
          open: true,
          conflicts: data.conflicts,
          canForce: !!data.can_force,
          reason: data.error || "Conflitto rilevato",
        })
        return
      }

      if (!res.ok) {
        const detailMsg = data.details ? ` (${data.details})` : ""
        throw new Error(`${data.error || "Errore creazione"}${detailMsg}`)
      }
      setSuccess(`Tariffa "${createForm.name.trim()}" creata`)
      setCreatingRate(false)
      setDuplicateDialog({ open: false, conflicts: [], canForce: false, reason: "" })
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto")
    } finally {
      setCreating(false)
    }
  }

  // ---- Derived data ----
  const ratesById = useMemo(() => {
    const m = new Map<string, Rate>()
    for (const r of rates) m.set(r.id, r)
    return m
  }, [rates])

  const filteredRates = useMemo(() => {
    return rates.filter((r) => {
      if (filterType !== "all" && r.rate_type !== filterType) return false
      if (filterStatus === "active" && !r.is_active) return false
      if (filterStatus === "inactive" && r.is_active) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !r.name?.toLowerCase().includes(q) &&
          !r.code?.toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [rates, filterType, filterStatus, search])

  const referenceRate = referenceRateId ? ratesById.get(referenceRateId) : null

  // BUG FIX 30/04/2026 (audit #4): stats calcolate client-side dal `rates`
  // state in tempo reale. Prima venivano dal server (data.stats) e non si
  // aggiornavano dopo edit inline: l'utente classificava 5 tariffe e il
  // contatore "Da classificare" restava lo stesso fino a un reload.
  const liveStats = useMemo<Stats>(() => {
    const total = rates.length
    const mapped = rates.filter((r) => r.is_mapped).length
    const unmapped = total - mapped
    const unmappedNr = rates.filter(
      (r) =>
        !r.is_mapped &&
        (r.name?.toUpperCase().includes("NR") ||
          r.name?.toLowerCase().includes("non rimb")),
    ).length
    return {
      total,
      mapped,
      unmapped,
      unmappedNr,
      completionPercentage: total > 0 ? Math.round((mapped / total) * 100) : 0,
    }
  }, [rates])

  const allFilteredSelected =
    filteredRates.length > 0 && filteredRates.every((r) => selected.has(r.id))

  function toggleSelectAll() {
    if (allFilteredSelected) {
      const next = new Set(selected)
      for (const r of filteredRates) next.delete(r.id)
      setSelected(next)
    } else {
      const next = new Set(selected)
      for (const r of filteredRates) next.add(r.id)
      setSelected(next)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ---- Render ----
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Header card */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Mappatura Tariffe
                </CardTitle>
                <CardDescription className="mt-1">
                  Configura la tariffa di riferimento e classifica le tariffe del PMS.
                  Gli scostamenti vengono gestiti giorno per giorno nella pagina Pricing.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isSuperAdmin && (
                  <Button onClick={openCreateDialog} variant="default" className="gap-2" size="sm">
                    <Plus className="h-4 w-4" />
                    Crea Tariffa
                  </Button>
                )}
                <Button
                  onClick={handleAutoDetect}
                  disabled={autoDetecting}
                  variant="outline"
                  className="gap-2"
                  size="sm"
                >
                  {autoDetecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Auto-classifica
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Guida "Come funziona" — visibile sempre, compatta */}
            <div className="rounded-lg border bg-slate-50/60 border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="h-4 w-4 text-slate-600" />
                <Label className="text-sm font-semibold text-slate-900">
                  Come funziona la mappatura
                </Label>
              </div>
              <ol className="space-y-2.5 text-sm text-slate-700">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold flex items-center justify-center mt-0.5">
                    1
                  </span>
                  <div className="flex-1">
                    <span className="font-medium text-slate-900">Imposta la Tariffa di Riferimento</span>
                    {" "}— e&apos; la tua BAR principale (B&amp;B Standard, Rack, ecc.). Tutti i prezzi delle altre
                    tariffe vengono calcolati come scostamento da questa.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold flex items-center justify-center mt-0.5">
                    2
                  </span>
                  <div className="flex-1">
                    <span className="font-medium text-slate-900">Classifica ogni tariffa nella colonna &quot;Tipo&quot;</span>
                    {" "}— Standard (base), Non Rimborsabile, Promo, Pacchetto o Derivata.
                    Usa <span className="font-medium">Auto-classifica</span> per farlo automaticamente in 1 click.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold flex items-center justify-center mt-0.5">
                    3
                  </span>
                  <div className="flex-1">
                    <span className="font-medium text-slate-900">(Opzionale) Indica &quot;Allacciata a&quot;</span>
                    {" "}— se una tariffa figlia varia rispetto a un&apos;altra (es. &quot;BAR-NR&quot; deriva da &quot;BAR&quot;),
                    selezionala come parent. Una stessa madre puo&apos; avere piu&apos; figlie.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold flex items-center justify-center mt-0.5">
                    4
                  </span>
                  <div className="flex-1">
                    <span className="font-medium text-slate-900">Configura gli scostamenti giornalieri</span>
                    {" "}nella pagina{" "}
                    <Link href="/accelerator/pricing" className="underline font-medium text-primary">
                      Accelerator → Pricing
                    </Link>
                    . Qui dichiari solo &quot;cosa e&apos; ogni tariffa&quot;, NON gli sconti
                    (gli sconti sono dinamici giorno per giorno).
                  </div>
                </li>
              </ol>
            </div>

            {/* Reference rate */}
            <div className="rounded-lg border bg-amber-50/40 border-amber-200/70 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-4 w-4 text-amber-600" />
                <Label className="font-semibold text-amber-900">Tariffa di Riferimento</Label>
              </div>
              <p className="text-xs text-amber-800/90 mb-3 max-w-2xl leading-relaxed">
                E&apos; la tariffa principale dell&apos;hotel (BAR / standard). Tutti i prezzi
                delle altre tariffe vengono calcolati come scostamento rispetto a questa,
                configurabile giorno per giorno nella pagina{" "}
                <Link href="/accelerator/pricing" className="underline font-medium">
                  Accelerator → Pricing
                </Link>
                .
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={referenceRateId ?? "__none__"}
                  onValueChange={(v) =>
                    changeReferenceRate(v === "__none__" ? null : v)
                  }
                  disabled={savingReference}
                >
                  <SelectTrigger className="max-w-md flex-1 bg-background">
                    <SelectValue placeholder="Seleziona la tariffa di riferimento..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">Nessuna selezionata</span>
                    </SelectItem>
                    {/*
                      BUG FIX 30/04/2026 (audit #3): prima filtravo SOLO
                      `r.is_active === true`. Se l'utente disattivava la
                      tariffa attualmente impostata come reference, la
                      Select mostrava placeholder vuoto pur avendo
                      `referenceRateId` valorizzato. Ora includiamo SEMPRE
                      la rate attualmente selezionata anche se inattiva,
                      con un suffisso "(disattivata)" come segnale.
                    */}
                    {rates
                      .filter((r) => r.is_active || r.id === referenceRateId)
                      .map((r) => {
                        const info = RATE_TYPE_LABELS[r.rate_type] ?? RATE_TYPE_LABELS.standard
                        const isInactiveSelected = !r.is_active && r.id === referenceRateId
                        return (
                          <SelectItem key={r.id} value={r.id}>
                            <div className="flex items-center gap-2">
                              <span>{r.name}</span>
                              <Badge className={`${info.color} border text-[10px]`}>
                                {info.label}
                              </Badge>
                              {isInactiveSelected && (
                                <span className="text-[10px] text-amber-700">
                                  (disattivata)
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
                {savingReference && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {referenceRate && (
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 border">
                    <Star className="h-3 w-3 mr-1" />
                    Riferimento attivo
                  </Badge>
                )}
              </div>
            </div>

            {/* Stats — calcolate client-side per riflettere edit inline in tempo reale */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Totale tariffe" value={liveStats.total} />
              <StatCard label="Classificate" value={liveStats.mapped} tone="success" />
              <StatCard label="Da classificare" value={liveStats.unmapped} tone="warning" />
              <StatCard
                label="Camere disponibili"
                value={roomTypes.length}
                hint="per mappatura"
              />
            </div>

            {/* Filtri */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cerca per nome o codice..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i tipi</SelectItem>
                  {Object.entries(RATE_TYPE_LABELS).map(([k, info]) => (
                    <SelectItem key={k} value={k}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  <SelectItem value="active">Attive</SelectItem>
                  <SelectItem value="inactive">Disattive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Toolbar bulk actions */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap rounded-md border bg-primary/5 border-primary/20 px-3 py-2">
                <span className="text-sm font-medium">{selected.size} selezionate</span>
                {bulkUpdating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                <span className="text-muted-foreground text-xs">→</span>
                {/*
                  BUG FIX 30/04/2026 (audit #5): `key={bulkActionKey}` forza
                  il remount del Select dopo ogni bulk action. Senza questo,
                  Radix Select non triggera onValueChange se si seleziona lo
                  stesso valore consecutivamente (es. "NR" su batch 1, poi
                  "NR" su batch 2 senza ricaricare la pagina).
                */}
                <Select
                  key={`bulk-type-${bulkActionKey}`}
                  onValueChange={(v) => bulkUpdate({ rate_type: v })}
                  disabled={bulkUpdating}
                >
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue placeholder="Imposta tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RATE_TYPE_LABELS).map(([k, info]) => (
                      <SelectItem key={k} value={k}>
                        {info.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  key={`bulk-parent-${bulkActionKey}`}
                  onValueChange={(v) => bulkUpdate({ parent_rate_id: v === "__none__" ? null : v })}
                  disabled={bulkUpdating}
                >
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder="Imposta padre..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuna padre</SelectItem>
                    {rates
                      .filter((r) => r.is_active && !selected.has(r.id))
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkUpdate({ is_active: true })}
                  disabled={bulkUpdating}
                  className="h-8 text-xs"
                >
                  Attiva
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkUpdate({ is_active: false })}
                  disabled={bulkUpdating}
                  className="h-8 text-xs"
                >
                  Disattiva
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                  disabled={bulkUpdating}
                  className="h-8 text-xs ml-auto"
                >
                  <X className="h-3 w-3 mr-1" />
                  Annulla selezione
                </Button>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
                <Sparkles className="h-4 w-4 text-emerald-700" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {/* Tabella */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Seleziona tutte"
                      />
                    </TableHead>
                    <TableHead className="min-w-[200px]">Nome</TableHead>
                    <TableHead className="w-[180px]">Tipo</TableHead>
                    <TableHead className="w-[200px]">Allacciata a</TableHead>
                    <TableHead className="w-[140px]">Camere</TableHead>
                    <TableHead className="min-w-[200px]">Note</TableHead>
                    <TableHead className="w-[80px] text-center">Attiva</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                        Nessuna tariffa corrisponde ai filtri.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRates.map((rate) => {
                      const isReference = rate.id === referenceRateId
                      const isSelected = selected.has(rate.id)
                      const typeInfo = RATE_TYPE_LABELS[rate.rate_type] ?? RATE_TYPE_LABELS.standard
                      const parentRate = rate.parent_rate_id
                        ? ratesById.get(rate.parent_rate_id)
                        : null
                      return (
                        <TableRow
                          key={rate.id}
                          data-state={isSelected ? "selected" : undefined}
                          className={isReference ? "bg-amber-50/40" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(rate.id)}
                              aria-label={`Seleziona ${rate.name}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {isReference && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Star className="h-3.5 w-3.5 text-amber-600 fill-amber-400" />
                                  </TooltipTrigger>
                                  <TooltipContent>Tariffa di riferimento</TooltipContent>
                                </Tooltip>
                              )}
                              <div className="flex flex-col">
                                <span className={!rate.is_active ? "text-muted-foreground" : ""}>
                                  {rate.name}
                                </span>
                                {rate.code && (
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {rate.code}
                                  </span>
                                )}
                              </div>
                              {/* Badge legacy: discount/release configurati nel modello vecchio */}
                              {(rate.discount_percentage !== null && rate.discount_percentage !== 0) ||
                              (rate.release_days !== null && rate.release_days > 0) ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                                      legacy
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    Sconto {rate.discount_percentage ?? 0}% e release {rate.release_days ?? 0}gg
                                    configurati come valori fissi (modello legacy).
                                    Migra a sconti daily nella pagina Pricing.
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          </TableCell>

                          <TableCell>
                            <Select
                              value={rate.rate_type}
                              onValueChange={(v) => updateRate(rate.id, "rate_type", v)}
                              disabled={busyCells.has(`${rate.id}|rate_type`)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue>
                                  <Badge className={`${typeInfo.color} border text-[10px]`}>
                                    {typeInfo.label}
                                  </Badge>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(RATE_TYPE_LABELS).map(([k, info]) => (
                                  <SelectItem key={k} value={k}>
                                    <div className="flex items-center gap-2">
                                      <Badge className={`${info.color} border text-[10px]`}>
                                        {info.label}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground hidden sm:inline">
                                        {info.description}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell>
                            <Select
                              value={rate.parent_rate_id ?? "__none__"}
                              onValueChange={(v) =>
                                updateRate(
                                  rate.id,
                                  "parent_rate_id",
                                  v === "__none__" ? null : v,
                                )
                              }
                              disabled={busyCells.has(`${rate.id}|parent_rate_id`)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue>
                                  {parentRate ? (
                                    <span className="truncate text-xs">{parentRate.name}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">Nessuna</span>
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">
                                  <span className="text-muted-foreground">Nessuna (autonoma)</span>
                                </SelectItem>
                                {/*
                                  BUG FIX 30/04/2026 (audit #3): includere
                                  SEMPRE la parent attualmente selezionata
                                  anche se inattiva. Senza questo, Radix
                                  Select genera warning "value not found"
                                  e visivamente sembra "Nessuna" nei filtri
                                  malgrado il valore in DB sia valorizzato.
                                */}
                                {rates
                                  .filter(
                                    (r) =>
                                      (r.is_active || r.id === rate.parent_rate_id) &&
                                      r.id !== rate.id,
                                  )
                                  .map((r) => {
                                    const info = RATE_TYPE_LABELS[r.rate_type] ?? RATE_TYPE_LABELS.standard
                                    const isInactive = !r.is_active
                                    return (
                                      <SelectItem key={r.id} value={r.id}>
                                        <div className="flex items-center gap-2">
                                          <span>{r.name}</span>
                                          <Badge className={`${info.color} border text-[10px]`}>
                                            {info.label}
                                          </Badge>
                                          {isInactive && (
                                            <span className="text-[10px] text-amber-700">
                                              (disattivata)
                                            </span>
                                          )}
                                        </div>
                                      </SelectItem>
                                    )
                                  })}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell>
                            <RoomTypePopover
                              roomTypes={roomTypes}
                              selectedIds={rate.applicable_room_type_ids ?? []}
                              busy={busyCells.has(`${rate.id}|applicable_room_type_ids`)}
                              onChange={(ids) =>
                                updateRate(
                                  rate.id,
                                  "applicable_room_type_ids",
                                  ids.length > 0 ? ids : null,
                                )
                              }
                            />
                          </TableCell>

                          <TableCell>
                            <NotesCell
                              value={rate.mapping_notes ?? ""}
                              busy={busyCells.has(`${rate.id}|mapping_notes`)}
                              onSave={(val) => updateRate(rate.id, "mapping_notes", val || null)}
                            />
                          </TableCell>

                          <TableCell className="text-center">
                            <Switch
                              checked={rate.is_active}
                              onCheckedChange={(v) => toggleActive(rate.id, v)}
                              disabled={busyCells.has(`${rate.id}|is_active`)}
                              aria-label={`Attiva ${rate.name}`}
                            />
                          </TableCell>

                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                  <Link href="/accelerator/pricing">
                                    <Settings2 className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Configura scostamenti daily</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Lo sconto rispetto alla tariffa di riferimento si configura{" "}
                <Link href="/accelerator/pricing" className="underline font-medium">
                  giorno per giorno nella pagina Pricing
                </Link>
                . Qui dichiari solo "che tipo di tariffa e&apos;" e "rispetto a cosa varia".
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Dialog crea tariffa custom */}
        <Dialog open={creatingRate} onOpenChange={(open) => !open && setCreatingRate(false)}>
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Crea nuova tariffa
              </DialogTitle>
              <DialogDescription>
                Aggiungi una tariffa custom non sincronizzata dal PMS. Utile per recuperare i
                booking storici che referenziano tariffe archiviate.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <Alert variant="destructive" className="flex-shrink-0">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Nome tariffa <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder='Es. "Be Safe Legacy", "B&B 2024 archiviata"'
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                />
                {/*
                  FIX 02/05/2026: live check duplicato sul name. Cerchiamo
                  tra le tariffe attive caricate in `rates` se esiste una
                  con lo stesso nome (case-insensitive, trimmed). Mostriamo
                  un warning ambra prima del submit cosi' l'utente capisce
                  subito che sta creando un duplicato. Non blocchiamo: il
                  backend e' la source of truth e mostrera' il dialog di
                  conferma. Questo e' solo prevenzione UX.
                */}
                {(() => {
                  const t = createForm.name.trim().toLowerCase()
                  if (!t) return null
                  const dup = rates.find(
                    (r) => r.is_active && (r.name ?? "").trim().toLowerCase() === t,
                  )
                  if (!dup) return null
                  return (
                    <Alert className="bg-amber-50 border-amber-200 py-2">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      <AlertDescription className="text-xs text-amber-800">
                        Esiste gia&apos; una tariffa attiva con questo nome:{" "}
                        <span className="font-medium">{dup.name}</span>. Verifica
                        prima di creare un duplicato — di solito conviene
                        modificare quella esistente.
                      </AlertDescription>
                    </Alert>
                  )
                })()}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Identificativo PMS <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="Es. 12345"
                  value={createForm.pms_rate_id}
                  onChange={(e) => setCreateForm((p) => ({ ...p, pms_rate_id: e.target.value }))}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Visibile nel pannello diagnostico del backfill come &quot;Top tariffe nei booking ma non in rates&quot;.
                </p>
                {/* Live check duplicato su scidoo_rate_id (esatto). */}
                {(() => {
                  const t = createForm.pms_rate_id.trim()
                  if (!t) return null
                  const dup = (rates as Array<Rate & { scidoo_rate_id?: string | null }>).find(
                    (r) => r.scidoo_rate_id === t,
                  )
                  if (!dup) return null
                  return (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <AlertDescription className="text-xs">
                        Identificativo PMS gia&apos; presente per la tariffa{" "}
                        <span className="font-medium">{dup.name}</span>. Non puoi
                        creare un&apos;altra tariffa con lo stesso ID PMS — modifica
                        quella esistente.
                      </AlertDescription>
                    </Alert>
                  )
                })()}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Codice (opzionale)</Label>
                <Input
                  placeholder="Es. BES, BB, NR"
                  value={createForm.code}
                  onChange={(e) => setCreateForm((p) => ({ ...p, code: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo tariffa</Label>
                <Select
                  value={createForm.rate_type}
                  onValueChange={(v) =>
                    setCreateForm((p) => ({ ...p, rate_type: v as Rate["rate_type"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RATE_TYPE_LABELS).map(([k, info]) => (
                      <SelectItem key={k} value={k}>
                        <div className="flex items-center gap-2">
                          <Badge className={`${info.color} border text-xs`}>{info.label}</Badge>
                          <span className="text-xs text-muted-foreground">{info.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Camere applicabili</Label>
                <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                  {roomTypes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessuna tipologia disponibile</p>
                  ) : (
                    roomTypes.map((rt) => (
                      <div key={rt.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`create-rt-${rt.id}`}
                          checked={createForm.applicable_room_type_ids.includes(rt.id)}
                          onCheckedChange={(checked) =>
                            setCreateForm((p) => ({
                              ...p,
                              applicable_room_type_ids: checked
                                ? [...p.applicable_room_type_ids, rt.id]
                                : p.applicable_room_type_ids.filter((x) => x !== rt.id),
                            }))
                          }
                        />
                        <label htmlFor={`create-rt-${rt.id}`} className="text-sm cursor-pointer">
                          {rt.name}
                          <span className="text-[10px] text-muted-foreground font-mono ml-1">
                            ({rt.min_occupancy ?? 1}-{rt.max_occupancy ?? rt.capacity ?? "?"}pax)
                          </span>
                        </label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Lascia vuoto per applicare a tutte
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Note</Label>
                <Textarea
                  placeholder="Es. Tariffa storica archiviata in Scidoo"
                  value={createForm.mapping_notes}
                  onChange={(e) => setCreateForm((p) => ({ ...p, mapping_notes: e.target.value }))}
                  className="h-20 resize-none"
                />
              </div>
            </div>

            <DialogFooter className="flex-shrink-0">
              <Button variant="outline" onClick={() => setCreatingRate(false)}>
                Annulla
              </Button>
              <Button onClick={() => handleCreate(false)} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Crea tariffa
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/*
          FIX 02/05/2026 (incident "duplicato 152994 Massabo'"): dialog di
          conferma duplicato. Si apre quando il backend ritorna 409. Mostra
          la lista dei conflitti con: nome, ID PMS, stato, motivo del match.
          Tre azioni per l'utente:
            1. "Modifica esistente" -> chiude entrambi i dialog e fa scroll
               sulla riga della tariffa esistente (search ne facilita la
               ricerca). Path consigliato.
            2. "Crea comunque" -> richiama handleCreate(true) con
               force_create. Visibile solo se canForce=true (cioe' SOLO
               conflitti su name; mai su pms_id che e' un blocco hard).
            3. "Annulla" -> chiude solo questo dialog, lasciando il dialog
               di creazione aperto cosi' l'utente puo' modificare i campi.
        */}
        <Dialog
          open={duplicateDialog.open}
          onOpenChange={(open) =>
            !open && setDuplicateDialog((d) => ({ ...d, open: false }))
          }
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Tariffa potenzialmente duplicata
              </DialogTitle>
              <DialogDescription>
                {duplicateDialog.reason}. Prima di procedere, verifica che non
                stia creando una tariffa gemella di una gia&apos; esistente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Tariffe esistenti che corrispondono
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {duplicateDialog.conflicts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start justify-between gap-3 rounded-md border p-3 bg-muted/30"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{c.name}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.scidoo_rate_id && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            ID PMS: {c.scidoo_rate_id}
                          </Badge>
                        )}
                        <Badge
                          variant={c.is_active ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {c.is_active ? "Attiva" : "Disattivata"}
                        </Badge>
                        <Badge
                          className={`text-[10px] border ${
                            c.match_kind === "pms_id"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {c.match_kind === "pms_id"
                            ? "Stesso ID PMS"
                            : "Stesso nome"}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // Modifica esistente: chiudo entrambi i dialog e
                        // imposto la search bar sul nome cosi' la riga
                        // esistente diventa l'unica visibile in tabella.
                        setDuplicateDialog({
                          open: false,
                          conflicts: [],
                          canForce: false,
                          reason: "",
                        })
                        setCreatingRate(false)
                        setSearch(c.name)
                      }}
                      className="flex-shrink-0"
                    >
                      Modifica
                    </Button>
                  </div>
                ))}
              </div>

              {!duplicateDialog.canForce && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    L&apos;identificativo PMS deve essere unico. Non puoi creare
                    una seconda tariffa con lo stesso ID — modifica quella
                    esistente o usa un ID diverso.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  setDuplicateDialog({
                    open: false,
                    conflicts: [],
                    canForce: false,
                    reason: "",
                  })
                }
              >
                Annulla
              </Button>
              {duplicateDialog.canForce && (
                <Button
                  variant="destructive"
                  disabled={creating}
                  onClick={() => handleCreate(true)}
                  className="gap-2"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Crea comunque
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

// ---- Sub components ----

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: number | string
  tone?: "success" | "warning"
  hint?: string
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : "text-foreground"
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2.5">
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {label}
        {hint && <span className="block text-muted-foreground/70">{hint}</span>}
      </div>
    </div>
  )
}

function RoomTypePopover({
  roomTypes,
  selectedIds,
  onChange,
  busy,
}: {
  roomTypes: RoomType[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(selectedIds)

  // BUG FIX 30/04/2026 (audit #5): ref per tracciare se il salvataggio e' gia'
  // avvenuto via "Applica". Senza questo, il sequence "click Applica ->
  // onChange(draft) -> setOpen(false) -> onOpenChange(false) -> if(!o) check
  // diff" causa una DOUBLE chiamata a onChange perche' selectedIds del parent
  // non e' ancora stato aggiornato (state batch). 2 fetch identiche partivano
  // per ogni click su Applica.
  const justSavedRef = useRef(false)

  useEffect(() => {
    setDraft(selectedIds)
  }, [selectedIds, open])

  const label = useMemo(() => {
    if (selectedIds.length === 0) return "Tutte"
    if (selectedIds.length === roomTypes.length) return "Tutte"
    if (selectedIds.length === 1) {
      return roomTypes.find((r) => r.id === selectedIds[0])?.name ?? "1 camera"
    }
    return `${selectedIds.length} camere`
  }, [selectedIds, roomTypes])

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          // Save draft on close if cambiato e non gia' salvato via Applica.
          if (justSavedRef.current) {
            justSavedRef.current = false
          } else {
            const sortedDraft = [...draft].sort()
            const sortedCurrent = [...selectedIds].sort()
            if (JSON.stringify(sortedDraft) !== JSON.stringify(sortedCurrent)) {
              onChange(draft)
            }
          }
        }
        setOpen(o)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full justify-between font-normal"
          disabled={busy}
        >
          <span className="truncate text-xs">{label}</span>
          {busy && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {roomTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nessuna camera</p>
          ) : (
            roomTypes.map((rt) => {
              const checked = draft.includes(rt.id)
              return (
                <label
                  key={rt.id}
                  className="flex items-center gap-2 cursor-pointer rounded-sm hover:bg-muted/40 px-1 py-0.5"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      setDraft((prev) =>
                        v ? [...prev, rt.id] : prev.filter((x) => x !== rt.id),
                      )
                    }}
                  />
                  <span className="text-sm flex-1">{rt.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {rt.min_occupancy ?? 1}-{rt.max_occupancy ?? rt.capacity ?? "?"}p
                  </span>
                </label>
              )
            })
          )}
        </div>
        <div className="border-t mt-2 pt-2 flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setDraft([])}
          >
            Tutte
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              // BUG FIX 30/04/2026 (audit #5): segna che abbiamo gia' salvato
              // cosi' onOpenChange non chiama onChange una seconda volta.
              justSavedRef.current = true
              onChange(draft)
              setOpen(false)
            }}
          >
            Applica
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotesCell({
  value,
  onSave,
  busy,
}: {
  value: string
  onSave: (val: string) => void
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-xs text-muted-foreground hover:text-foreground w-full truncate"
        title={value || "Aggiungi note"}
      >
        {value || <span className="italic opacity-60">aggiungi note...</span>}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === "Escape") {
            setDraft(value)
            setEditing(false)
          }
        }}
        className="h-7 text-xs"
        disabled={busy}
      />
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
    </div>
  )
}
