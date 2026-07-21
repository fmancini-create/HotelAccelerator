"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Clock, RefreshCw, RotateCw, Shield } from "lucide-react"
import { ReviewsKpi, type StatsPayload } from "./reviews-kpi"
import { ReviewsChannelBreakdown } from "./reviews-channel-breakdown"
import { ReviewsWidgetDialog } from "./reviews-widget-dialog"
import { ReviewReplySettingsDialog } from "./review-reply-settings-dialog"
import { ReviewsTrendChart } from "./reviews-trend-chart"
import { ReviewsAiInsights } from "./reviews-ai-insights"
import { ReviewsList } from "./reviews-list"
import { createClient } from "@/lib/supabase/client"

/**
 * Top-level orchestrator for the /dati/reviews page.
 *
 * Fetches the stats payload (KPI + trend + per-platform + sentiment) and the
 * AI insights, then drives the filters shared with <ReviewsList/>. Also owns
 * the "Sincronizza" action that kicks off a fresh Apify pull.
 */

/**
 * Sanifica un messaggio di errore di sincronizzazione per i tenant: rimuove
 * riferimenti a fornitori infrastrutturali (Apify), link interni di billing
 * e termini tecnici, mantenendo SOLO il nome della piattaforma OTA e un
 * messaggio neutro. Al super_admin mostriamo invece la stringa raw originale
 * (utile per troubleshooting di quota/billing).
 *
 * Esempio:
 *   raw    = "Booking.com: booking: Limite mensile di utilizzo Apify raggiunto. Aumenta il piano o l'usage limit su console.apify.com/billing."
 *   output = "Booking.com: sincronizzazione temporaneamente non disponibile. Riprovare piu' tardi o contattare il supporto."
 */
function sanitizeSyncErrorForTenant(raw: string): string {
  if (!raw) return raw
  // Token sensibili che NON devono mai apparire al tenant.
  const SENSITIVE_PATTERNS = [
    /apify/i,
    /console\.[a-z0-9.-]+/i,
    /usage limit/i,
    /limite mensile/i,
    /\bquota\b/i,
    /\bbilling\b/i,
    /\bcredit(?:s|i)?\b/i,
    /\bactor\b/i,
    /https?:\/\//i,
    /\b\d{3}\b\s*(?:error|status)/i,
    /\bECONN/i,
    /\btimeout\b/i,
  ]
  // Eventuali prefissi tipo "[Sync completo] " vanno preservati.
  const prefixMatch = raw.match(/^\s*(\[[^\]]+\]\s*)/)
  const prefix = prefixMatch ? prefixMatch[1] : ""
  const body = prefix ? raw.slice(prefix.length) : raw
  // I segmenti sono separati da " • " (vedi runSync).
  const segments = body.split(/\s*•\s*/).filter(Boolean)
  const sanitized = segments.map((segment) => {
    // Estrai "<Platform>: <rest>" se possibile.
    const colonIdx = segment.indexOf(":")
    const platform = colonIdx > -1 ? segment.slice(0, colonIdx).trim() : ""
    const rest = colonIdx > -1 ? segment.slice(colonIdx + 1).trim() : segment
    const isSensitive = SENSITIVE_PATTERNS.some((re) => re.test(rest))
    if (isSensitive) {
      const label = platform || "Piattaforma"
      return `${label}: sincronizzazione temporaneamente non disponibile. Riprovare piu' tardi o contattare il supporto.`
    }
    return segment
  })
  return prefix + sanitized.join(" • ")
}
export function ReviewsClient({ hotelId }: { hotelId: string }) {
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSyncMsg, setLastSyncMsg] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<string | null>(null)
  // Superadmin-only: pulsante "Sync di nuovo tutto" che simula la prima
  // sincronizzazione (forceFull=true). Visibile solo se profile.role === "super_admin".
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [showFullResyncDialog, setShowFullResyncDialog] = useState(false)
  // Canali dormienti per questo hotel: lista popolata da
  // /api/integrations/reviews/dormant-channels al mount e dopo ogni sync.
  // Usata per il banner "verifica URL" non-allarmante (vedi piu' sotto).
  const [dormantChannels, setDormantChannels] = useState<
    Array<{ platform: string; dormant_since: string | null; last_review_found_at: string | null }>
  >([])

  // Carica il ruolo dell'utente al mount per decidere se mostrare il bottone superadmin
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const authResult = await supabase.auth.getUser()
        const user = authResult.data?.user as { id?: string } | null | undefined
        const userId = user?.id
        if (!userId || cancelled) return
        const res = await fetch(`/api/internal/user-role?userId=${userId}`)
        if (!res.ok || cancelled) return
        const body = await res.json()
        if (!cancelled) setIsSuperAdmin(body?.role === "super_admin")
      } catch {
        // best-effort: non bloccare la pagina se la chiamata fallisce
      }
    })()
    return () => { cancelled = true }
  }, [])

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reviews/stats?hotelId=${hotelId}`)
      if (res.ok) {
        setStats(await res.json())
      } else {
        setStats(null)
      }
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [hotelId])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Carica la lista dei canali dormienti per questo hotel. La rifetchiamo
  // anche dopo ogni sync (vedi runSync) cosi' se l'utente risveglia un
  // canale tramite "Sincronizza ora" il banner sparisce subito.
  const fetchDormant = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/integrations/reviews/dormant-channels?hotelId=${hotelId}`
      )
      if (!res.ok) return
      const body = await res.json()
      setDormantChannels(Array.isArray(body?.dormant) ? body.dormant : [])
    } catch {
      // best-effort: il banner non e' critico, ignoriamo gli errori di rete
    }
  }, [hotelId])

  useEffect(() => {
    fetchDormant()
  }, [fetchDormant])

  /**
   * Parse a fetch Response safely even if the server returned HTML/plain text
   * (e.g. when a serverless function times out and Vercel returns an HTML
   * error page). Returns an object you can safely inspect.
   */
  const safeParse = async (res: Response): Promise<any> => {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      // Not JSON — surface a user-friendly slice of the raw body.
      return { error: text.slice(0, 200) || `HTTP ${res.status}` }
    }
  }

  const PLATFORM_LABELS: Record<string, string> = {
    google: "Google",
    booking: "Booking.com",
    tripadvisor: "TripAdvisor",
    expedia: "Expedia",
    vrbo: "VRBO",
    airbnb: "Airbnb",
  }

  // forceFull=true riavvia la "prima sincronizzazione" (FULL_SYNC_MAX recensioni
  // per piattaforma, fino a 500 ciascuna) ignorando il fatto che ci siano gia
  // recensioni in DB. Esposto solo via bottone superadmin.
  const runSync = useCallback(async (opts: { forceFull?: boolean } = {}) => {
    const { forceFull = false } = opts
    setSyncing(true)
    setSyncError(null)
    setLastSyncMsg(null)
    setSyncProgress(null)

    try {
      // 1) Discover which platforms are configured for this hotel.
      const listRes = await fetch(`/api/integrations/reviews/sync?hotelId=${hotelId}`)
      const listBody = await safeParse(listRes)
      if (!listRes.ok) {
        setSyncError(listBody?.error || "Impossibile leggere le piattaforme configurate")
        return
      }
      const platforms: string[] = Array.isArray(listBody?.platforms) ? listBody.platforms : []
      if (platforms.length === 0) {
        setSyncError(
          "Nessuna piattaforma configurata. Vai in Impostazioni > Integrazioni e aggiungi almeno una sorgente (Google, Booking.com, TripAdvisor, Expedia, VRBO o Airbnb)."
        )
        return
      }

      // 2) Sync one platform at a time, so each call fits in the serverless budget.
      let totalSynced = 0
      let totalNew = 0
      const errors: string[] = []

      for (let i = 0; i < platforms.length; i++) {
        const platform = platforms[i]
        const label = PLATFORM_LABELS[platform] || platform
        const fullSuffix = forceFull ? " - SYNC COMPLETO" : ""
        setSyncProgress(`Sincronizzo ${label} (${i + 1}/${platforms.length})${fullSuffix}...`)

        try {
          const res = await fetch("/api/integrations/reviews/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hotelId, platform, forceFull }),
          })
          const body = await safeParse(res)
          if (!res.ok) {
            errors.push(`${label}: ${body?.error || "errore sconosciuto"}`)
          } else {
            totalSynced += body?.syncedCount ?? 0
            totalNew += body?.newReviews ?? 0
          }
        } catch (err) {
          errors.push(`${label}: ${err instanceof Error ? err.message : "errore di rete"}`)
        }
      }

      setSyncProgress(null)

      const fullPrefix = forceFull ? "[Sync completo] " : ""
      if (errors.length && totalSynced === 0) {
        setSyncError(fullPrefix + errors.join(" • "))
      } else {
        setLastSyncMsg(
          fullPrefix +
            `Sincronizzate ${totalSynced} recensioni` +
            (totalNew ? ` (${totalNew} nuove)` : "") +
            (errors.length ? ` • Errori: ${errors.join(" • ")}` : "")
        )
      }
      await fetchStats()
      await fetchDormant()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Errore sconosciuto")
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }, [hotelId, fetchStats, fetchDormant])

  const handleFullResync = useCallback(async () => {
    setShowFullResyncDialog(false)
    await runSync({ forceFull: true })
  }, [runSync])

  return (
    <div className="p-6 space-y-6 min-w-0 max-w-full">
      <div className="flex items-center justify-between gap-4 flex-wrap min-w-0">
        <div className="text-sm text-muted-foreground space-y-1">
          {stats?.total != null && (
            <div>
              <span className="font-medium text-foreground">{stats.total}</span>{" "}
              recensioni totali
              {stats.reputation?.reviews_180d != null && (
                <>
                  {" "}
                  &middot;{" "}
                  <span className="font-medium text-foreground">
                    {stats.reputation.reviews_180d}
                  </span>{" "}
                  negli ultimi 180 giorni
                </>
              )}
            </div>
          )}
          {stats?.last_sync_at && (
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="h-3 w-3" />
              <span>
                Ultima sincronizzazione:{" "}
                <span className="font-medium text-foreground">
                  {new Date(stats.last_sync_at).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {syncProgress && (
            <span className="text-xs text-muted-foreground">{syncProgress}</span>
          )}
          {!syncProgress && lastSyncMsg && (
            // Il messaggio "successo parziale" puo' contenere segmenti di
            // errore tecnico (Apify, ecc.). Sanifichiamo per il tenant.
            <span className="text-xs text-green-600">
              {isSuperAdmin ? lastSyncMsg : sanitizeSyncErrorForTenant(lastSyncMsg)}
            </span>
          )}
          <ReviewReplySettingsDialog hotelId={hotelId} />
          <ReviewsWidgetDialog hotelId={hotelId} stats={stats} />
          <Button
            onClick={() => runSync()}
            size="sm"
            variant="default"
            disabled={syncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizzo..." : "Sincronizza"}
          </Button>
          {isSuperAdmin && (
            <Button
              onClick={() => setShowFullResyncDialog(true)}
              size="sm"
              variant="outline"
              disabled={syncing}
              className="gap-2 border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900"
              title="Solo superadmin: simula la prima sincronizzazione e scarica fino a 500 recensioni per piattaforma."
            >
              <RotateCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sync di nuovo tutto
              <Badge variant="outline" className="ml-1 border-amber-400 bg-amber-100 text-amber-800 px-1 py-0 h-4 text-[10px] gap-0.5">
                <Shield className="h-2.5 w-2.5" />
                ADMIN
              </Badge>
            </Button>
          )}
        </div>
      </div>

      {/* Dialog di conferma per il superadmin "Sync di nuovo tutto" */}
      <AlertDialog open={showFullResyncDialog} onOpenChange={setShowFullResyncDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCw className="h-5 w-5 text-amber-600" />
              Sync completo recensioni
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-foreground">
                <p>
                  Stai per simulare una <strong>prima sincronizzazione</strong> per tutte le piattaforme configurate.
                  Verranno scaricate fino a <strong>500 recensioni per piattaforma</strong> (anziche le ~40 della sync incrementale).
                </p>
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
                  <strong>Nota:</strong> questa operazione consuma piu credit Apify rispetto a una sync normale.
                  Usala quando il primo sync ha fallito (es. timeout) e vuoi ripopolare la storia recensioni.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleFullResync()
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <RotateCw className="h-4 w-4 mr-2" />
              Avvia sync completo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {syncError && (
        // BUG FIX 13/05/2026: il banner "Sync error" mostrava agli end-user
        // hotel dettagli infrastrutturali (Apify, console.apify.com/billing,
        // usage limit). Ora il tenant vede SOLO un messaggio neutro per
        // piattaforma. Il super_admin continua a vedere il messaggio raw
        // (con un badge "ADMIN ONLY") cosi' puo' fare troubleshooting di
        // quota/billing senza dover aprire i log.
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {isSuperAdmin ? (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  Admin only - messaggio raw
                </div>
                <div>{syncError}</div>
              </div>
            ) : (
              sanitizeSyncErrorForTenant(syncError)
            )}
          </AlertDescription>
        </Alert>
      )}

      {dormantChannels.length > 0 && (
        // Banner morbido (amber, non destructive) per canali OTA che non
        // ricevono nuove recensioni da almeno 3 sync consecutive. Nessun
        // dettaglio tecnico esposto al tenant: solo invito a verificare l'URL.
        // Vedi /api/integrations/reviews/dormant-channels e
        // review_platform_schedules (cadenza adattiva).
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="space-y-2 text-sm">
              <div className="font-medium">
                {dormantChannels.length === 1
                  ? "Un canale recensioni non riceve aggiornamenti"
                  : `${dormantChannels.length} canali recensioni non ricevono aggiornamenti`}
              </div>
              <ul className="space-y-1">
                {dormantChannels.map((c) => (
                  <li key={c.platform} className="flex items-center gap-2">
                    <Badge variant="outline" className="border-amber-300 text-amber-900">
                      {PLATFORM_LABELS[c.platform] ?? c.platform}
                    </Badge>
                    <span className="text-amber-800">
                      Nessuna nuova recensione registrata di recente.
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-800/80">
                Verifica che l&apos;URL configurato in{" "}
                <span className="font-medium">Impostazioni &gt; Integrazioni recensioni</span>{" "}
                sia ancora corretto e pubblicamente accessibile. Se l&apos;URL e&apos; giusto, il
                canale verra&apos; riattivato in automatico alla prossima recensione trovata, oppure
                puoi cliccare <span className="font-medium">Sincronizza</span> per riprovare subito.
              </p>
            </div>
          </div>
        </div>
      )}

      <ReviewsKpi stats={stats} loading={loading} />

      <ReviewsChannelBreakdown stats={stats} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 min-w-0">
          <ReviewsTrendChart monthly={stats?.monthly} loading={loading} />
        </div>
        <div className="min-w-0">
          <ReviewsAiInsights hotelId={hotelId} />
        </div>
      </div>

      <ReviewsList hotelId={hotelId} platforms={stats?.platforms ?? []} />
    </div>
  )
}
