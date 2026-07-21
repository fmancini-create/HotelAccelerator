"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Save, Loader2, AlertCircle, CheckCircle2, Lock, Zap, DollarSign, ArrowDown, ArrowUp } from "lucide-react"
import Link from "next/link"

interface RateLimit {
  room_type_id: string
  room_type_name: string
  room_type_code: string
  total_rooms: number
  bottom_rate: number
  rack_rate: number
  updated_at: string | null
}

export default function RateLimitsSettingsPage() {
  const [rateLimits, setRateLimits] = useState<RateLimit[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAccelerator, setIsAccelerator] = useState(false)

  useEffect(() => {
    loadRateLimits()
  }, [])

  async function loadRateLimits() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/settings/rate-limits")
      if (!res.ok) throw new Error(`Errore ${res.status}`)
      const data = await res.json()
      setRateLimits(data.rateLimits || [])
      setIsAccelerator(data.isAccelerator ?? false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function updateRate(index: number, field: "bottom_rate" | "rack_rate", value: number) {
    if (!isAccelerator) return
    setRateLimits((prev) =>
      prev.map((rl, i) => (i === index ? { ...rl, [field]: value } : rl))
    )
    setHasChanges(true)
    setSaveSuccess(false)
  }

  const handleSave = useCallback(async () => {
    if (!isAccelerator) return
    setSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch("/api/settings/rate-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateLimits: rateLimits.map((rl) => ({
            room_type_id: rl.room_type_id,
            bottom_rate: rl.bottom_rate,
            rack_rate: rl.rack_rate,
          })),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Errore salvataggio: ${res.status}`)
      }
      setHasChanges(false)
      setSaveSuccess(true)
      await loadRateLimits()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [rateLimits, isAccelerator])

  // Validation
  const hasInvalidRange = rateLimits.some((rl) => rl.rack_rate < rl.bottom_rate)
  const hasNegative = rateLimits.some((rl) => rl.bottom_rate < 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Limiti Tariffari per Tipologia
            </CardTitle>
            <CardDescription className="mt-1">
              Configura la <strong>Bottom Rate</strong> (tariffa minima, deve essere uguale o superiore al costo variabile
              medio a camera) e la <strong>Rack Rate</strong> (tariffa massima a cui vendere la tipologia).
              L&apos;algoritmo di pricing utilizzer&agrave; questi limiti per non suggerire mai prezzi al di fuori di
              questo intervallo.
            </CardDescription>
          </div>
          {isAccelerator && hasChanges && (
            <Button
              onClick={handleSave}
              disabled={saving || hasInvalidRange || hasNegative}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Salvataggio..." : "Salva limiti"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Read-only banner if not accelerator */}
        {!loading && !isAccelerator && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <Lock className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                Modalita sola lettura
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Attiva Accelerator per modificare i limiti tariffari e abilitare il pricing dinamico.
              </p>
            </div>
            <Link href="/accelerator/activate">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100"
              >
                <Zap className="h-3.5 w-3.5" />
                Attiva Accelerator
              </Button>
            </Link>
          </div>
        )}

        {/* Status messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {saveSuccess && !hasChanges && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Limiti tariffari salvati correttamente.
          </div>
        )}

        {/* Validation warnings */}
        {hasInvalidRange && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-700 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            La Rack Rate deve essere maggiore o uguale alla Bottom Rate per ogni tipologia.
          </div>
        )}
        {hasNegative && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            La Bottom Rate non puo essere negativa.
          </div>
        )}

        {/* Info box */}
        <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/50">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm text-blue-800">
              <p className="font-medium">Come funzionano i limiti tariffari</p>
              <ul className="list-disc pl-4 space-y-0.5 text-xs text-blue-700">
                <li>
                  <strong>Bottom Rate</strong>: tariffa minima di vendita. Deve corrispondere almeno al costo variabile
                  medio a camera della tipologia. L&apos;algoritmo non suggerirera mai un prezzo inferiore.
                </li>
                <li>
                  <strong>Rack Rate</strong>: tariffa massima a cui si vuole vendere la tipologia. L&apos;algoritmo non
                  suggerirera mai un prezzo superiore.
                </li>
                <li>
                  L&apos;intervallo Bottom-Rack definisce il &quot;corridoio tariffario&quot; entro cui opera
                  l&apos;algoritmo di pricing dinamico.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento tipologie...
          </div>
        ) : rateLimits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <DollarSign className="h-8 w-8 opacity-40" />
            <p className="text-sm">Nessuna tipologia di camera trovata.</p>
            <p className="text-xs">Assicurati di avere le tipologie configurate nelle impostazioni della struttura.</p>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-4 py-2 rounded-lg bg-muted/50 text-xs font-medium text-muted-foreground">
              <div>Tipologia Camera</div>
              <div className="text-center">Bottom Rate (EUR)</div>
              <div className="text-center">Rack Rate (EUR)</div>
              <div className="text-center">Range</div>
            </div>

            {/* Rate limit rows */}
            <div className="space-y-3">
              {rateLimits.map((rl, index) => {
                const isInvalid = rl.rack_rate < rl.bottom_rate
                const isNeg = rl.bottom_rate < 0
                const range = rl.rack_rate - rl.bottom_rate

                return (
                  <div
                    key={rl.room_type_id}
                    className={`border rounded-lg p-4 transition-colors ${
                      isInvalid || isNeg
                        ? "border-destructive/50 bg-destructive/5"
                        : isAccelerator
                          ? "border-border bg-white hover:bg-muted/20"
                          : "border-border bg-muted/10 opacity-80"
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-4 items-center">
                      {/* Room type info */}
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-sm shrink-0">
                          {rl.room_type_code?.substring(0, 3) || "CAM"}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{rl.room_type_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {rl.total_rooms} {rl.total_rooms === 1 ? "camera" : "camere"}
                            {rl.room_type_code ? ` - ${rl.room_type_code}` : ""}
                          </p>
                        </div>
                      </div>

                      {/* Bottom Rate */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground md:hidden">
                          Bottom Rate (EUR)
                        </Label>
                        <div className="flex items-center gap-1">
                          <ArrowDown className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            value={rl.bottom_rate}
                            onChange={(e) =>
                              updateRate(index, "bottom_rate", parseFloat(e.target.value) || 0)
                            }
                            className="h-9 text-center"
                            disabled={!isAccelerator}
                          />
                          <span className="text-xs text-muted-foreground shrink-0">EUR</span>
                        </div>
                      </div>

                      {/* Rack Rate */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground md:hidden">
                          Rack Rate (EUR)
                        </Label>
                        <div className="flex items-center gap-1">
                          <ArrowUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            value={rl.rack_rate}
                            onChange={(e) =>
                              updateRate(index, "rack_rate", parseFloat(e.target.value) || 0)
                            }
                            className="h-9 text-center"
                            disabled={!isAccelerator}
                          />
                          <span className="text-xs text-muted-foreground shrink-0">EUR</span>
                        </div>
                      </div>

                      {/* Range indicator */}
                      <div className="flex flex-col items-center gap-1">
                        <Label className="text-xs text-muted-foreground md:hidden">
                          Range
                        </Label>
                        {isInvalid ? (
                          <Badge variant="destructive" className="text-xs">
                            Non valido
                          </Badge>
                        ) : (
                          <div className="text-center">
                            <Badge variant="secondary" className="text-xs font-mono">
                              {range.toFixed(0)} EUR
                            </Badge>
                            <div className="mt-1 h-1.5 w-full max-w-[80px] mx-auto rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary/60"
                                style={{
                                  width: `${rl.rack_rate > 0 ? Math.min(100, (rl.bottom_rate / rl.rack_rate) * 100) : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
