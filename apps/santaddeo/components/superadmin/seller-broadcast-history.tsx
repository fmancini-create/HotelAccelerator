"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, ChevronDown, CheckCircle2, AlertCircle, Mail } from "lucide-react"

export const BROADCAST_HISTORY_KEY = "/api/superadmin/sales/agents/broadcast/history"

type Recipient = { email: string | null; agentName: string | null; ok: boolean; error: string | null }
type Item = {
  key: string
  subject: string | null
  fromAlias: string | null
  sentAt: string
  total: number
  sent: number
  failed: number
  recipients: Recipient[]
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function SellerBroadcastHistory() {
  const { data, isLoading } = useSWR<{ items: Item[] }>(BROADCAST_HISTORY_KEY, fetcher)
  const items = data?.items ?? []
  const [openKey, setOpenKey] = useState<string | null>(null)

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5 text-muted-foreground" />
          Storico comunicazioni
        </CardTitle>
        <CardDescription>
          Le comunicazioni inviate ai venditori. Il testo del messaggio non è archiviato, solo oggetto, mittente e
          destinatari.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessuna comunicazione inviata finora.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const isOpen = openKey === item.key
              return (
                <li key={item.key} className="rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setOpenKey(isOpen ? null : item.key)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.subject || "(senza oggetto)"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {formatDate(item.sentAt)}
                        {item.fromAlias ? ` · da ${item.fromAlias}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        {item.sent}
                      </Badge>
                      {item.failed > 0 ? (
                        <Badge variant="secondary" className="gap-1">
                          <AlertCircle className="h-3 w-3 text-destructive" />
                          {item.failed}
                        </Badge>
                      ) : null}
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>
                  {isOpen ? (
                    <ul className="border-t border-border px-4 py-2">
                      {item.recipients.map((r, i) => (
                        <li key={i} className="flex items-center gap-2 py-1.5 text-sm">
                          {r.ok ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                          )}
                          <span className="text-foreground">{r.agentName || r.email || "—"}</span>
                          {r.agentName && r.email ? (
                            <span className="truncate text-xs text-muted-foreground">{r.email}</span>
                          ) : null}
                          {!r.ok && r.error ? (
                            <span className="truncate text-xs text-destructive">· {r.error}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
