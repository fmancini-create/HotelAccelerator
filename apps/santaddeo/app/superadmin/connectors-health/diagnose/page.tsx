"use client"

/**
 * /superadmin/connectors-health/diagnose
 *
 * Diagnostica avanzata sul connettore Scidoo. Per ogni hotel mostra:
 *   - Counts aggregati (RAW total / unprocessed / cancelled, RMS total / cancelled)
 *   - Match analysis (matched, raw_orphan, rms_orphan, status drift)
 *   - Verdict + lista di issue azionabili
 *
 * Sostituisce/affianca il check generico drift% di /superadmin/connectors-health
 * separando le 4 cause distinte di disallineamento.
 */
import useSWR from "swr"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, RefreshCw, Wrench, CheckCircle2, AlertTriangle, Zap, Ban, Plus, Loader2, Eye, Link2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"

interface HotelDiagnose {
  hotel_id: string
  hotel_name: string
  provider: "scidoo" | "brig"
  raw: { total: number; unprocessed: number; cancelled: number }
  rms: { total: number; cancelled: number }
  match: {
    matched: number
    raw_orphan: number
    rms_orphan: number
    status_drift_pms_cancelled_rms_active: number
    status_drift_pms_active_rms_cancelled: number
  }
  /** Booking con rate_id NULL — count totale (mantenuto per backward compat). */
  bookings_missing_rate: number
  /**
   * Booking con bookings.rate_id NULL ma il raw Scidoo ha rate_id valido.
   * Sono i veri "missed" del sync — devono essere backfillati altrimenti
   * il Guard attribuisce rate sbagliate (es. "Be Safe" su OTA). Sono
   * gli unici da considerare un'anomalia.
   */
  bookings_missing_rate_fixable: number
  /**
   * Booking con bookings.rate_id NULL E raw Scidoo SENZA rate_id.
   * Prenotazioni create direttamente nel PMS senza tariffa associata
   * (case vacanze, gruppi). Scenario legittimo, dato informativo.
   */
  bookings_missing_rate_legitimate: number
  verdict: "healthy" | "backlog" | "etl_drift" | "historical_drift" | "status_drift" | "mixed"
  issues: string[]
  durationMs: number
}

interface DiagnoseResponse {
  ok: boolean
  computedAt: string
  totalDurationMs: number
  hotels: HotelDiagnose[]
}

const VERDICT_LABEL: Record<HotelDiagnose["verdict"], string> = {
  healthy: "Sano",
  backlog: "Backlog ETL",
  etl_drift: "Drift ETL",
  historical_drift: "Drift storico",
  status_drift: "Drift cancellazioni",
  mixed: "Più problemi",
}

function verdictTone(v: HotelDiagnose["verdict"]) {
  switch (v) {
    case "healthy":
      return { className: "bg-emerald-100 text-emerald-900 border-emerald-300", dot: "bg-emerald-500" }
    case "backlog":
      return { className: "bg-amber-100 text-amber-900 border-amber-300", dot: "bg-amber-500" }
    case "status_drift":
      return { className: "bg-amber-100 text-amber-900 border-amber-300", dot: "bg-amber-500" }
    case "historical_drift":
      return { className: "bg-orange-100 text-orange-900 border-orange-300", dot: "bg-orange-500" }
    case "etl_drift":
      return { className: "bg-rose-100 text-rose-900 border-rose-300", dot: "bg-rose-500" }
    case "mixed":
      return { className: "bg-rose-100 text-rose-900 border-rose-300", dot: "bg-rose-500" }
  }
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<DiagnoseResponse>
}

export default function ConnectorsHealthDiagnosePage() {
  // NB: la chiave SWR DEVE essere stabile. Se la cambiamo (es. con ?_=refreshKey)
  // SWR azzera `data` a undefined, il sotto-tree {data && ...} si smonta e i
  // figli (ForceETLPanel) perdono lo state in-memory, log compreso.
  // Per refresh forzato chiamiamo mutate() che mantiene `data` finché arriva il
  // nuovo payload (stale-while-revalidate).
  const { data, error, isLoading, mutate } = useSWR<DiagnoseResponse>(
    "/api/admin/connectors-health/diagnose",
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  )

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Link
            href="/superadmin/connectors-health"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Torna a Stato connettori
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Diagnostica connettori PMS</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Analizza il disallineamento RAW↔RMS distinguendo le 4 cause possibili: backlog ETL, drift di mapping,
            residuo storico, cancellazioni disallineate. Supporta Scidoo e BRiG.
          </p>
        </div>
        <Button variant="outline" onClick={() => mutate()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {error && (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="pt-6">
            <p className="text-sm text-rose-900">Errore caricamento: {String((error as Error).message)}</p>
          </CardContent>
        </Card>
      )}

      {isLoading && !data && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Calcolo in corso… potrebbe richiedere qualche secondo (paginazione di tutte le righe RAW e RMS).
            </p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <p className="text-xs text-muted-foreground">
            Calcolato il {new Date(data.computedAt).toLocaleString("it-IT")} ·{" "}
            {(data.totalDurationMs / 1000).toFixed(1)}s totali · {data.hotels.length} hotel
          </p>

          <ReconcileCancellationsPanel
            totalDrift={data.hotels.reduce(
              (acc, h) =>
                acc +
                h.match.status_drift_pms_cancelled_rms_active +
                h.match.status_drift_pms_active_rms_cancelled,
              0,
            )}
            onDone={() => mutate()}
          />

          <ForceETLPanel
            hotelsWithIssues={data.hotels
              .filter((h) => h.raw.unprocessed > 0 || h.match.raw_orphan > 0)
              .map((h) => ({
                hotel_id: h.hotel_id,
                hotel_name: h.hotel_name,
                unprocessed: h.raw.unprocessed,
                orphan: h.match.raw_orphan,
              }))}
            onDone={() => mutate()}
          />

          <div className="space-y-4">
            {data.hotels.map((h) => (
              <HotelCard key={h.hotel_id} hotel={h} onDone={() => mutate()} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface ReconcilePerHotel {
  hotel_id: string
  hotel_name: string
  to_activate: number
  to_cancel: number
  applied_activate?: number
  applied_cancel?: number
  errors?: string[]
  // Diagnostic 30/04/2026: per investigare quando un apply non sembra
  // persistere. Se applied>0 ma persisted=0 c'e' RLS / trigger.
  verify_after_update?: {
    cancel_persisted: number
    cancel_not_persisted: number
    activate_persisted: number
    activate_not_persisted: number
  }
  // Chiave neutra `pms_ref` per rispettare il guard
  // scripts/guard-no-pms-tables.mjs che vieta i token PMS-specifici nella UI.
  // Il backend ritorna il valore con questa chiave.
  samples_to_cancel?: Array<{ booking_id: string; pms_ref: string }>
  samples_to_activate?: Array<{ booking_id: string; pms_ref: string }>
}
interface ReconcileResponse {
  ok: boolean
  apply: boolean
  hotels: ReconcilePerHotel[]
}

/**
 * Pannello di riconciliazione cancellazioni.
 * Workflow: 1. Calcola → mostra preview (dry-run, nessuna scrittura)
 *           2. Conferma → applica (UPDATE atomici per chunk)
 * Il bottone è ben visibile solo quando c'è effettivamente drift da sistemare.
 */
function ReconcileCancellationsPanel({
  totalDrift,
  onDone,
}: {
  totalDrift: number
  onDone: () => void
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "preview"; data: ReconcileResponse }
    | { kind: "applying" }
    | { kind: "done"; data: ReconcileResponse }
    | { kind: "error"; message: string }
  >({ kind: "idle" })

  const run = async (apply: boolean) => {
    setState({ kind: apply ? "applying" : "loading" })
    try {
      const r = await fetch("/api/admin/connectors-health/reconcile-cancellations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      const data = (await r.json()) as ReconcileResponse
      setState({ kind: apply ? "done" : "preview", data })
      if (apply) onDone()
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message })
    }
  }

  // Niente drift → nessun pannello (non vogliamo invitare ad apply quando non serve)
  if (totalDrift === 0 && state.kind === "idle") {
    return null
  }

  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-700" />
              Riconciliazione cancellazioni
            </CardTitle>
            <CardDescription>
              Riallinea retroattivamente lo stato `is_cancelled` dei booking allo `status` del raw Scidoo.
              Sistema le {totalDrift.toLocaleString("it-IT")} prenotazioni con drift residuo dovuto al vecchio
              bug di "reactivation detection".
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.kind === "idle" && (
          <Button variant="outline" onClick={() => run(false)}>
            Calcola anteprima (dry-run)
          </Button>
        )}

        {state.kind === "loading" && (
          <p className="text-sm text-muted-foreground">Calcolo preview in corso…</p>
        )}

        {state.kind === "preview" && (
          <PreviewBlock
            data={state.data}
            onApply={() => run(true)}
            onCancel={() => setState({ kind: "idle" })}
          />
        )}

        {state.kind === "applying" && (
          <p className="text-sm text-muted-foreground">Applicazione in corso… (UPDATE in chunk da 200)</p>
        )}

        {state.kind === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Riconciliazione completata
            </div>
            <DoneTable data={state.data} />
            <Button variant="outline" size="sm" onClick={() => setState({ kind: "idle" })}>
              Chiudi
            </Button>
          </div>
        )}

        {state.kind === "error" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-rose-700 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Errore: {state.message}
            </div>
            <Button variant="outline" size="sm" onClick={() => setState({ kind: "idle" })}>
              Riprova
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PreviewBlock({
  data,
  onApply,
  onCancel,
}: {
  data: ReconcileResponse
  onApply: () => void
  onCancel: () => void
}) {
  const totalActivate = data.hotels.reduce((a, h) => a + h.to_activate, 0)
  const totalCancel = data.hotels.reduce((a, h) => a + h.to_cancel, 0)
  const totalUpdates = totalActivate + totalCancel

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <p className="font-medium">Riepilogo modifiche proposte:</p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          {data.hotels
            .filter((h) => h.to_activate > 0 || h.to_cancel > 0)
            .map((h) => (
              <li key={h.hotel_id}>
                <span className="text-foreground font-medium">{h.hotel_name}</span>:{" "}
                {h.to_cancel > 0 && <span>{h.to_cancel} da marcare annullate</span>}
                {h.to_cancel > 0 && h.to_activate > 0 && " · "}
                {h.to_activate > 0 && <span>{h.to_activate} da riattivare</span>}
              </li>
            ))}
        </ul>
        <p className="mt-3 text-foreground">
          Totale UPDATE: <span className="font-semibold">{totalUpdates.toLocaleString("it-IT")}</span> (
          {totalCancel} annullamenti + {totalActivate} riattivazioni)
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onApply} disabled={totalUpdates === 0}>
          Applica modifiche
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Annulla
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Le modifiche verranno applicate in batch da 200 record. L'operazione è idempotente: rilanciandola
        non produrrà effetti se i dati sono già allineati.
      </p>
    </div>
  )
}

function DoneTable({ data }: { data: ReconcileResponse }) {
  return (
    <div className="text-sm space-y-2">
      <ul className="space-y-2 text-muted-foreground">
        {data.hotels.map((h) => {
          const totalApplied = (h.applied_activate ?? 0) + (h.applied_cancel ?? 0)
          const totalToApply = h.to_activate + h.to_cancel
          if (totalApplied === 0 && totalToApply === 0 && (h.errors?.length ?? 0) === 0) {
            return null
          }
          // Smoking gun: applied > 0 ma il verify ha trovato persisted=0
          // -> UPDATE non persiste (probabilmente RLS / trigger lato DB).
          const v = h.verify_after_update
          const cancelStuck = v ? v.cancel_not_persisted > 0 && (h.applied_cancel ?? 0) > 0 : false
          const activateStuck = v
            ? v.activate_not_persisted > 0 && (h.applied_activate ?? 0) > 0
            : false
          const stuck = cancelStuck || activateStuck
          return (
            <li key={h.hotel_id} className="space-y-1">
              <div>
                <span className="text-foreground font-medium">{h.hotel_name}</span>:{" "}
                {totalApplied} aggiornati ({h.applied_cancel ?? 0} cancel · {h.applied_activate ?? 0}{" "}
                activate)
                {h.errors && h.errors.length > 0 && (
                  <span className="text-rose-700"> · {h.errors.length} errori</span>
                )}
              </div>
              {v && (
                <div className={`text-xs ${stuck ? "text-rose-700" : "text-emerald-700"}`}>
                  Verifica DB: cancel persistite {v.cancel_persisted}/{h.to_cancel} · activate
                  persistite {v.activate_persisted}/{h.to_activate}
                  {stuck && (
                    <span>
                      {" "}
                      · UPDATE NON persistito (possibile RLS/trigger DB lato bookings)
                    </span>
                  )}
                </div>
              )}
              {h.samples_to_cancel && h.samples_to_cancel.length > 0 && stuck && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Sample booking_id non persistiti (per indagine)
                  </summary>
                  <ul className="ml-4 mt-1 space-y-0.5 font-mono">
                    {h.samples_to_cancel.map((s) => (
                      <li key={s.booking_id}>
                        cancel · ref={s.pms_ref} · uuid={s.booking_id}
                      </li>
                    ))}
                    {h.samples_to_activate?.map((s) => (
                      <li key={s.booking_id}>
                        activate · ref={s.pms_ref} · uuid={s.booking_id}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {h.errors && h.errors.length > 0 && (
                <ul className="ml-4 text-xs text-rose-700 list-disc">
                  {h.errors.slice(0, 3).map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function HotelCard({ hotel, onDone }: { hotel: HotelDiagnose; onDone: () => void }) {
  const tone = verdictTone(hotel.verdict)
  const matchPct = hotel.raw.total > 0 ? (hotel.match.matched / hotel.raw.total) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">{hotel.hotel_name}</CardTitle>
              <Badge
                variant="outline"
                className={
                  hotel.provider === "brig"
                    ? "uppercase font-semibold tracking-wide border-blue-200 bg-blue-50 text-blue-800"
                    : "uppercase font-semibold tracking-wide border-emerald-200 bg-emerald-50 text-emerald-800"
                }
              >
                {hotel.provider}
              </Badge>
            </div>
            <CardDescription className="text-xs font-mono">{hotel.hotel_id}</CardDescription>
          </div>
          <Badge variant="outline" className={`${tone.className} gap-1.5 px-2.5 py-1`}>
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
            {VERDICT_LABEL[hotel.verdict]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Counts aggregati */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Metric label="RAW totali" value={hotel.raw.total} />
          <Metric
            label="RAW non processate"
            value={hotel.raw.unprocessed}
            warn={hotel.raw.unprocessed > 0}
          />
          <Metric label="RAW annullate" value={hotel.raw.cancelled} muted />
          <Metric label="RMS totali" value={hotel.rms.total} />
          <Metric label="RMS annullate" value={hotel.rms.cancelled} muted />
          <Metric
            label="Senza tariffa"
            // Mostriamo i FIXABLE se ci sono (sono i veri "missed"
            // recuperabili dal raw), altrimenti i LEGITIMATE come info.
            // Lo stato warn/muted differenzia visivamente l'anomalia.
            value={
              hotel.bookings_missing_rate_fixable > 0
                ? hotel.bookings_missing_rate_fixable
                : hotel.bookings_missing_rate_legitimate
            }
            warn={hotel.bookings_missing_rate_fixable > 0}
            hint={
              hotel.bookings_missing_rate_fixable > 0
                ? `${hotel.bookings_missing_rate_fixable} booking con rate_id mancante recuperabili dal raw Scidoo. Lancia il backfill qui sotto.`
                : hotel.bookings_missing_rate_legitimate > 0
                  ? `Tutti i ${hotel.bookings_missing_rate_legitimate} booking senza tariffa sono legittimi: prenotazioni create direttamente nel PMS senza rate associata (scenario normale per case vacanze e gruppi).`
                  : undefined
            }
            // Se ci sono SOLO legittimi, mostro il numero in muted (verde info)
            muted={
              hotel.bookings_missing_rate_fixable === 0 &&
              hotel.bookings_missing_rate_legitimate > 0
            }
          />
        </div>

        {/* Match analysis */}
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Match analysis</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric
              label={`Match (${matchPct.toFixed(1)}%)`}
              value={hotel.match.matched}
              good={matchPct >= 99}
            />
            <Metric
              label="RAW orphan"
              value={hotel.match.raw_orphan}
              warn={hotel.match.raw_orphan > 0}
              hint="RAW senza booking"
            />
            <Metric
              label="RMS orphan"
              value={hotel.match.rms_orphan}
              warn={hotel.match.rms_orphan > 0}
              hint="Booking senza RAW"
            />
            <Metric
              label="Status drift"
              value={
                hotel.match.status_drift_pms_cancelled_rms_active +
                hotel.match.status_drift_pms_active_rms_cancelled
              }
              warn={
                hotel.match.status_drift_pms_cancelled_rms_active +
                  hotel.match.status_drift_pms_active_rms_cancelled >
                0
              }
              hint="Cancellazioni disallineate"
            />
          </div>
          {(hotel.match.status_drift_pms_cancelled_rms_active > 0 ||
            hotel.match.status_drift_pms_active_rms_cancelled > 0) && (
            <p className="text-xs text-muted-foreground mt-2">
              {hotel.match.status_drift_pms_cancelled_rms_active} attive in RMS ma annullate in RAW ·{" "}
              {hotel.match.status_drift_pms_active_rms_cancelled} viceversa
            </p>
          )}
        </div>

        {/* Issues list */}
        {hotel.issues.length > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Issue rilevate</p>
            <ul className="space-y-1.5 text-sm">
              {hotel.issues.map((issue, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground">·</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-emerald-700">
            Nessuna anomalia rilevata. Connettore allineato.
          </p>
        )}

        {/* Sample orphan: visibile solo se ci sono RAW o RMS orphan da investigare. */}
        {(hotel.match.raw_orphan > 0 || hotel.match.rms_orphan > 0) && (
          <OrphanSamplePanel
            hotelId={hotel.hotel_id}
            hasRawOrphan={hotel.match.raw_orphan > 0}
            hasRmsOrphan={hotel.match.rms_orphan > 0}
          />
        )}

        {/* Info chip: tutti i missing rate sono LEGITTIMI (raw senza rate_id).
            Scenario normale per case vacanze. Niente da fare. */}
        {hotel.bookings_missing_rate_fixable === 0 &&
          hotel.bookings_missing_rate_legitimate > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="text-xs uppercase tracking-wide text-emerald-800 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Booking senza tariffa: {hotel.bookings_missing_rate_legitimate.toLocaleString("it-IT")} legittimi
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                Prenotazioni create direttamente nel PMS senza tariffa associata
                (case vacanze, gruppi, walk-in). Il raw Scidoo conferma che non
                avevano <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px]">rate_id</code> già
                in origine: nessun backfill applicabile e nessuna anomalia.
              </p>
            </div>
          )}

        {/* Backfill rate_id: popola rate_id/rate_name/rate_code sui booking storici.
            Mostriamo il pannello SOLO se ci sono missing FIXABLE (raw ha rate_id ma
            bookings.rate_id e' null). Per i legittimi vedi info chip sopra. */}
        {hotel.bookings_missing_rate_fixable > 0 && (
          <RateBackfillPanel
            hotelId={hotel.hotel_id}
            missingCount={hotel.bookings_missing_rate_fixable}
            onDone={onDone}
          />
        )}

        <p className="text-xs text-muted-foreground">Analisi completata in {hotel.durationMs}ms</p>
      </CardContent>
    </Card>
  )
}

interface OrphanSampleResponse {
  ok: boolean
  hotel_id: string
  counts: {
    bookings_total: number
    raw_total: number
    raw_orphan_returned: number
    rms_orphan_returned: number
  }
  raw_orphan_sample: Array<{
    booking_ref: string | null
    status: string | null
    room_code: string | null
    room_name: string | null
    cancellation_date: string | null
    arrival: string | null
    departure: string | null
    customer: string | null
    total_price: number | null
    created_at: string | null
  }>
  rms_orphan_sample: Array<{
    booking_ref: string | null
    cancelled: boolean | null
    check_in: string | null
    check_out: string | null
    customer: string | null
    total_price: number | null
    created_at: string | null
  }>
  error?: string
}

function OrphanSamplePanel({
  hotelId,
  hasRawOrphan,
  hasRmsOrphan,
}: {
  hotelId: string
  hasRawOrphan: boolean
  hasRmsOrphan: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<OrphanSampleResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch(
        `/api/admin/connectors-health/orphan-sample?hotelId=${encodeURIComponent(hotelId)}&limit=10`,
      )
      const json = (await r.json()) as OrphanSampleResponse
      if (!r.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${r.status}`)
      }
      setData(json)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Investigazione orphan</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mostra 10 RAW orphan e 10 RMS orphan side-by-side per identificare la causa
            del mismatch (join key, doppi RAW, drift storico, filtro processor).
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!open) {
              setOpen(true)
              if (!data) void load()
            } else {
              setOpen(false)
            }
          }}
          disabled={loading}
        >
          {loading ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Carico…
            </>
          ) : open ? (
            "Nascondi sample"
          ) : (
            "Mostra sample orphan"
          )}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {err && (
            <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              Errore: {err}{" "}
              <button className="underline ml-2" onClick={load}>
                Riprova
              </button>
            </div>
          )}

          {data && (
            <div className="text-xs text-muted-foreground">
              Totali: {data.counts.bookings_total.toLocaleString("it-IT")} booking ·{" "}
              {data.counts.raw_total.toLocaleString("it-IT")} raw · sample{" "}
              {data.counts.raw_orphan_returned}/10 RAW orphan ·{" "}
              {data.counts.rms_orphan_returned}/10 RMS orphan
            </div>
          )}

          {data && hasRawOrphan && data.raw_orphan_sample.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">
                RAW orphan — raw senza booking corrispondente
              </p>
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-medium">booking_ref</th>
                      <th className="px-2 py-1.5 font-medium">status</th>
                      <th className="px-2 py-1.5 font-medium">room_code</th>
                      <th className="px-2 py-1.5 font-medium">arrival</th>
                      <th className="px-2 py-1.5 font-medium">departure</th>
                      <th className="px-2 py-1.5 font-medium">customer</th>
                      <th className="px-2 py-1.5 font-medium text-right">€ pernotto</th>
                      <th className="px-2 py-1.5 font-medium">cancel_date</th>
                      <th className="px-2 py-1.5 font-medium">created_at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.raw_orphan_sample.map((r) => (
                      <tr key={r.booking_ref} className="border-t border-slate-100">
                        <td className="px-2 py-1 font-mono">{r.booking_ref}</td>
                        <td className="px-2 py-1">{r.status}</td>
                        <td className="px-2 py-1 font-mono">{r.room_code ?? "—"}</td>
                        <td className="px-2 py-1 font-mono">{r.arrival ?? "—"}</td>
                        <td className="px-2 py-1 font-mono">{r.departure ?? "—"}</td>
                        <td className="px-2 py-1">{r.customer ?? "—"}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {r.total_price !== null ? r.total_price.toFixed(2) : "—"}
                        </td>
                        <td className="px-2 py-1 font-mono">{r.cancellation_date ?? "—"}</td>
                        <td className="px-2 py-1 font-mono">
                          {r.created_at ? r.created_at.slice(0, 10) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data && hasRmsOrphan && data.rms_orphan_sample.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">
                RMS orphan — booking senza RAW di origine
              </p>
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-medium">booking_ref</th>
                      <th className="px-2 py-1.5 font-medium">cancelled</th>
                      <th className="px-2 py-1.5 font-medium">check_in</th>
                      <th className="px-2 py-1.5 font-medium">check_out</th>
                      <th className="px-2 py-1.5 font-medium">customer</th>
                      <th className="px-2 py-1.5 font-medium text-right">€ totale</th>
                      <th className="px-2 py-1.5 font-medium">created_at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rms_orphan_sample.map((b) => (
                      <tr key={b.booking_ref} className="border-t border-slate-100">
                        <td className="px-2 py-1 font-mono">{b.booking_ref}</td>
                        <td className="px-2 py-1">{b.cancelled ? "sì" : "no"}</td>
                        <td className="px-2 py-1 font-mono">{b.check_in ?? "—"}</td>
                        <td className="px-2 py-1 font-mono">{b.check_out ?? "—"}</td>
                        <td className="px-2 py-1">{b.customer ?? "—"}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {b.total_price !== null ? b.total_price.toFixed(2) : "—"}
                        </td>
                        <td className="px-2 py-1 font-mono">
                          {b.created_at ? b.created_at.slice(0, 10) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * RateBackfillPanel: popola rate_id/rate_name/rate_code sui booking storici.
 * CRITICO per evitare che il Guard mostri "Be Safe" su prenotazioni OTA.
 */
function RateBackfillPanel({
  hotelId,
  missingCount,
  onDone,
}: {
  hotelId: string
  missingCount: number
  onDone: () => void
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading"; chunks: number; matchedSoFar: number; updatedSoFar: number }
    | { kind: "syncing-rates" }
    | {
        kind: "done"
        target: number
        matched: number
        updated: number
        missingMap: number
        bookingsWithoutRawRate: number
        chunks: number
        ratesSynced?: number
        /** Rates auto-allineate scidoo_rate_id <-> pms_rate_id dal server. */
        healedRates: number
        /** Top-N pms_rate_id che il raw ha ma rates non contiene. */
        missingRateIdSamples?: Array<{
          pms_rate_id: string
          count: number
          rate_name_in_raw: string | null
          sample_booking?: {
            pms_ref: string
            check_in_date: string | null
            guest_name: string | null
          } | null
        }>
        /** Sample dei rate_id presenti in rates per confronto formato. */
        presentRateIds?: Array<{ pms_rate_id: string; name: string | null; code: string | null }>
      }
    | { kind: "error"; message: string }
  >({ kind: "idle" })

  async function runBackfill() {
    // Loop automatico finche' `done=true`. L'endpoint backfilla a chunk di 5000
    // booking per stare sotto i 120s di Vercel; per hotel grandi (es. Barronci
    // con migliaia di booking storici) servono piu' chiamate consecutive.
    setState({ kind: "loading", chunks: 0, matchedSoFar: 0, updatedSoFar: 0 })
    let totalTarget = 0
    let totalMatched = 0
    let totalUpdated = 0
    let totalMissingMap = 0
    let totalWithoutRawRate = 0
    let totalHealed = 0
    let lastMissingSamples:
      | Array<{
          pms_rate_id: string
          count: number
          rate_name_in_raw: string | null
          sample_booking?: {
            pms_ref: string
            check_in_date: string | null
            guest_name: string | null
          } | null
        }>
      | undefined
    let lastPresentRateIds:
      | Array<{ pms_rate_id: string; name: string | null; code: string | null }>
      | undefined
    let chunks = 0
    const SAFETY_MAX_CHUNKS = 20 // 20 * 5000 = 100k booking max

    try {
      while (chunks < SAFETY_MAX_CHUNKS) {
        const r = await fetch("/api/superadmin/backfill-rate-fields", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelId }),
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.error || `HTTP ${r.status}`)
        }
        const data = await r.json()
        const res = data.hotels?.[0] ?? data.results?.[0] ?? data
        chunks++
        totalTarget += res.target ?? 0
        totalMatched += res.matched ?? 0
        totalUpdated += res.updated ?? 0
        totalMissingMap += res.missingRateRow ?? res.missing_map ?? 0
        totalWithoutRawRate += res.bookingsWithoutRawRate ?? 0
        totalHealed += res.healedRates ?? 0
        if (Array.isArray(res.missingRateIdSamples) && res.missingRateIdSamples.length > 0) {
          lastMissingSamples = res.missingRateIdSamples
        }
        if (Array.isArray(res.presentRateIds) && res.presentRateIds.length > 0) {
          lastPresentRateIds = res.presentRateIds
        }
        setState({
          kind: "loading",
          chunks,
          matchedSoFar: totalMatched,
          updatedSoFar: totalUpdated,
        })
        if (res.done === true || res.target === 0) break
      }

      setState({
        kind: "done",
        target: totalTarget,
        matched: totalMatched,
        updated: totalUpdated,
        missingMap: totalMissingMap,
        bookingsWithoutRawRate: totalWithoutRawRate,
        chunks,
        healedRates: totalHealed,
        missingRateIdSamples: lastMissingSamples,
        presentRateIds: lastPresentRateIds,
      })
      onDone()
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message })
    }
  }

  /**
   * Shortcut "Crea tariffa" per ogni pms_rate_id orfano. Risolve il caso
   * residuo dopo "Sincronizza tariffe": se Scidoo non restituisce piu' una
   * tariffa via getRates.php (rate dismessa/archiviata), l'unico modo di
   * popolare `rates.pms_rate_id` per quel valore e' creare una riga custom
   * dalla pagina mappature. Questo helper:
   *  1. impersona l'hotel target via cookie (POST impersonate)
   *  2. naviga a /settings/mappings con i query param ?createPmsId=...&createName=...
   *  3. RateMappingEditor leggera' i query param e aprira' il dialog
   *     precompilato (vedi `useSearchParams` in rate-mapping-editor.tsx).
   *
   * Full reload via window.location e' obbligatorio: il cookie
   * impersonated_hotel_id viene letto server-side da getSettingsData().
   */
  const [creatingShortcut, setCreatingShortcut] = useState<string | null>(null)
  // BUG FIX 30/04/2026 (audit shortcut): errore separato dallo `state` del
  // backfill. Se l'impersonate fallisce, NON dobbiamo sovrascrivere lo
  // state.kind="done" che contiene la lista delle tariffe orfane appena
  // calcolata: l'utente perderebbe tutto il contesto e dovrebbe rilanciare
  // sync + backfill da capo.
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  async function goCreateRate(pmsId: string, suggestedName: string | null) {
    if (creatingShortcut) return
    setCreatingShortcut(pmsId)
    setShortcutError(null)
    try {
      const r = await fetch("/api/superadmin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || "Impossibile impersonare l'hotel")
      }
      const params = new URLSearchParams()
      params.set("createPmsId", pmsId)
      if (suggestedName && suggestedName.trim()) {
        params.set("createName", suggestedName.trim())
      }
      window.location.href = `/settings/mappings?${params.toString()}`
    } catch (e) {
      setCreatingShortcut(null)
      setShortcutError((e as Error).message)
    }
  }

  // FEATURE 01/05/2026 (richiesta utente): dialog "Apri" — mostra i
  // dettagli del booking di esempio per identificare manualmente la tariffa
  // archiviata. Dialog "Associa" — clona una tariffa esistente in `rates`
  // creandone una nuova con scidoo_rate_id orfano.
  type OrphanSample = {
    pms_rate_id: string
    count: number
    rate_name_in_raw: string | null
    sample_booking?: {
      pms_ref: string
      check_in_date: string | null
      guest_name: string | null
    } | null
  }
  const [openSample, setOpenSample] = useState<OrphanSample | null>(null)
  const [associateSample, setAssociateSample] = useState<OrphanSample | null>(null)
  const [associateTargetId, setAssociateTargetId] = useState<string>("")
  const [associatingId, setAssociatingId] = useState<string | null>(null)

  async function performAssociate() {
    if (!associateSample || !associateTargetId) return
    setAssociatingId(associateSample.pms_rate_id)
    setShortcutError(null)
    try {
      const r = await fetch("/api/admin/connectors-health/associate-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          orphan_pms_rate_id: associateSample.pms_rate_id,
          // FIX 01/05/2026 (incident "Tariffa di riferimento non trovata"):
          // il valore del Select e' lo scidoo_rate_id (vedi
          // `presentRateIds[].pms_rate_id` dell'API backfill), non un UUID.
          // Inviamo il param col nome corretto e l'endpoint cerca la
          // riga rates per scidoo_rate_id invece che per id.
          target_scidoo_rate_id: associateTargetId,
        }),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(json.error || `HTTP ${r.status}`)
      }
      // Chiudi il dialog e rilancia il backfill per popolare i booking storici.
      setAssociateSample(null)
      setAssociateTargetId("")
      setAssociatingId(null)
      // Trigger backfill ricalcolo: il prossimo run trovera' match.
      runBackfill()
    } catch (e) {
      setAssociatingId(null)
      setShortcutError((e as Error).message)
    }
  }

  /**
   * Sincronizza le tariffe da Scidoo e rilancia automaticamente il backfill.
   * Risolve il caso "missingRateRow > 0" che e' la causa principale di
   * "Be Safe su OTA": se la tabella `rates` non contiene i pms_rate_id dei
   * booking storici, il backfill scrive rate_name/rate_code ma rate_id=NULL,
   * e il Guard ricade sul fallback any-rate.
   */
  async function syncRatesAndRetry() {
    setState({ kind: "syncing-rates" })
    try {
      // 1. Sincronizza tariffe da Scidoo per questo hotel.
      const r = await fetch("/api/scidoo/rates/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        // Includiamo il `details` se disponibile cosi' il superadmin capisce
        // se l'errore e' un constraint violation, RLS, network, ecc.
        const detail = err.details ? ` — ${err.details}` : ""
        throw new Error(`${err.error || "Sync tariffe fallito"} (HTTP ${r.status})${detail}`)
      }
      const syncResult = await r.json()
      const ratesSynced = syncResult.count ?? syncResult.synced ?? 0

      // 2. Reset rate_id sui booking gia' "backfillati" ma con rate_id NULL,
      //    cosi' il prossimo backfill li riprende. Il backend filtra per
      //    rate_id IS NULL: i booking gia' processati ora possono trovare
      //    il match nella tabella rates appena sincronizzata.
      // NOTA: i booking processati dal backfill precedente che NON avevano
      //    match in rates hanno gia' rate_id=NULL, quindi il prossimo backfill
      //    li include automaticamente. Niente reset manuale necessario.

      // 3. Rilancia automaticamente il backfill.
      setState({ kind: "loading", chunks: 0, matchedSoFar: 0, updatedSoFar: 0 })
      let totalTarget = 0
      let totalMatched = 0
      let totalUpdated = 0
      let totalMissingMap = 0
      let totalWithoutRawRate = 0
      let totalHealed = 0
      let lastMissingSamples:
        | Array<{
            pms_rate_id: string
            count: number
            rate_name_in_raw: string | null
            sample_booking?: {
              pms_ref: string
              check_in_date: string | null
              guest_name: string | null
            } | null
          }>
        | undefined
      let lastPresentRateIds:
        | Array<{ pms_rate_id: string; name: string | null; code: string | null }>
        | undefined
      let chunks = 0
      const SAFETY_MAX_CHUNKS = 20

      while (chunks < SAFETY_MAX_CHUNKS) {
        const br = await fetch("/api/superadmin/backfill-rate-fields", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelId }),
        })
        if (!br.ok) {
          const err = await br.json().catch(() => ({}))
          throw new Error(err.error || `Backfill HTTP ${br.status}`)
        }
        const data = await br.json()
        const res = data.hotels?.[0] ?? data.results?.[0] ?? data
        chunks++
        totalTarget += res.target ?? 0
        totalMatched += res.matched ?? 0
        totalUpdated += res.updated ?? 0
        totalMissingMap += res.missingRateRow ?? 0
        totalWithoutRawRate += res.bookingsWithoutRawRate ?? 0
        totalHealed += res.healedRates ?? 0
        if (Array.isArray(res.missingRateIdSamples) && res.missingRateIdSamples.length > 0) {
          lastMissingSamples = res.missingRateIdSamples
        }
        if (Array.isArray(res.presentRateIds) && res.presentRateIds.length > 0) {
          lastPresentRateIds = res.presentRateIds
        }
        setState({
          kind: "loading",
          chunks,
          matchedSoFar: totalMatched,
          updatedSoFar: totalUpdated,
        })
        if (res.done === true || res.target === 0) break
      }

      setState({
        kind: "done",
        target: totalTarget,
        matched: totalMatched,
        updated: totalUpdated,
        missingMap: totalMissingMap,
        bookingsWithoutRawRate: totalWithoutRawRate,
        chunks,
        ratesSynced,
        healedRates: totalHealed,
        missingRateIdSamples: lastMissingSamples,
        presentRateIds: lastPresentRateIds,
      })
      onDone()
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message })
    }
  }

  return (
    <div className="border-t border-amber-200 pt-4 mt-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <p className="text-xs uppercase tracking-wide text-amber-800 font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Tariffa mancante ({missingCount.toLocaleString("it-IT")} booking)
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Questi booking non hanno <code className="bg-slate-100 px-1 rounded text-[10px]">rate_id</code>: il Guard
            attribuisce loro la tariffa del prezzo pushato (spesso "Be Safe"), sbagliando per le OTA. Lancia il backfill
            per popolare correttamente <code className="bg-slate-100 px-1 rounded text-[10px]">rate_id</code>,{" "}
            <code className="bg-slate-100 px-1 rounded text-[10px]">rate_name</code>,{" "}
            <code className="bg-slate-100 px-1 rounded text-[10px]">rate_code</code> leggendoli dal raw Scidoo.
          </p>
        </div>
        {state.kind === "idle" && (
          <Button size="sm" onClick={runBackfill} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Lancia backfill
          </Button>
        )}
        {state.kind === "loading" && (
          <Button size="sm" variant="outline" disabled>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            {state.chunks === 0
              ? "Backfill in corso…"
              : `Chunk ${state.chunks} (${state.updatedSoFar.toLocaleString("it-IT")} aggiornati)…`}
          </Button>
        )}
        {state.kind === "syncing-rates" && (
          <Button size="sm" variant="outline" disabled>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Sincronizzo tariffe Scidoo…
          </Button>
        )}
      </div>

      {state.kind === "done" && (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Backfill completato{" "}
            {state.chunks > 1 && <span className="font-normal opacity-70">({state.chunks} chunk)</span>}
            {state.ratesSynced != null && (
              <span className="font-normal opacity-70">
                {" • "}{state.ratesSynced.toLocaleString("it-IT")} tariffe sincronizzate prima
              </span>
            )}
          </div>
          <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
            <li>{state.target.toLocaleString("it-IT")} booking processati</li>
            <li>{state.matched.toLocaleString("it-IT")} matchati con raw che ha rate_id</li>
            <li className="font-medium">{state.updated.toLocaleString("it-IT")} booking aggiornati</li>
            {state.healedRates > 0 && (
              <li className="text-emerald-700">
                Auto-allineate {state.healedRates.toLocaleString("it-IT")} tariffe (
                <code className="bg-emerald-100 px-1 rounded">scidoo_rate_id</code>{" "}
                ↔{" "}
                <code className="bg-emerald-100 px-1 rounded">pms_rate_id</code>
                ): la mappatura precedente era disallineata
              </li>
            )}
            {state.bookingsWithoutRawRate > 0 && (
              <li className="text-muted-foreground">
                {state.bookingsWithoutRawRate.toLocaleString("it-IT")} booking il cui raw Scidoo NON ha rate_id
                (la prenotazione e' stata creata senza tariffa nel PMS)
              </li>
            )}
            {state.missingMap > 0 && (
              <li className="text-rose-800 font-medium">
                {state.missingMap.toLocaleString("it-IT")} raw con rate_id non mappato nella tabella{" "}
                <code className="bg-rose-100 px-1 rounded">rates</code>:{" "}
                <strong>questo e' il vero problema!</strong> Sincronizza le tariffe da Scidoo qui sotto.
              </li>
            )}
            {/* FIX 01/05/2026 (incident "Casa Vacanze Rondini Blu mostrava
                'Nessun match' rosso anche se tutti i 5 booking erano
                spiegati come 'raw senza rate_id'"):
                Mostriamo questo errore SOLO se ci sono booking con rate_id
                null che NON sono coperti da nessuna delle due spiegazioni
                legittime sopra (`bookingsWithoutRawRate` o `missingMap`).
                Con `target` totale di booking processati, l'unfounded gap e'
                `target - bookingsWithoutRawRate - missingMap`. Se quella
                differenza e' > 0 ed e' tutta a `matched=0`, allora si',
                c'e' un vero problema di sync. Altrimenti il pannello
                contraddiceva i bullet appena sopra. */}
            {state.target > 0 &&
              state.matched === 0 &&
              state.target - state.bookingsWithoutRawRate - state.missingMap > 0 && (
                <li className="text-rose-700 font-medium mt-1">
                  Nessun match: i booking con rate_id null non hanno raw corrispondenti (RMS orphan) o
                  gli identificatori PMS non combaciano. Verifica la sincronizzazione Scidoo.
                </li>
              )}
            {state.target > 0 &&
              state.matched === 0 &&
              state.bookingsWithoutRawRate > 0 &&
              state.bookingsWithoutRawRate === state.target &&
              state.missingMap === 0 && (
                <li className="text-emerald-700 mt-1">
                  Nessun intervento richiesto: tutti i booking senza{" "}
                  <code className="bg-emerald-100 px-1 rounded text-[10px]">rate_id</code> derivano da
                  prenotazioni create direttamente in Scidoo senza tariffa associata (scenario
                  legittimo per case vacanze e gruppi).
                </li>
              )}
          </ul>

          {state.missingMap > 0 && (
            <>
              <div className="mt-3 pt-3 border-t border-emerald-200 flex items-start justify-between gap-2 flex-wrap">
                <p className="text-xs text-rose-800 max-w-md leading-relaxed">
                  Il backfill ha popolato <code>rate_name</code>/<code>rate_code</code> ma{" "}
                  <code>rate_id</code> e' rimasto NULL perche' la tabella <code>rates</code> non contiene questi
                  identificatori PMS. Sincronizza ora le tariffe e rilancia il backfill in un click.
                </p>
                <Button
                  size="sm"
                  onClick={syncRatesAndRetry}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Sincronizza tariffe e rilancia
                </Button>
              </div>

              {/* Diagnostica: mostra i pms_rate_id mancanti vs presenti.
                  Permette di capire se sono rate dismesse (Scidoo non le
                  restituisce piu' da getRates.php), un mismatch di formato
                  (es. typeof number vs string), o un altro problema. */}
              {(state.missingRateIdSamples?.length || state.presentRateIds?.length) ? (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-rose-200">
                  <div>
                    <p className="text-xs font-semibold text-rose-900 mb-1.5">
                      Top tariffe nei booking ma NON in <code>rates</code> ({state.missingMap.toLocaleString("it-IT")}{" "}
                      booking colpiti)
                    </p>
                    {shortcutError && (
                      <div className="mb-2 rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900 flex items-start justify-between gap-2">
                        <span>
                          <strong>Errore shortcut:</strong> {shortcutError}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShortcutError(null)}
                          className="text-rose-700 hover:text-rose-900 font-medium"
                          aria-label="Chiudi errore"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {state.missingRateIdSamples && state.missingRateIdSamples.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {state.missingRateIdSamples.map((s) => {
                          const isCreating = creatingShortcut === s.pms_rate_id
                          return (
                            <li
                              key={s.pms_rate_id}
                              className="flex items-center gap-2 bg-rose-100 rounded px-2 py-1"
                            >
                              <code className="text-rose-900 font-mono text-[11px] flex-shrink-0">
                                {s.pms_rate_id}
                              </code>
                              <span className="text-rose-800 truncate flex-1">
                                {s.rate_name_in_raw ?? <em className="opacity-60">senza nome</em>}
                              </span>
                              <span className="text-rose-700 text-[10px] tabular-nums flex-shrink-0">
                                ×{s.count}
                              </span>
                              {/* "Apri": mostra i dettagli del booking di
                                  esempio per riconoscere la tariffa
                                  archiviata su Scidoo. */}
                              {s.sample_booking && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setOpenSample(s)}
                                  className="h-6 px-2 text-[10px] flex-shrink-0 border-rose-300 hover:bg-rose-200 text-rose-900"
                                  title="Apri dettagli prenotazione di esempio"
                                >
                                  <Eye className="h-3 w-3 mr-0.5" />
                                  Apri
                                </Button>
                              )}
                              {/* "Associa": dialog per clonare una tariffa
                                  esistente con il pms_rate_id orfano. */}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  associatingId === s.pms_rate_id ||
                                  !(state.kind === "done" && state.presentRateIds && state.presentRateIds.length > 0)
                                }
                                onClick={() => {
                                  setAssociateSample(s)
                                  setAssociateTargetId("")
                                }}
                                className="h-6 px-2 text-[10px] flex-shrink-0 border-rose-300 hover:bg-rose-200 text-rose-900"
                                title="Associa a una tariffa esistente"
                              >
                                {associatingId === s.pms_rate_id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Link2 className="h-3 w-3 mr-0.5" />
                                    Associa
                                  </>
                                )}
                              </Button>
                              {/*
                                Shortcut "Crea": apre /settings/mappings con
                                il dialog precompilato per questo pms_rate_id.
                                Vedi `goCreateRate` sopra per il flow completo
                                (impersonate -> redirect -> auto-open dialog).
                              */}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isCreating || creatingShortcut !== null}
                                onClick={() => goCreateRate(s.pms_rate_id, s.rate_name_in_raw)}
                                className="h-6 px-2 text-[10px] flex-shrink-0 border-rose-300 hover:bg-rose-200 text-rose-900"
                                title="Crea tariffa custom in mappature"
                              >
                                {isCreating ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Plus className="h-3 w-3 mr-0.5" />
                                    Crea
                                  </>
                                )}
                              </Button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Nessun sample disponibile</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-900 mb-1.5">
                      Tariffe attualmente in <code>rates</code> (sample)
                    </p>
                    {state.presentRateIds && state.presentRateIds.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {state.presentRateIds.map((s) => (
                          <li
                            key={s.pms_rate_id}
                            className="flex items-baseline gap-2 bg-emerald-100 rounded px-2 py-1"
                          >
                            <code className="text-emerald-900 font-mono text-[11px]">{s.pms_rate_id}</code>
                            <span className="text-emerald-800 truncate flex-1">
                              {s.name ?? <em className="opacity-60">senza nome</em>}
                            </span>
                            {s.code && (
                              <span className="text-emerald-700 text-[10px] font-mono">{s.code}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Tabella <code>rates</code> vuota per questo hotel
                      </p>
                    )}
                  </div>
                  <p className="md:col-span-2 text-[11px] text-muted-foreground leading-relaxed">
                    Se i sample mancanti non compaiono mai a destra dopo aver sincronizzato, significa che Scidoo non
                    restituisce piu' quelle tariffe via <code>getRates.php</code> (rate dismesse / archiviate). Per
                    risolverle in 1 click usa il pulsante <strong>Crea</strong> a fianco di ogni riga: apre la pagina
                    mappature con il dialog precompilato sul <code>pms_rate_id</code> e nome suggerito.
                  </p>
                </div>
              ) : null}
            </>
          )}

          <Button variant="ghost" size="sm" className="mt-2 h-6 text-xs" onClick={() => setState({ kind: "idle" })}>
            Chiudi
          </Button>
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Errore: {state.message}
          </div>
          <Button variant="ghost" size="sm" className="mt-2 h-6 text-xs" onClick={() => setState({ kind: "idle" })}>
            Riprova
          </Button>
        </div>
      )}

      {/* Dialog "Apri": dettagli del booking di esempio per riconoscere
          manualmente la tariffa archiviata. Non offriamo deep-link a Scidoo
          perche' l'app non conosce l'URL del PMS dell'hotel; mostriamo
          ID-Scidoo, check-in e ospite, abbastanza da cercare la
          prenotazione su Scidoo a mano. */}
      <Dialog open={!!openSample} onOpenChange={(open) => !open && setOpenSample(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prenotazione di esempio</DialogTitle>
            <DialogDescription>
              Identifica la tariffa archiviata cercando questa prenotazione su Scidoo.
            </DialogDescription>
          </DialogHeader>
          {openSample?.sample_booking ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">ID PMS</dt>
                <dd className="font-mono">{openSample.sample_booking.pms_ref}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Identificativo PMS tariffa</dt>
                <dd className="font-mono">{openSample.pms_rate_id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Check-in</dt>
                <dd>{openSample.sample_booking.check_in_date ?? "-"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Ospite</dt>
                <dd>{openSample.sample_booking.guest_name ?? "-"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Booking colpiti</dt>
                <dd>{openSample.count}</dd>
              </div>
            </dl>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSample(null)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog "Associa": clona una tariffa esistente di `rates`
          aggiungendone una nuova con il pms_rate_id orfano. Il backfill
          successivo trovera' match e popolera' i booking storici. */}
      <Dialog
        open={!!associateSample}
        onOpenChange={(open) => {
          if (!open) {
            setAssociateSample(null)
            setAssociateTargetId("")
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Associa a tariffa esistente</DialogTitle>
            <DialogDescription>
              Scegli una tariffa gia' presente in mappature: ne creeremo una copia con
              l&apos;identificativo PMS orfano{" "}
              <code className="font-mono text-xs">{associateSample?.pms_rate_id}</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={associateTargetId} onValueChange={setAssociateTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona la tariffa di riferimento" />
              </SelectTrigger>
              <SelectContent>
                {(state.kind === "done" ? state.presentRateIds ?? [] : []).map((r) => (
                  <SelectItem key={r.pms_rate_id} value={r.pms_rate_id}>
                    {r.name ?? "(senza nome)"}
                    {r.code ? ` · ${r.code}` : ""}
                    <span className="ml-2 text-xs text-muted-foreground">({r.pms_rate_id})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {associateSample?.sample_booking ? (
              <p className="text-xs text-muted-foreground">
                Booking di esempio:{" "}
                <span className="font-mono">{associateSample.sample_booking.pms_ref}</span>
                {associateSample.sample_booking.check_in_date
                  ? ` · ${associateSample.sample_booking.check_in_date}`
                  : ""}
                {associateSample.sample_booking.guest_name
                  ? ` · ${associateSample.sample_booking.guest_name}`
                  : ""}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssociateSample(null)
                setAssociateTargetId("")
              }}
            >
              Annulla
            </Button>
            <Button
              disabled={!associateTargetId || associatingId !== null}
              onClick={performAssociate}
            >
              {associatingId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Associa e rilancia backfill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
  warn,
  good,
  muted,
}: {
  label: string
  value: number
  hint?: string
  warn?: boolean
  good?: boolean
  muted?: boolean
}) {
  let valueClass = "text-foreground"
  if (good) valueClass = "text-emerald-700"
  else if (warn) valueClass = "text-rose-700"
  else if (muted) valueClass = "text-muted-foreground"

  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${valueClass}`}>{value.toLocaleString("it-IT")}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

interface ForceETLHotelInput {
  hotel_id: string
  hotel_name: string
  unprocessed: number
  orphan: number
}

interface ForceETLResultHotel {
  hotel_id: string
  hotel_name: string
  status: "ok" | "blocked" | "error"
  block_reason?: string
  error_message?: string
  records_processed?: number
  records_inserted?: number
  records_updated?: number
  records_failed?: number
  orphans_reset?: number
  unprocessed_before_sweep?: number
  marked_processed_by_sweep?: number
  still_unprocessed_after_sweep?: number
  sweep_error?: string
  duration_ms?: number
}
interface ForceETLResponse {
  ok: boolean
  hotels: ForceETLResultHotel[]
}

/**
 * Pannello "Forza ETL". Lancia il BookingsProcessor (path B) sugli hotel con
 * backlog (raw_unprocessed > 0) e/o RAW orphan (raw senza booking).
 * Risolve entrambi i problemi: il processor crea i bookings mancanti e
 * marca le raw `processed=true`.
 *
 * Se il guard ETL (can_run_etl) blocca un hotel, mostra il block_reason
 * esplicito così è chiaro dove intervenire (es. mapping non validato).
 */
function ForceETLPanel({
  hotelsWithIssues,
  onDone,
}: {
  hotelsWithIssues: ForceETLHotelInput[]
  onDone: () => void
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "running"; current: string }
    | { kind: "done"; data: ForceETLResponse }
    | { kind: "error"; message: string }
  >({ kind: "idle" })
  // Default ON: senza reset orphans il processor non li tocca mai (processed=true).
  // L'utente può disattivarlo se vuole solo smaltire il backlog.
  const [resetOrphans, setResetOrphans] = useState(true)
  // Log live visibile in UI: ogni fase del fetch viene appesa qui in tempo reale.
  // Sostituisce la necessità di tenere DevTools aperti per debuggare il pannello.
  const [log, setLog] = useState<string[]>([])

  const appendLog = (line: string) => {
    const stamp = new Date().toLocaleTimeString("it-IT")
    setLog((l) => [...l, `[${stamp}] ${line}`])
    // Stampo anche in console per chi vuole DevTools
    // eslint-disable-next-line no-console
    console.log("[v0] force-etl-ui:", line)
  }

  if (hotelsWithIssues.length === 0 && state.kind === "idle" && log.length === 0) {
    return null
  }

  const totalUnprocessed = hotelsWithIssues.reduce((a, h) => a + h.unprocessed, 0)
  const totalOrphan = hotelsWithIssues.reduce((a, h) => a + h.orphan, 0)

  const callForceETL = async (hotelId: string | undefined, currentLabel: string) => {
    setLog([])
    setState({ kind: "running", current: currentLabel })
    appendLog(`Avvio ETL per ${currentLabel}, resetOrphans=${resetOrphans}`)
    const t0 = Date.now()
    try {
      appendLog(`POST /api/admin/connectors-health/force-etl …`)
      const r = await fetch("/api/admin/connectors-health/force-etl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, resetOrphans }),
      })
      appendLog(`Risposta HTTP ${r.status} ${r.statusText} dopo ${((Date.now() - t0) / 1000).toFixed(1)}s`)
      const rawText = await r.text()
      appendLog(`Body length: ${rawText.length} chars · primi 300: ${rawText.slice(0, 300)}`)
      if (!r.ok) {
        let errMsg = `HTTP ${r.status}`
        try {
          const errJson = JSON.parse(rawText) as { error?: string }
          if (errJson.error) errMsg = errJson.error
        } catch {
          if (rawText) errMsg = rawText.slice(0, 200)
        }
        throw new Error(errMsg)
      }
      let data: ForceETLResponse
      try {
        data = JSON.parse(rawText) as ForceETLResponse
      } catch (parseErr) {
        throw new Error(`Risposta non JSON: ${(parseErr as Error).message}`)
      }
      appendLog(`Parse JSON OK · ${data.hotels?.length ?? 0} hotel nel risultato`)
      for (const h of data.hotels ?? []) {
        appendLog(
          `  - ${h.hotel_name}: status=${h.status}` +
            (h.records_processed !== undefined
              ? ` processed=${h.records_processed} inserted=${h.records_inserted} updated=${h.records_updated} failed=${h.records_failed}`
              : "") +
            (h.orphans_reset ? ` orphans_reset=${h.orphans_reset}` : "") +
            (h.unprocessed_before_sweep !== undefined
              ? ` sweep=${h.marked_processed_by_sweep ?? 0}/${h.unprocessed_before_sweep} (residuo=${h.still_unprocessed_after_sweep ?? 0})`
              : "") +
            (h.sweep_error ? ` sweep_error="${h.sweep_error}"` : "") +
            (h.block_reason ? ` block_reason="${h.block_reason}"` : "") +
            (h.error_message ? ` error="${h.error_message}"` : ""),
        )
      }
      setState({ kind: "done", data })
      onDone()
    } catch (e) {
      const msg = (e as Error).message
      appendLog(`ERRORE: ${msg}`)
      setState({ kind: "error", message: msg })
    }
  }

  /**
   * runAll: PRIMA chiamava force-etl con `hotelId=undefined` → il backend
   * processava tutti gli hotel in serie nello stesso request. Per Barronci
   * (~19k raw) + backfill rate fields (paginazione + update batch) il
   * tempo cresce molto e Vercel fa partire 504 a 120s.
   *
   * FIX 30/04/2026: la UI ora fa una request per hotel, sequenzialmente,
   * accumulando i risultati. Ogni request resta sotto i 120s e il log mostra
   * il progresso. Se un hotel fallisce, gli altri proseguono comunque.
   */
  const runAll = async () => {
    if (hotelsWithIssues.length === 0) {
      callForceETL(undefined, "nessun hotel con anomalie")
      return
    }
    setLog([])
    setState({ kind: "running", current: `${hotelsWithIssues.length} hotel in serie` })
    appendLog(
      `Avvio ETL sequenziale su ${hotelsWithIssues.length} hotel · resetOrphans=${resetOrphans}`,
    )

    const aggregated: ForceETLResultHotel[] = []
    let firstError: string | undefined

    for (let i = 0; i < hotelsWithIssues.length; i++) {
      const h = hotelsWithIssues[i]
      const label = `${h.hotel_name} (${i + 1}/${hotelsWithIssues.length})`
      setState({ kind: "running", current: label })
      appendLog(`[${i + 1}/${hotelsWithIssues.length}] ${h.hotel_name} → POST force-etl`)
      const t0 = Date.now()
      try {
        const r = await fetch("/api/admin/connectors-health/force-etl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelId: h.hotel_id, resetOrphans }),
        })
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
        const rawText = await r.text()
        if (!r.ok) {
          let errMsg = `HTTP ${r.status}`
          try {
            const j = JSON.parse(rawText) as { error?: string }
            if (j.error) errMsg = j.error
          } catch {
            if (rawText) errMsg = rawText.slice(0, 200)
          }
          appendLog(`  ✗ ${h.hotel_name}: errore dopo ${elapsed}s → ${errMsg}`)
          if (!firstError) firstError = `${h.hotel_name}: ${errMsg}`
          // Aggiungi un risultato sintetico cosi' la UI mostra cosa e' andato storto
          aggregated.push({
            hotel_id: h.hotel_id,
            hotel_name: h.hotel_name,
            status: "error",
            error_message: errMsg,
          })
          continue
        }
        const data = JSON.parse(rawText) as ForceETLResponse
        appendLog(`  ✓ ${h.hotel_name}: HTTP ${r.status} dopo ${elapsed}s`)
        for (const ph of data.hotels ?? []) {
          aggregated.push(ph)
          appendLog(
            `    · status=${ph.status}` +
              (ph.records_processed !== undefined
                ? ` processed=${ph.records_processed} inserted=${ph.records_inserted} updated=${ph.records_updated} failed=${ph.records_failed}`
                : "") +
              (ph.orphans_reset ? ` orphans_reset=${ph.orphans_reset}` : "") +
              (ph.unprocessed_before_sweep !== undefined
                ? ` sweep=${ph.marked_processed_by_sweep ?? 0}/${ph.unprocessed_before_sweep}`
                : "") +
              (ph.error_message ? ` error="${ph.error_message}"` : ""),
          )
        }
      } catch (e) {
        const msg = (e as Error).message
        appendLog(`  ✗ ${h.hotel_name}: ${msg}`)
        if (!firstError) firstError = `${h.hotel_name}: ${msg}`
        aggregated.push({
          hotel_id: h.hotel_id,
          hotel_name: h.hotel_name,
          status: "error",
          error_message: msg,
        })
      }
    }

    const okHotels = aggregated.filter((x) => x.status === "ok")
    appendLog(`Force-ETL completato. ${okHotels.length}/${aggregated.length} hotel ok`)

    // ─── FASE 2: backfill rate fields per ogni hotel ok ──────────────────
    // Endpoint separato (non piu' inline in force-etl) per restare sotto i 120s
    // di Vercel anche su Barronci (~19k bookings). Idempotente: lavora solo
    // sui bookings con rate_id IS NULL. Loop fino a done=true, max 10 chunk
    // per hotel come safety.
    if (okHotels.length > 0) {
      appendLog(`Avvio backfill rate fields su ${okHotels.length} hotel`)
      for (let i = 0; i < okHotels.length; i++) {
        const h = okHotels[i]
        setState({
          kind: "running",
          current: `Backfill rate ${h.hotel_name} (${i + 1}/${okHotels.length})`,
        })
        appendLog(
          `[${i + 1}/${okHotels.length}] ${h.hotel_name} → POST backfill-rate-fields (loop)`,
        )
        let totalUpdated = 0
        let totalMatched = 0
        let chunks = 0
        for (let attempt = 0; attempt < 10; attempt++) {
          const t0 = Date.now()
          try {
            const r = await fetch("/api/superadmin/backfill-rate-fields", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ hotelId: h.hotel_id, maxBookings: 5000 }),
            })
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
            const text = await r.text()
            if (!r.ok) {
              let errMsg = `HTTP ${r.status}`
              try {
                const j = JSON.parse(text) as { error?: string }
                if (j.error) errMsg = j.error
              } catch {
                if (text) errMsg = text.slice(0, 200)
              }
              appendLog(`  ✗ backfill ${h.hotel_name}: ${elapsed}s → ${errMsg}`)
              break
            }
            const data = JSON.parse(text) as {
              hotels?: Array<{
                target?: number
                matched?: number
                updated?: number
                missingRateRow?: number
                // FIX 14/05/2026: il backend espone gia' questo campo ma
                // l'UI lo ignorava. Senza, quando Scidoo non trasmette il
                // rate_id sul raw (target=1000 matched=0), il log sembrava
                // un bug del backfill. Ora lo mostriamo esplicito.
                bookingsWithoutRawRate?: number
                done?: boolean
                error?: string
              }>
            }
            const ph = data.hotels?.[0]
            if (!ph) {
              appendLog(`  ✗ backfill ${h.hotel_name}: risposta vuota dopo ${elapsed}s`)
              break
            }
            chunks++
            totalUpdated += ph.updated ?? 0
            totalMatched += ph.matched ?? 0
            appendLog(
              `  · chunk #${chunks} dopo ${elapsed}s · target=${ph.target ?? 0} matched=${ph.matched ?? 0} updated=${ph.updated ?? 0}` +
                (ph.bookingsWithoutRawRate ? ` noRateInRaw=${ph.bookingsWithoutRawRate}` : "") +
                (ph.missingRateRow ? ` missingMap=${ph.missingRateRow}` : "") +
                (ph.error ? ` error="${ph.error}"` : ""),
            )
            // Spiegazione esplicita: target>0 + matched=0 non e' un bug, e'
            // semplicemente che il PMS non ha trasmesso la tariffa per
            // quelle prenotazioni (campo rate_id vuoto sul payload). Niente
            // da backfillare lato server, serve azione manuale sul PMS o
            // un mapping fallback (vedi "tariffa muta da Scidoo").
            if ((ph.target ?? 0) > 0 && (ph.matched ?? 0) === 0 && (ph.bookingsWithoutRawRate ?? 0) === (ph.target ?? 0)) {
              appendLog(
                `    ⓘ ${ph.bookingsWithoutRawRate} prenotazioni senza rate nel payload PMS (rate_id vuoto): nulla da backfillare. ` +
                  `Le tariffe non sono mai state trasmesse dal PMS per questi booking.`,
              )
            }
            if (ph.error) break
            if (ph.done) {
              appendLog(`  ✓ backfill ${h.hotel_name} completato (${chunks} chunk, ${totalUpdated}/${totalMatched} update)`)
              break
            }
          } catch (e) {
            appendLog(`  ✗ backfill ${h.hotel_name}: ${(e as Error).message}`)
            break
          }
        }
      }
    }

    appendLog(`Tutto completato. ${okHotels.length}/${aggregated.length} hotel ok (force-etl + backfill)`)
    if (firstError) {
      // Errore presentato come "warning soft": gli altri hotel sono comunque
      // processati, vediamo i risultati nella tabella.
      setState({ kind: "done", data: { ok: false, hotels: aggregated } })
    } else {
      setState({ kind: "done", data: { ok: true, hotels: aggregated } })
    }
    onDone()
  }
  const runSingle = (hotelId: string, hotelName: string) => callForceETL(hotelId, hotelName)

  return (
    <Card className="border-blue-300 bg-blue-50/50">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-700" />
              Forza ETL bookings
            </CardTitle>
            <CardDescription>
              Lancia il BookingsProcessor sugli hotel con backlog o RAW orphan. Risolve in un colpo solo{" "}
              <span className="font-medium">{totalUnprocessed.toLocaleString("it-IT")}</span> RAW non processate
              e <span className="font-medium">{totalOrphan.toLocaleString("it-IT")}</span> RAW senza booking.
              Rispetta il guard `can_run_etl` (mapping deve essere VALIDATED/LOCKED).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.kind === "idle" && (
          <div className="space-y-3">
            <ul className="text-sm space-y-1 text-muted-foreground">
              {hotelsWithIssues.map((h) => (
                <li key={h.hotel_id} className="flex items-center justify-between gap-3 flex-wrap">
                  <span>
                    <span className="text-foreground font-medium">{h.hotel_name}</span>:{" "}
                    {h.unprocessed > 0 && <span>{h.unprocessed.toLocaleString("it-IT")} non processate</span>}
                    {h.unprocessed > 0 && h.orphan > 0 && " · "}
                    {h.orphan > 0 && <span>{h.orphan.toLocaleString("it-IT")} orphan</span>}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => runSingle(h.hotel_id, h.hotel_name)}
                    className="h-7 text-xs"
                  >
                    Solo questo
                  </Button>
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetOrphans}
                onChange={(e) => setResetOrphans(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-foreground">Risolvi anche gli orphan</span>
                <span className="text-muted-foreground">
                  {" "}
                  — marca `processed=false` i RAW senza booking corrispondente, poi li rielabora.
                  Necessario per i RAW orphan (il processor altrimenti li ignora).
                </span>
              </span>
            </label>
            <Button onClick={runAll}>Esegui per tutti</Button>
            <p className="text-xs text-muted-foreground">
              Esecuzione sequenziale, sicura: ogni hotel viene processato dal BookingsProcessor con upsert
              idempotente. Se il mapping di un hotel non è validato, l&apos;ETL viene saltato e il motivo
              viene mostrato.
            </p>
          </div>
        )}

        {state.kind === "running" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            ETL in corso: {state.current}…
          </div>
        )}

        {state.kind === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              ETL completato
            </div>
            <ForceETLResultTable data={state.data} />
            <Button variant="outline" size="sm" onClick={() => setState({ kind: "idle" })}>
              Chiudi
            </Button>
          </div>
        )}

        {state.kind === "error" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-rose-700 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Errore: {state.message}
            </div>
            <Button variant="outline" size="sm" onClick={() => setState({ kind: "idle" })}>
              Riprova
            </Button>
          </div>
        )}

        {/* Log live: visibile in qualsiasi stato finché ci sono righe.
            Permette di diagnosticare cosa fa la chiamata senza aprire DevTools. */}
        {log.length > 0 && (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-200">
              <span className="text-xs font-medium text-slate-700">Log esecuzione</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => {
                  navigator.clipboard
                    .writeText(log.join("\n"))
                    .then(() => appendLog("Log copiato negli appunti"))
                    .catch((e) => appendLog(`Copy failed: ${(e as Error).message}`))
                }}
              >
                Copia
              </Button>
            </div>
            <pre className="px-3 py-2 text-[11px] leading-relaxed font-mono text-slate-800 whitespace-pre-wrap break-all max-h-64 overflow-auto">
              {log.join("\n")}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ForceETLResultTable({ data }: { data: ForceETLResponse }) {
  return (
    <ul className="space-y-2 text-sm">
      {data.hotels.map((h) => {
        if (h.status === "ok") {
          return (
            <li key={h.hotel_id} className="flex flex-col gap-0.5 text-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-medium">{h.hotel_name}</span>
              </div>
              <span className="text-muted-foreground text-xs ml-5">
                {(h.orphans_reset ?? 0) > 0 && (
                  <span className="text-blue-700">
                    {h.orphans_reset?.toLocaleString("it-IT")} orphan resettati ·{" "}
                  </span>
                )}
                {h.records_processed?.toLocaleString("it-IT") ?? 0} processate ·{" "}
                {h.records_inserted?.toLocaleString("it-IT") ?? 0} inserite ·{" "}
                {h.records_updated?.toLocaleString("it-IT") ?? 0} aggiornate
                {(h.records_failed ?? 0) > 0 && (
                  <span className="text-rose-700"> · {h.records_failed} fallite</span>
                )}
                {(h.marked_processed_by_sweep ?? 0) > 0 && (
                  <span className="text-emerald-700">
                    {" "}
                    · sweep: {h.marked_processed_by_sweep?.toLocaleString("it-IT")} marcati
                  </span>
                )}
                {(h.still_unprocessed_after_sweep ?? 0) > 0 && (
                  <span className="text-amber-700">
                    {" "}
                    · {h.still_unprocessed_after_sweep?.toLocaleString("it-IT")} residui
                  </span>
                )}
                {h.duration_ms !== undefined && (
                  <span> · {(h.duration_ms / 1000).toFixed(1)}s</span>
                )}
              </span>
              {h.sweep_error && (
                <span className="text-rose-700 text-xs ml-5 break-all">
                  Sweep error: {h.sweep_error}
                </span>
              )}
            </li>
          )
        }
        if (h.status === "blocked") {
          return (
            <li key={h.hotel_id} className="flex items-start gap-2 text-amber-900">
              <Ban className="h-3.5 w-3.5 mt-0.5 text-amber-700" />
              <div>
                <span className="font-medium">{h.hotel_name}</span>
                <span className="text-muted-foreground"> · bloccato dal guard ETL</span>
                <p className="text-xs text-muted-foreground mt-0.5">{h.block_reason}</p>
                {(h.orphans_reset ?? 0) > 0 && (
                  <p className="text-xs text-blue-700 mt-0.5">
                    {h.orphans_reset} orphan resettati prima del block (verranno processati al prossimo run)
                  </p>
                )}
              </div>
            </li>
          )
        }
        return (
          <li key={h.hotel_id} className="flex items-start gap-2 text-rose-900">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-rose-700" />
            <div>
              <span className="font-medium">{h.hotel_name}</span>
              <span className="text-muted-foreground">
                {" "}
                · errore (records_failed: {h.records_failed ?? 0})
              </span>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">
                {h.error_message || "(nessun messaggio)"}
              </p>
              {(h.orphans_reset ?? 0) > 0 && (
                <p className="text-xs text-blue-700 mt-0.5">
                  {h.orphans_reset} orphan resettati prima dell&apos;errore
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
