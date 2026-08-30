"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, BrainCircuit, Database, Mail, Phone, RefreshCw, Sparkles, UserRoundSearch } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface Recommendation {
  contactId: string
  contactName: string
  company: string | null
  score: number
  priority: "alta" | "media" | "bassa"
  action: "call" | "email" | "relationship" | "review"
  actionLabel: string
  reason: string
  signals: string[]
  channel: "telefono" | "email" | "relazione" | "verifica"
  canExecute: boolean
}

interface IntelligenceResponse {
  generatedAt: string
  summary: {
    analyzed: number
    highPriority: number
    actionable: number
    calls: number
    emails: number
    relationship: number
  }
  recommendations: Recommendation[]
  policy: {
    automaticSending: boolean
    humanApprovalRequired: boolean
    note: string
  }
}

function PriorityBadge({ priority }: { priority: Recommendation["priority"] }) {
  const className =
    priority === "alta"
      ? "bg-red-100 text-red-800"
      : priority === "media"
        ? "bg-ha-warning-soft text-ha-warning-soft-foreground"
        : "bg-muted text-muted-foreground"

  return <Badge className={className}>{priority === "alta" ? "Alta" : priority === "media" ? "Media" : "Bassa"}</Badge>
}

function ActionIcon({ action }: { action: Recommendation["action"] }) {
  if (action === "call") return <Phone className="h-4 w-4" aria-hidden />
  if (action === "email") return <Mail className="h-4 w-4" aria-hidden />
  if (action === "relationship") return <Sparkles className="h-4 w-4" aria-hidden />
  return <UserRoundSearch className="h-4 w-4" aria-hidden />
}

export default function SalesIntelligencePage() {
  const [data, setData] = useState<IntelligenceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/crm/sales-intelligence?limit=30", { cache: "no-store" })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Impossibile generare le priorità commerciali")
      setData(body)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : "Errore inatteso")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-ha-brand" aria-hidden />
            <h1 className="text-2xl font-bold text-foreground">Motore di Vendita Intelligente</h1>
          </div>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Trasforma i dati già presenti nel CRM in una lista operativa: chi contattare prima, perché e con quale azione consigliata.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="default">
            <Link href="/admin/crm/intelligence/apollo">
              <Database className="mr-2 h-4 w-4" aria-hidden />
              Cerca con Apollo
            </Link>
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Aggiorna priorità
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200">
          <CardContent className="flex items-start gap-3 pt-6 text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Non posso mostrare priorità affidabili.</p>
              <p className="text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Contatti analizzati</CardDescription>
                <CardTitle className="text-3xl">{data.summary.analyzed}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Priorità alta</CardDescription>
                <CardTitle className="text-3xl">{data.summary.highPriority}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Azioni suggerite</CardDescription>
                <CardTitle className="text-3xl">{data.summary.actionable}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Telefonate</CardDescription>
                <CardTitle className="text-3xl">{data.summary.calls}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Riattivazioni</CardDescription>
                <CardTitle className="text-3xl">{data.summary.relationship}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cosa fare adesso</CardTitle>
              <CardDescription>{data.policy.note}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recommendations.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                  Non ci sono ancora dati sufficienti per generare priorità commerciali.
                </div>
              ) : (
                data.recommendations.map((item, index) => (
                  <div
                    key={item.contactId}
                    className="flex flex-col gap-4 rounded-xl border bg-background p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                        <Link
                          href={`/admin/crm/contacts/${item.contactId}`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {item.contactName}
                        </Link>
                        {item.company && <span className="text-sm text-muted-foreground">· {item.company}</span>}
                        <PriorityBadge priority={item.priority} />
                        <Badge variant="outline">Punteggio {item.score}/100</Badge>
                      </div>

                      <div className="mt-2 flex items-center gap-2 font-medium text-foreground">
                        <ActionIcon action={item.action} />
                        {item.actionLabel}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>

                      {item.signals.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.signals.map((signal) => (
                            <Badge key={signal} variant="secondary" className="font-normal">
                              {signal}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button asChild variant={item.canExecute ? "default" : "outline"}>
                      <Link href={`/admin/crm/contacts/${item.contactId}`}>
                        {item.canExecute ? "Apri e procedi" : "Controlla profilo"}
                      </Link>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Le priorità sono calcolate esclusivamente sui dati del tenant attivo. In questa prima versione il sistema non invia email,
            messaggi o chiamate in autonomia: ogni azione resta sotto controllo umano.
          </p>
        </>
      )}

      {loading && !data && (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" aria-hidden />
            Sto calcolando le priorità sui contatti del CRM…
          </CardContent>
        </Card>
      )}
    </div>
  )
}
