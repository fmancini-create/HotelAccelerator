"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Lock, ArrowUpCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"

interface KpiConfig {
  id: string
  kpi_key: string
  label: string
  description: string | null
  is_enabled: boolean
  display_order: number
}

interface KpiTogglesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hotelId: string
  hotelName: string
  readOnly?: boolean
}

export function KpiTogglesDialog({
  open,
  onOpenChange,
  hotelId,
  hotelName,
  readOnly = false,
}: KpiTogglesDialogProps) {
  const [configs, setConfigs] = useState<KpiConfig[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState<string | null>(null)
  const [upgradeRequested, setUpgradeRequested] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState("")
  const [sendingUpgrade, setSendingUpgrade] = useState(false)

  useEffect(() => {
    if (!open) return
    setIsLoading(true)
    fetch(`/api/superadmin/kpi-configs?hotel_id=${hotelId}`)
      .then((res) => res.json())
      .then((data) => setConfigs(data.configs || []))
      .catch(() => toast.error("Errore nel caricamento dei KPI"))
      .finally(() => setIsLoading(false))
  }, [open, hotelId])

  const handleToggle = async (kpiKey: string, enabled: boolean) => {
    setIsSaving(kpiKey)
    try {
      const res = await fetch("/api/superadmin/kpi-configs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, kpi_key: kpiKey, is_enabled: enabled }),
      })
      if (!res.ok) throw new Error()
      setConfigs((prev) =>
        prev.map((c) => (c.kpi_key === kpiKey ? { ...c, is_enabled: enabled } : c))
      )
    } catch {
      toast.error("Errore nel salvataggio")
    } finally {
      setIsSaving(null)
    }
  }

  const handleUpgradeRequest = async () => {
    setSendingUpgrade(true)
    try {
      const res = await fetch("/api/upgrade-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          requestType: "kpi_upgrade",
          message: upgradeMessage.trim() || "Richiesta attivazione KPI aggiuntivi",
        }),
      })
      if (!res.ok) throw new Error()
      setUpgradeRequested(true)
      toast.success("Richiesta di upgrade inviata!")
    } catch {
      toast.error("Errore nell'invio della richiesta")
    } finally {
      setSendingUpgrade(false)
    }
  }

  const disabledKpis = configs.filter((c) => !c.is_enabled)
  const hasDisabledKpis = readOnly && disabledKpis.length > 0

  const overviewKpis = configs.filter((c) => c.kpi_key.startsWith("overview_") || !c.kpi_key.startsWith("metrics_"))
  const metricsKpis = configs.filter((c) => c.kpi_key.startsWith("metrics_"))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Visibilita KPI - {hotelName}</DialogTitle>
          <DialogDescription>
            Abilita o disabilita i KPI visibili nella dashboard di questa struttura.
          </DialogDescription>
        </DialogHeader>

        {readOnly && !isLoading && (
          <Alert className="border-amber-200 bg-amber-50">
            <Lock className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              La configurazione dei KPI e in sola lettura. Gli indicatori disponibili dipendono dal tuo piano di abbonamento.
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {overviewKpis.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Overview Dashboard
                </h4>
                <div className="space-y-3">
                  {overviewKpis
                    .sort((a, b) => a.display_order - b.display_order)
                    .map((kpi) => (
                    <div key={kpi.kpi_key} className={`flex items-center justify-between py-1.5 px-2 rounded-md ${readOnly && !kpi.is_enabled ? "opacity-50" : "hover:bg-muted/50"}`}>
                      <div className="flex-1 mr-4">
                        <Label htmlFor={kpi.kpi_key} className={`font-medium ${readOnly ? "cursor-default" : "cursor-pointer"}`}>
                          {kpi.label}
                          {readOnly && !kpi.is_enabled && (
                            <span className="ml-2 text-xs text-amber-600 font-normal">(non incluso nel piano)</span>
                          )}
                        </Label>
                        {kpi.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{kpi.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isSaving === kpi.kpi_key && <Loader2 className="h-3 w-3 animate-spin" />}
                        <Switch
                          id={kpi.kpi_key}
                          checked={kpi.is_enabled}
                          onCheckedChange={(checked) => handleToggle(kpi.kpi_key, checked)}
                          disabled={readOnly || isSaving === kpi.kpi_key}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {metricsKpis.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Sezione Metriche
                </h4>
                <div className="space-y-3">
                  {metricsKpis
                    .sort((a, b) => a.display_order - b.display_order)
                    .map((kpi) => (
                    <div key={kpi.kpi_key} className={`flex items-center justify-between py-1.5 px-2 rounded-md ${readOnly && !kpi.is_enabled ? "opacity-50" : "hover:bg-muted/50"}`}>
                      <div className="flex-1 mr-4">
                        <Label htmlFor={kpi.kpi_key} className={`font-medium ${readOnly ? "cursor-default" : "cursor-pointer"}`}>
                          {kpi.label}
                          {readOnly && !kpi.is_enabled && (
                            <span className="ml-2 text-xs text-amber-600 font-normal">(non incluso nel piano)</span>
                          )}
                        </Label>
                        {kpi.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{kpi.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isSaving === kpi.kpi_key && <Loader2 className="h-3 w-3 animate-spin" />}
                        <Switch
                          id={kpi.kpi_key}
                          checked={kpi.is_enabled}
                          onCheckedChange={(checked) => handleToggle(kpi.kpi_key, checked)}
                          disabled={readOnly || isSaving === kpi.kpi_key}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upgrade CTA for non-superadmin when some KPIs are disabled */}
            {hasDisabledKpis && (
              <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-4 space-y-3">
                {upgradeRequested ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                    <p className="font-medium text-green-800">Richiesta inviata con successo!</p>
                    <p className="text-xs text-muted-foreground text-center">
                      Il team SANTADDEO ti contattera per attivare gli indicatori aggiuntivi.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <ArrowUpCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-900">
                          Vuoi attivare gli altri indicatori?
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Ci sono {disabledKpis.length} KPI non inclusi nel tuo piano attuale. Richiedi l{"'"}upgrade per sbloccarli.
                        </p>
                      </div>
                    </div>
                    <Textarea
                      value={upgradeMessage}
                      onChange={(e) => setUpgradeMessage(e.target.value)}
                      placeholder="Note aggiuntive (opzionale)..."
                      rows={2}
                      className="text-sm"
                    />
                    <Button
                      type="button"
                      onClick={handleUpgradeRequest}
                      disabled={sendingUpgrade}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {sendingUpgrade ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Invio...
                        </>
                      ) : (
                        <>
                          <ArrowUpCircle className="mr-2 h-4 w-4" />
                          Chiedi l{"'"}Upgrade
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
