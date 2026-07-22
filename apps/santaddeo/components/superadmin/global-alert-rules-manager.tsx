"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Plus, Trash2 } from "lucide-react"

interface AlertRule {
  id: string
  name: string
  metric: string
  operator: string
  threshold: number
  severity: string
  is_active: boolean
}

export function GlobalAlertRulesManager({ initialRules }: { initialRules: AlertRule[] }) {
  const [rules, setRules] = useState(initialRules)
  const [isCreating, setIsCreating] = useState(false)
  const [newRule, setNewRule] = useState({
    name: "",
    metric: "occupancy_rate",
    operator: "less_than",
    threshold: 70,
    severity: "orange",
    is_active: true,
  })

  const handleCreateRule = async () => {
    try {
      const response = await fetch("/api/superadmin/alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRule),
      })

      if (response.ok) {
        const { rule } = await response.json()
        setRules([...rules, rule])
        setIsCreating(false)
        setNewRule({
          name: "",
          metric: "occupancy_rate",
          operator: "less_than",
          threshold: 70,
          severity: "orange",
          is_active: true,
        })
      }
    } catch (error) {
      console.error("[v0] Error creating rule:", error)
    }
  }

  const handleToggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/superadmin/alert-rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      })

      if (response.ok) {
        setRules(rules.map((r) => (r.id === ruleId ? { ...r, is_active: isActive } : r)))
      }
    } catch (error) {
      console.error("[v0] Error toggling rule:", error)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questa regola?")) return

    try {
      const response = await fetch(`/api/superadmin/alert-rules/${ruleId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setRules(rules.filter((r) => r.id !== ruleId))
      }
    } catch (error) {
      console.error("[v0] Error deleting rule:", error)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "green":
        return "bg-green-600"
      case "orange":
        return "bg-orange-600"
      case "red":
        return "bg-red-600"
      default:
        return "bg-gray-600"
    }
  }

  const getMetricLabel = (metric: string) => {
    const labels: Record<string, string> = {
      occupancy_rate: "Tasso di Occupazione",
      revpar: "RevPAR",
      revpor: "RevPOR",
      cancellation_rate: "Tasso di Cancellazione",
      revenue: "Revenue",
    }
    return labels[metric] || metric
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Regole Alert Globali</CardTitle>
              <CardDescription>
                Queste regole si applicano di default a tutte le strutture. Ogni hotel può personalizzarle.
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nuova Regola
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isCreating && (
            <Card className="mb-6 border-2 border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg">Crea Nuova Regola</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome Regola</Label>
                    <Input
                      placeholder="es: Occupazione Bassa"
                      value={newRule.name}
                      onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Metrica</Label>
                    <Select value={newRule.metric} onValueChange={(v) => setNewRule({ ...newRule, metric: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="occupancy_rate">Tasso di Occupazione</SelectItem>
                        <SelectItem value="revpar">RevPAR</SelectItem>
                        <SelectItem value="revpor">RevPOR</SelectItem>
                        <SelectItem value="cancellation_rate">Tasso di Cancellazione</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Operatore</Label>
                    <Select value={newRule.operator} onValueChange={(v) => setNewRule({ ...newRule, operator: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="less_than">Minore di</SelectItem>
                        <SelectItem value="greater_than">Maggiore di</SelectItem>
                        <SelectItem value="equals">Uguale a</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Soglia</Label>
                    <Input
                      type="number"
                      value={newRule.threshold}
                      onChange={(e) => setNewRule({ ...newRule, threshold: Number.parseFloat(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Severità</Label>
                    <Select value={newRule.severity} onValueChange={(v) => setNewRule({ ...newRule, severity: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="green">Verde (Info)</SelectItem>
                        <SelectItem value="orange">Arancione (Warning)</SelectItem>
                        <SelectItem value="red">Rosso (Critico)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Stato</Label>
                    <div className="flex items-center gap-2 h-10">
                      <Switch
                        checked={newRule.is_active}
                        onCheckedChange={(checked) => setNewRule({ ...newRule, is_active: checked })}
                      />
                      <span className="text-sm">{newRule.is_active ? "Attiva" : "Disattivata"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleCreateRule}>Crea Regola</Button>
                  <Button variant="outline" onClick={() => setIsCreating(false)}>
                    Annulla
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4 flex-1">
                  <Badge className={`${getSeverityColor(rule.severity)} text-white`}>{rule.severity.toUpperCase()}</Badge>
                  <div className="flex-1">
                    <div className="font-semibold">{rule.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {getMetricLabel(rule.metric)}{" "}
                      {rule.operator === "less_than" ? "<" : rule.operator === "greater_than" ? ">" : "="}{" "}
                      {rule.threshold}
                      {rule.metric.includes("rate") ? "%" : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={rule.is_active} onCheckedChange={(checked) => handleToggleRule(rule.id, checked)} />
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteRule(rule.id)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}

            {rules.length === 0 && !isCreating && (
              <div className="text-center py-12 text-muted-foreground">
                Nessuna regola configurata. Crea la prima regola per iniziare.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
