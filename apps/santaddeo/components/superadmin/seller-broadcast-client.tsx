"use client"

import { useMemo, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { BROADCAST_HISTORY_KEY } from "@/components/superadmin/seller-broadcast-history"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, Search, Users, CheckCircle2, AlertCircle } from "lucide-react"

type Agent = {
  id: string
  display_name: string | null
  email: string | null
  is_active: boolean
}

type SendResult = {
  sent: number
  failed: number
  results: Array<{ agentId: string; email: string | null; ok: boolean; error?: string }>
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

// Alias mittente selezionabili (devono combaciare con l'allowlist dell'API).
const SENDER_ALIASES = [
  { value: "noreply@santaddeo.com", label: "noreply@santaddeo.com" },
  { value: "commerciale@santaddeo.com", label: "commerciale@santaddeo.com" },
  { value: "direzione@santaddeo.com", label: "direzione@santaddeo.com" },
  { value: "amministrazione@santaddeo.com", label: "amministrazione@santaddeo.com" },
  { value: "support@santaddeo.com", label: "support@santaddeo.com" },
  { value: "marketing@santaddeo.com", label: "marketing@santaddeo.com" },
  { value: "f.mancini@santaddeo.com", label: "f.mancini@santaddeo.com" },
]

export function SellerBroadcastClient() {
  const { mutate } = useSWRConfig()
  const { data, isLoading } = useSWR<{ agents: Agent[] }>("/api/superadmin/sales/agents", fetcher)
  const agents = useMemo(
    () => (data?.agents ?? []).filter((a) => a.is_active !== false),
    [data],
  )

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [fromAlias, setFromAlias] = useState(SENDER_ALIASES[0].value)
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return agents
    return agents.filter(
      (a) =>
        (a.display_name ?? "").toLowerCase().includes(q) || (a.email ?? "").toLowerCase().includes(q),
    )
  }, [agents, query])

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filtered.forEach((a) => next.delete(a.id))
      } else {
        filtered.forEach((a) => next.add(a.id))
      }
      return next
    })
  }

  async function handleSend() {
    setError(null)
    setResult(null)
    if (selected.size === 0) {
      setError("Seleziona almeno un venditore.")
      return
    }
    if (!subject.trim()) {
      setError("Inserisci l'oggetto.")
      return
    }
    if (!message.trim()) {
      setError("Inserisci il messaggio.")
      return
    }
    setSending(true)
    try {
      const res = await fetch("/api/superadmin/sales/agents/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_ids: Array.from(selected),
          subject: subject.trim(),
          body: message,
          from_alias: fromAlias,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error === "no_recipients" ? "Nessun destinatario valido." : json?.details || json?.error || "Invio fallito.")
        return
      }
      setResult(json as SendResult)
      // Aggiorna lo storico comunicazioni con il nuovo invio.
      void mutate(BROADCAST_HISTORY_KEY)
      if ((json as SendResult).failed === 0) {
        // reset del form solo se tutto inviato
        setSubject("")
        setMessage("")
        setSelected(new Set())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di rete.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      {/* Colonna sinistra: selezione venditori */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            Destinatari
            <Badge variant="secondary" className="ml-auto">
              {selected.size} selezionati
            </Badge>
          </CardTitle>
          <CardDescription>Seleziona uno o più venditori a cui inviare la comunicazione.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca nome o email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="flex items-center justify-between border-b border-border pb-2">
            <button
              type="button"
              onClick={toggleAllFiltered}
              className="text-sm font-medium text-primary hover:underline"
              disabled={filtered.length === 0}
            >
              {allFilteredSelected ? "Deseleziona tutti" : "Seleziona tutti"}
            </button>
            <span className="text-xs text-muted-foreground">{filtered.length} venditori</span>
          </div>

          <div className="max-h-[420px] space-y-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nessun venditore trovato.</p>
            ) : (
              filtered.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggle(a.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {a.display_name || a.email || "Venditore"}
                    </div>
                    {a.email && <div className="truncate text-xs text-muted-foreground">{a.email}</div>}
                  </div>
                </label>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Colonna destra: composer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Messaggio</CardTitle>
          <CardDescription>
            Ogni venditore riceve una copia individuale (con il proprio nome). Non viene usato il CC.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from-alias">Mittente</Label>
            <select
              id="from-alias"
              value={fromAlias}
              onChange={(e) => setFromAlias(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {SENDER_ALIASES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              La mail parte da questo indirizzo (con il tuo nome) e le risposte dei venditori tornano qui.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Oggetto</Label>
            <Input
              id="subject"
              placeholder="Es. Aggiornamento campagna di settembre"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Messaggio</Label>
            <Textarea
              id="message"
              placeholder={"Scrivi qui la comunicazione…\n\nIl saluto iniziale (Ciao Nome) e la firma SANTADDEO vengono aggiunti automaticamente."}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Il testo viene formattato automaticamente nel layout email SANTADDEO. Lascia una riga vuota per
              separare i paragrafi.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Inviate {result.sent} email
                {result.failed > 0 && <span className="text-destructive">· {result.failed} non riuscite</span>}
              </div>
              {result.failed > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {result.results
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={r.agentId}>
                        {r.email || r.agentId}: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">
              {selected.size} {selected.size === 1 ? "destinatario" : "destinatari"}
            </span>
            <Button onClick={handleSend} disabled={sending || selected.size === 0}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Invia comunicazione
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
