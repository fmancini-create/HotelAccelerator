"use client"

import { useState } from "react"
import useSWR from "swr"
import { Loader2, MailQuestion, UserPlus, Archive, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { MessageBody } from "@/components/sales/message-body"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

interface AgentLite {
  id: string
  display_name: string | null
  email: string | null
}

interface UnmatchedEmail {
  id: string
  inbox_label: string | null
  from_email: string | null
  from_name: string | null
  to_email: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  received_at: string | null
  suggested_agent_id: string | null
  suggested_agent: AgentLite | null
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return iso
  }
}

export function UnmatchedMailClient() {
  const { data, isLoading, mutate } = useSWR<{ emails: UnmatchedEmail[]; agents: AgentLite[] }>(
    "/api/superadmin/sales/unmatched?status=pending",
    fetcher,
    { refreshInterval: 60_000 },
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [agentChoice, setAgentChoice] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const emails = data?.emails ?? []
  const agents = data?.agents ?? []
  const selected = emails.find((e) => e.id === selectedId) ?? null

  async function act(email: UnmatchedEmail, action: "convert" | "archive") {
    setBusyId(email.id)
    setError(null)
    try {
      const agentId = agentChoice[email.id] || email.suggested_agent_id || ""
      if (action === "convert" && !agentId) {
        setError("Seleziona un venditore a cui assegnare il contatto.")
        setBusyId(null)
        return
      }
      const res = await fetch("/api/superadmin/sales/unmatched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: email.id, action, agent_id: agentId || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || "Operazione non riuscita.")
        return
      }
      if (selectedId === email.id) setSelectedId(null)
      await mutate()
    } catch {
      setError("Operazione non riuscita.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <MailQuestion className="h-5 w-5 text-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Posta non abbinata</h1>
          <p className="text-sm text-muted-foreground">
            Email arrivate sugli indirizzi venditore che non corrispondono a nessun lead. Crea un
            contatto o archivia.
          </p>
        </div>
        {emails.length > 0 && (
          <Badge className="ml-auto bg-amber-500 hover:bg-amber-500">{emails.length} da gestire</Badge>
        )}
      </header>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nessuna posta non abbinata. Tutto in ordine.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Lista */}
          <ul className="flex flex-col gap-2">
            {emails.map((e) => {
              const active = e.id === selectedId
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {e.from_name || e.from_email || "Mittente sconosciuto"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(e.received_at)}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{e.subject || "(nessun oggetto)"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {e.to_email && (
                        <Badge variant="outline" className="text-xs font-normal">
                          a {e.to_email}
                        </Badge>
                      )}
                      {e.suggested_agent && (
                        <Badge variant="secondary" className="text-xs font-normal">
                          {e.suggested_agent.display_name || e.suggested_agent.email}
                        </Badge>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Dettaglio + azioni */}
          <div className="rounded-lg border border-border p-4">
            {!selected ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Seleziona una email per vederne il contenuto e gestirla.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Da</p>
                  <p className="text-sm font-medium text-foreground">
                    {selected.from_name ? `${selected.from_name} ` : ""}
                    {selected.from_email ? `<${selected.from_email}>` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Oggetto</p>
                  <p className="text-sm font-medium text-foreground">{selected.subject || "(nessun oggetto)"}</p>
                </div>
                <div className="max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                  <MessageBody text={selected.body_text} html={selected.body_html} />
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <label className="text-sm font-medium text-foreground">Assegna a venditore</label>
                  <Select
                    value={agentChoice[selected.id] ?? selected.suggested_agent_id ?? ""}
                    onValueChange={(v) => setAgentChoice((prev) => ({ ...prev, [selected.id]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Scegli un venditore" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.display_name || a.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => act(selected, "convert")}
                      disabled={busyId === selected.id}
                      className="flex-1"
                    >
                      {busyId === selected.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      Crea contatto
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => act(selected, "archive")}
                      disabled={busyId === selected.id}
                    >
                      <Archive className="h-4 w-4" />
                      Archivia
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
