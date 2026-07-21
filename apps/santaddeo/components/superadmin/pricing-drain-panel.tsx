"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Loader2, Mail, RefreshCw, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

interface HotelRow {
  hotelId: string
  hotelName: string
  mode: string
  notifyEmails: string[]
  lastNotificationAt: string | null
  lastPushAt: string | null
  pendingReal: number
  pendingGreenfield: number
}

interface DrainResult {
  hotelId: string
  mode: string
  result: any
  error?: string
}

export function PricingDrainPanel({ hotels }: { hotels: HotelRow[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [resetDebounce, setResetDebounce] = useState(false)
  const [results, setResults] = useState<DrainResult[]>([])

  function fmtAge(iso: string | null) {
    if (!iso) return "mai"
    const ms = Date.now() - new Date(iso).getTime()
    const h = Math.floor(ms / 3_600_000)
    const m = Math.floor((ms % 3_600_000) / 60_000)
    if (h > 24) return `${Math.floor(h / 24)}g ${h % 24}h fa`
    if (h > 0) return `${h}h ${m}m fa`
    return `${m}m fa`
  }

  async function drainOne(hotelId: string, label: string) {
    setBusy(hotelId)
    try {
      const r = await fetch("/api/superadmin/pricing/drain-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, resetDebounce }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`)
      setResults(data.results ?? [])
      toast.success(`Drain ${label}: ${data.results?.length ?? 0} hotel processati`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore drain")
    } finally {
      setBusy(null)
    }
  }

  async function drainAll() {
    setBusy("ALL")
    try {
      const r = await fetch("/api/superadmin/pricing/drain-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetDebounce }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`)
      setResults(data.results ?? [])
      toast.success(`Drain TUTTI: ${data.results?.length ?? 0} hotel processati`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore drain")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Drain manuale email/push pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              Ogni call drena fino a 5.000 cambi per hotel notify (1 email
              per hotel) o 1.000 per autopilot (push al PMS + email di conferma).
              Il debounce 60s impedisce il doppio invio se il cron sta girando
              in parallelo.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="reset-debounce"
              checked={resetDebounce}
              onCheckedChange={(v) => setResetDebounce(v === true)}
            />
            <Label htmlFor="reset-debounce" className="text-sm">
              Forza invio (resetta debounce a -5min, bypassa il check 60s)
            </Label>
          </div>

          <div className="flex gap-2">
            <Button onClick={drainAll} disabled={busy !== null}>
              {busy === "ALL" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Drena tutti gli hotel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hotel con autopilot attivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">Hotel</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2">Email destinatari</th>
                  <th className="p-2">Ultima email</th>
                  <th className="p-2">Ultimo push</th>
                  <th className="p-2 text-right">Pending reali</th>
                  <th className="p-2 text-right">Greenfield</th>
                  <th className="p-2 text-right">Azione</th>
                </tr>
              </thead>
              <tbody>
                {hotels.map((h) => {
                  const danger = h.pendingReal > 1000
                  return (
                    <tr key={h.hotelId} className="border-t">
                      <td className="p-2 font-medium">{h.hotelName}</td>
                      <td className="p-2">
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">{h.mode}</span>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {h.notifyEmails?.length ? h.notifyEmails.join(", ") : "(nessuna)"}
                      </td>
                      <td className="p-2 text-xs">{fmtAge(h.lastNotificationAt)}</td>
                      <td className="p-2 text-xs">{fmtAge(h.lastPushAt)}</td>
                      <td
                        className={`p-2 text-right font-mono ${
                          danger ? "text-red-600 font-semibold" : ""
                        }`}
                      >
                        {h.pendingReal.toLocaleString("it-IT")}
                      </td>
                      <td className="p-2 text-right font-mono text-muted-foreground">
                        {h.pendingGreenfield.toLocaleString("it-IT")}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy !== null}
                          onClick={() => drainOne(h.hotelId, h.hotelName)}
                        >
                          {busy === h.hotelId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Drena"
                          )}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Risultato ultima esecuzione</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded bg-muted/30 p-3 text-xs">
              {JSON.stringify(results, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
