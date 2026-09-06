"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Mail,
  Phone,
  RefreshCw,
  Sparkles,
  UserRoundSearch,
} from "lucide-react"
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

  const label = priority === "alta" ? "Da fare prima" : priority === "media" ? "Da fare dopo" : "Bassa priorità"

  return <Badge className={className}>{label}</Badge>
}

function ActionIcon({ action }: { action: Recommendation["action"] }) {
  if (action === "call") return <Phone className="h-4 w-4" aria-hidden />
  if (action === "email") return <Mail className="h-4 w-4" aria-hidden />
  if (action === "relationship") return <Sparkles className="h-4 w-4" aria-hidden />
  return <UserRoundSearch className="h-4 w-4" aria-hidden />
}

function MetricCard({ label, value, help }: { label: string; value: number; help: string }) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>
      </CardHeader>
    </Card>
  )
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
            <h1 className="text-2xl font-bold text-foreground">Vendite AI</h1>
          </div>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            L&apos;AI legge i contatti già presenti nel CRM, li mette in ordine e ti suggerisce chi contattare oggi e cosa fare.
            Non vende al posto tuo: la decisione finale resta sempre tua.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Ricalcola i consigli
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-ha-brand/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-ha-brand" aria-hidden />
              <CardTitle className="text-lg">Hai già dei contatti nel CRM?</CardTitle>
            </div>
            <CardDescription className="text-sm leading-relaxed">
              Questa pagina analizza i contatti esistenti e crea una lista semplice: chi chiamare o scrivere prima, con il motivo.
              Parti dalla prima persona nella lista qui sotto.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <UserRoundSearch className="h-5 w-5 text-ha-brand" aria-hidden />
                <CardTitle className="text-lg">Vuoi trovare nuovi clienti?</CardTitle>
              </div>
              <CardDescription className="max-w-xl text-sm leading-relaxed">
                Usa Scout per cercare nuove aziende e nuovi referenti. Scout è separato dai clienti già nel CRM: un prospect entra nel CRM solo quando decidi tu.
              </CardDescription>
            </div>
            <Button asChild className="shrink-0">
              <Link href="/admin/crm/intelligence/scout">Trova nuovi prospect</Link>
            </Button>
          </CardHeader>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="grid gap-4 py-5 md:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-foreground">1. Guarda i primi nomi</p>
            <p className="mt-1 text-sm text-muted-foreground">L&apos;ordine indica da chi conviene partire.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">2. Leggi il perché</p>
            <p className="mt-1 text-sm text-muted-foreground">L&apos;AI ti mostra i segnali usati per dare la priorità.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">3. Apri il contatto e agisci</p>
            <p className="mt-1 text-sm text-muted-foreground">Telefonata, email o verifica: sei tu a confermare l&apos;azione.</p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200">
          <CardContent className="flex items-start gap-3 pt-6 text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Non riesco a preparare una lista affidabile.</p>
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()} disabled={loading}>
                Riprova
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <MetricCard label="Contatti esaminati" value={data.summary.analyzed} help="Quanti contatti del CRM sono stati valutati." />
            <MetricCard label="Da contattare prima" value={data.summary.highPriority} help="Contatti che meritano attenzione per primi." />
            <MetricCard label="Puoi agire ora" value={data.summary.actionable} help="Contatti con una prossima azione già suggerita." />
            <MetricCard label="Telefonate consigliate" value={data.summary.calls} help="Persone per cui l'AI suggerisce una chiamata." />
            <MetricCard label="Clienti da riattivare" value={data.summary.relationship} help="Rapporti che può valere la pena riaprire." />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Chi contattare adesso</CardTitle>
              <CardDescription className="max-w-3xl leading-relaxed">
                Parti dal numero 1 e scendi. Il punteggio serve solo a ordinare le priorità: non è una percentuale di probabilità di vendita.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recommendations.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="font-medium text-foreground">Non ho ancora abbastanza informazioni per consigliarti chi contattare.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Aggiungi o aggiorna i contatti del CRM, poi torna qui e premi “Ricalcola i consigli”.
                  </p>
                </div>
              ) : (
                data.recommendations.map((item, index) => (
                  <div
                    key={item.contactId}
                    className="flex flex-col gap-4 rounded-xl border bg-background p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">#{index + 1}</Badge>
                        <Link href={`/admin/crm/contacts/${item.contactId}`} className="font-semibold text-foreground hover:underline">
                          {item.contactName}
                        </Link>
                        {item.company && <span className="text-sm text-muted-foreground">· {item.company}</span>}
                        <PriorityBadge priority={item.priority} />
                        <Badge variant="outline">Priorità AI {item.score}/100</Badge>
                      </div>

                      <div className="mt-3 flex items-start gap-2">
                        <div className="mt-0.5 text-foreground"><ActionIcon action={item.action} /></div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Azione consigliata</p>
                          <p className="font-medium text-foreground">{item.actionLabel}</p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Perché</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                      </div>

                      {item.signals.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cosa ha visto l&apos;AI</p>
                          <div className="flex flex-wrap gap-2">
                            {item.signals.map((signal) => (
                              <Badge key={signal} variant="secondary" className="font-normal">{signal}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Button asChild variant={item.canExecute ? "default" : "outline"} className="shrink-0">
                      <Link href={`/admin/crm/contacts/${item.contactId}`}>
                        {item.canExecute ? "Apri contatto e procedi" : "Apri e controlla i dati"}
                      </Link>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-ha-success/30 bg-ha-success-soft/40">
            <CardContent className="flex items-start gap-3 py-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ha-success" aria-hidden />
              <div>
                <p className="font-medium text-foreground">Sei sempre tu a decidere.</p>
                <p className="text-sm text-muted-foreground">
                  Vendite AI non invia email, messaggi o chiamate da sola. Ti propone la prossima mossa e aspetta la tua conferma.
                  {data.policy.note ? ` ${data.policy.note}` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {loading && !data && (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" aria-hidden />
            <div>
              <p className="font-medium text-foreground">Un attimo: sto preparando i consigli di vendita.</p>
              <p className="text-sm">Sto leggendo i contatti del CRM e ordinando le priorità.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
