import { AlertCircle, CheckCircle2, Clock3, FileText, GitCommitVertical, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { InternalKnowledgeSyncDiagnostics } from "@/lib/ai/internal-knowledge-sync-status"

const PRODUCT_LABELS: Record<string, string> = {
  "hotel-accelerator": "Hotel Accelerator",
  "santaddeo-rms": "Santaddeo RMS",
  "hotel-profit-ai": "Hotel Profit AI",
  manubot: "ManuBot",
}

const STATUS_META = {
  pending: { label: "In attesa", icon: Clock3 },
  processing: { label: "Indicizzazione", icon: Loader2 },
  ready: { label: "Aggiornata", icon: CheckCircle2 },
  error: { label: "Errore", icon: AlertCircle },
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })
}

export function InternalKnowledgeSyncStatusCard({ diagnostics }: { diagnostics: InternalKnowledgeSyncDiagnostics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fonti interne 4BID</CardTitle>
        <CardDescription>
          Documentazione versionata dal repository: nessun URL pubblico viene indicizzato per queste basi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!diagnostics.schemaAvailable ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Sincronizzazione non disponibile</AlertTitle>
            <AlertDescription>Applica prima la migrazione della knowledge base interna.</AlertDescription>
          </Alert>
        ) : diagnostics.error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Diagnostica non disponibile</AlertTitle>
            <AlertDescription>{diagnostics.error}</AlertDescription>
          </Alert>
        ) : diagnostics.sources.length === 0 ? (
          <Alert>
            <Clock3 aria-hidden="true" />
            <AlertTitle>Nessuna fonte ancora ricevuta</AlertTitle>
            <AlertDescription>
              Configura i due segreti e avvia il workflow su main: la prima esecuzione creerà la base interna.
            </AlertDescription>
          </Alert>
        ) : (
          diagnostics.sources.map((source) => {
            const meta = STATUS_META[source.status]
            const Icon = meta.icon
            return (
              <section key={source.productKey} className="space-y-3 rounded-lg border p-4" aria-label={PRODUCT_LABELS[source.productKey]}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{PRODUCT_LABELS[source.productKey]}</p>
                    <p className="text-xs text-muted-foreground">{source.knowledgeBaseName}</p>
                  </div>
                  <Badge variant={source.status === "ready" ? "default" : "secondary"}>
                    <Icon className={source.status === "processing" ? "mr-1 h-3 w-3 animate-spin" : "mr-1 h-3 w-3"} aria-hidden="true" />
                    {meta.label}
                  </Badge>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Repository · revisione</dt>
                    <dd className="flex items-center gap-1 break-all"><GitCommitVertical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{source.repository} · {source.revision.slice(0, 12)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Indicizzazione</dt>
                    <dd>{source.chunkCount} frammenti · {formatDate(source.indexedAt)}</dd>
                  </div>
                </dl>
                <div>
                  <p className="text-xs text-muted-foreground">File sorgente autorizzati</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {source.sourcePaths.map((path) => <li key={path} className="flex gap-1 break-all"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{path}</li>)}
                  </ul>
                </div>
                {source.error ? <p className="text-sm text-destructive">{source.error}</p> : null}
              </section>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
