"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface Hotel {
  id: string
  name: string
  pms_integrations?: Array<{ pms_name?: string | null; is_active?: boolean | null }>
}

interface RangeStatus {
  hotelName: string | null
  pms: { pms_name?: string; integration_mode?: string; is_active?: boolean } | null
  config: { mode?: string; last_push_at?: string | null; last_full_sync_at?: string | null } | null
  gridCount: number
  sentCount: number
  diff: number
}

interface PushResult {
  success: boolean
  method?: string
  pushed?: number
  totalInGrid?: number
  errors?: string[]
  range?: { from: string; to: string }
  message?: string
}

function todayStr() {
  return new Date().toISOString().split("T")[0]
}
function plusOneYearStr() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split("T")[0]
}

export function PushPricesTool() {
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [hotelId, setHotelId] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>(todayStr())
  const [dateTo, setDateTo] = useState<string>(plusOneYearStr())
  const [status, setStatus] = useState<RangeStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [result, setResult] = useState<PushResult | null>(null)

  // Load hotels list
  useEffect(() => {
    fetch("/api/superadmin/hotels-list")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.hotels) ? data.hotels : []
        setHotels(list)
      })
      .catch(() => toast.error("Errore caricamento hotel"))
  }, [])

  // Refresh stato range
  const refreshStatus = useCallback(async () => {
    if (!hotelId || !dateFrom || !dateTo) return
    setLoadingStatus(true)
    try {
      const res = await fetch(
        `/api/superadmin/push-prices-range?hotelId=${hotelId}&dateFrom=${dateFrom}&dateTo=${dateTo}`,
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || "Errore caricamento stato")
        setStatus(null)
        return
      }
      const data = await res.json()
      setStatus(data)
    } catch {
      toast.error("Errore di rete")
      setStatus(null)
    } finally {
      setLoadingStatus(false)
    }
  }, [hotelId, dateFrom, dateTo])

  // Auto-refresh when params change
  useEffect(() => {
    if (hotelId && dateFrom && dateTo) {
      const t = setTimeout(refreshStatus, 200)
      return () => clearTimeout(t)
    }
  }, [hotelId, dateFrom, dateTo, refreshStatus])

  const runPush = useCallback(async () => {
    if (!hotelId) return
    if (!confirm(`Confermi l'invio di TUTTI i prezzi al PMS per il range ${dateFrom} -> ${dateTo}?\n\nQuesto bypassa la dedup e forza il push completo. Operazione irreversibile.`)) return

    setPushing(true)
    setResult(null)
    try {
      const res = await fetch("/api/superadmin/push-prices-range", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, dateFrom, dateTo }),
      })
      const data = await res.json()
      setResult(data)
      if (data.success) {
        toast.success(`Inviati ${data.pushed} prezzi al PMS (${data.method})`)
      } else {
        toast.error(data.error || data.message || "Errore push")
      }
      refreshStatus()
    } catch (err) {
      toast.error("Errore di rete durante il push")
    } finally {
      setPushing(false)
    }
  }, [hotelId, dateFrom, dateTo, refreshStatus])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Push prezzi al PMS</CardTitle>
          <CardDescription>
            Strumento di recovery per superadmin. Forza l&apos;invio al PMS di tutti i prezzi presenti
            in <code className="text-xs bg-muted px-1 py-0.5 rounded">pricing_grid</code> per il range selezionato,
            bypassando la dedup di <code className="text-xs bg-muted px-1 py-0.5 rounded">last_sent_prices</code>.
            Default: oggi - +1 anno.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="hotel-select">Hotel</Label>
              <Select value={hotelId} onValueChange={setHotelId}>
                <SelectTrigger id="hotel-select">
                  <SelectValue placeholder="Seleziona hotel" />
                </SelectTrigger>
                <SelectContent>
                  {hotels.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date-from">Da</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="date-to">A</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshStatus}
              disabled={!hotelId || loadingStatus}
            >
              {loadingStatus ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Aggiorna stato
            </Button>
            <Button
              onClick={runPush}
              disabled={!hotelId || pushing || !status || status.gridCount === 0}
            >
              {pushing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {pushing ? "Invio in corso..." : "Invia tutti al PMS"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {status && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {status.hotelName || "Hotel"}{" "}
              {status.pms?.pms_name && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {status.pms.pms_name}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Stato del range {dateFrom} - {dateTo}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">In pricing_grid</div>
                <div className="text-2xl font-semibold">{status.gridCount.toLocaleString("it-IT")}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Gia&apos; inviati</div>
                <div className="text-2xl font-semibold">{status.sentCount.toLocaleString("it-IT")}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Differenza</div>
                <div
                  className={`text-2xl font-semibold ${
                    status.diff > 0 ? "text-amber-600" : status.diff < 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {status.diff > 0 ? "+" : ""}
                  {status.diff.toLocaleString("it-IT")}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Ultimo push</div>
                <div className="text-sm font-medium">
                  {status.config?.last_push_at
                    ? new Date(status.config.last_push_at).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Mai"}
                </div>
              </div>
            </div>

            {status.config?.mode && (
              <div className="mt-4 text-xs text-muted-foreground">
                Modalita&apos; Autopilot:{" "}
                <Badge variant={status.config.mode === "autopilot" ? "default" : "secondary"} className="text-xs">
                  {status.config.mode}
                </Badge>
              </div>
            )}

            {status.diff > 0 && (
              <Alert className="mt-4 border-amber-500/50 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Disallineamento rilevato</AlertTitle>
                <AlertDescription className="text-amber-700">
                  Ci sono {status.diff.toLocaleString("it-IT")} prezzi in pricing_grid che non risultano inviati.
                  Premi &quot;Invia tutti al PMS&quot; per allineare.
                </AlertDescription>
              </Alert>
            )}

            {status.diff === 0 && status.gridCount > 0 && (
              <Alert className="mt-4 border-emerald-500/50 bg-emerald-50">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertTitle className="text-emerald-800">Allineato</AlertTitle>
                <AlertDescription className="text-emerald-700">
                  pricing_grid e last_sent_prices coincidono per il range selezionato.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {result.success ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              Risultato push
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              Metodo: <Badge variant="outline">{result.method || "n/d"}</Badge>
            </div>
            <div>
              Inviati: <strong>{result.pushed ?? 0}</strong> /{" "}
              <strong>{result.totalInGrid ?? 0}</strong> presenti in grid
            </div>
            {result.range && (
              <div>
                Range: {result.range.from} -&gt; {result.range.to}
              </div>
            )}
            {result.errors && result.errors.length > 0 && (
              <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warning / Errori</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 space-y-0.5 text-xs">
                    {result.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {result.errors.length > 10 && <li>...e altri {result.errors.length - 10}</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {result.message && !result.success && (
              <div className="text-muted-foreground">{result.message}</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
