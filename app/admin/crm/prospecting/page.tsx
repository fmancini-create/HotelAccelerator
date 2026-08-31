"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Bot, Check, Clipboard, Database, Mail, Phone, Play, RefreshCw, Save, Search, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Prospect = {
  id: string; full_name: string | null; job_title: string | null; organization_name: string | null
  city: string | null; country: string | null; email: string | null; linkedin_url: string | null
  lead_score: number; sales_stage: string; linkedin_status: string; legal_basis: string | null
  automation_enabled: boolean; preferred_email_channel_id: string | null; outreach_paused: boolean
  do_not_contact: boolean; next_action: string | null; next_action_at: string | null; contact_id: string | null
}
type Activity = {
  id: string; channel: string; action: string; status: string; due_at: string; subject: string | null
  body: string | null; last_error: string | null; prospect: Prospect | null
}
type EmailChannel = { id: string; email_address: string; provider: string }
type Data = {
  prospects: Prospect[]; activities: Activity[]; emailChannels: EmailChannel[]
  summary: { prospects: number; highScore: number; dueNow: number; automationEnabled: number; connected: number; qualified: number }
}

type Drafts = Record<string, { subject: string; body: string }>
type Senders = Record<string, string>

const labels: Record<string, string> = {
  linkedin_invite: "Invia richiesta LinkedIn", linkedin_check: "Controlla LinkedIn", linkedin_message: "Invia messaggio LinkedIn",
  email_intro: "Prima email", email_followup: "Follow-up email", call: "Chiama il prospect", review: "Revisione manuale",
}
const legalBases: Record<string, string> = {
  legitimate_interest_b2b: "Interesse legittimo B2B verificato", consent: "Consenso", contract: "Rapporto contrattuale",
}
const fmt = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))

async function api(body?: Record<string, unknown>) {
  const response = await fetch("/api/admin/crm/prospecting", {
    method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || "Operazione CRM non completata")
  return payload
}

export default function ProspectingPage() {
  const [data, setData] = useState<Data | null>(null)
  const [drafts, setDrafts] = useState<Drafts>({})
  const [senders, setSenders] = useState<Senders>({})
  const [busy, setBusy] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const next = await api() as Data
      setData(next)
      setDrafts((old) => Object.fromEntries(next.activities.map((a) => [a.id, old[a.id] || { subject: a.subject || "", body: a.body || "" }])))
      setSenders((old) => Object.fromEntries(next.activities.map((a) => [a.id, old[a.id] || a.prospect?.preferred_email_channel_id || next.emailChannels[0]?.id || ""])))
    } catch (e) { setError(e instanceof Error ? e.message : "Errore inatteso") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async (key: string, body: Record<string, unknown>, success?: string) => {
    setBusy(key)
    try { await api(body); if (success) toast.success(success); await load() }
    catch (e) { toast.error(e instanceof Error ? e.message : "Operazione non completata") }
    finally { setBusy("") }
  }

  const copy = async (a: Activity) => {
    const text = drafts[a.id]?.body || a.body || ""
    if (!text) return toast.error("Nessun testo da copiare")
    await navigator.clipboard.writeText(text); toast.success("Testo copiato")
  }

  const activityCard = (a: Activity) => {
    const p = a.prospect
    const draft = drafts[a.id] || { subject: a.subject || "", body: a.body || "" }
    const sender = senders[a.id] || ""
    const linkedinWrite = a.action === "linkedin_invite" || a.action === "linkedin_message"
    const linkedinCheck = a.action === "linkedin_check"
    const email = a.channel === "email"
    const due = new Date(a.due_at).getTime() <= Date.now()

    return <Card key={a.id} className={a.last_error ? "border-red-200" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2"><Badge variant={due ? "default" : "secondary"}>{due ? "Da fare ora" : fmt(a.due_at)}</Badge><Badge variant="outline">{a.channel}</Badge>{a.status === "ready" && <Badge className="bg-emerald-100 text-emerald-800">Pronta</Badge>}</div>
        <CardTitle className="pt-2 text-lg">{labels[a.action] || a.action}</CardTitle>
        <CardDescription>{p?.full_name || "Prospect"}{p?.job_title ? ` · ${p.job_title}` : ""}{p?.organization_name ? ` · ${p.organization_name}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {a.last_error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{a.last_error}</p>}

        {(linkedinWrite || email) && <div className="space-y-2">
          {email && <Input value={draft.subject} placeholder="Oggetto" onChange={(e) => setDrafts((s) => ({ ...s, [a.id]: { ...draft, subject: e.target.value } }))} />}
          <textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={draft.body} placeholder={email ? "Testo email" : "Messaggio LinkedIn"} onChange={(e) => setDrafts((s) => ({ ...s, [a.id]: { ...draft, body: e.target.value } }))} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void run(`save-${a.id}`, { action: "save_draft", activityId: a.id, subject: draft.subject || null, body: draft.body }, "Bozza salvata")}><Save className="mr-2 h-4 w-4" />Salva</Button>
            <Button size="sm" variant="outline" onClick={() => void run(`ai-${a.id}`, { action: "generate", activityId: a.id }, "Testo rigenerato con IA")}><Sparkles className="mr-2 h-4 w-4" />Genera con IA</Button>
            {linkedinWrite && <Button size="sm" variant="outline" onClick={() => void copy(a)}><Clipboard className="mr-2 h-4 w-4" />Copia</Button>}
          </div>
        </div>}

        {linkedinWrite && <div className="flex flex-wrap gap-2">
          {p?.linkedin_url && <Button asChild><a href={p.linkedin_url} target="_blank" rel="noreferrer">Apri LinkedIn<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>}
          <Button variant="outline" onClick={() => void run(`sent-${a.id}`, { action: "complete", activityId: a.id, outcome: "sent" }, "Invio registrato")}><Check className="mr-2 h-4 w-4" />Segna inviato</Button>
          <Button variant="ghost" onClick={() => void run(`lost-${a.id}`, { action: "complete", activityId: a.id, outcome: "not_interested" }, "Prospect escluso")}>Non interessato</Button>
        </div>}

        {linkedinCheck && <div className="flex flex-wrap gap-2">
          {p?.linkedin_url && <Button asChild variant="outline"><a href={p.linkedin_url} target="_blank" rel="noreferrer">Controlla LinkedIn<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>}
          <Button onClick={() => void run(`connected-${a.id}`, { action: "complete", activityId: a.id, outcome: "connected" }, "Collegamento registrato")}>Collegato</Button>
          <Button variant="outline" onClick={() => void run(`reply-${a.id}`, { action: "complete", activityId: a.id, outcome: "replied" }, "Risposta registrata")}>Ha risposto</Button>
          <Button variant="outline" onClick={() => void run(`no-${a.id}`, { action: "complete", activityId: a.id, outcome: "no_response" }, "Passo successivo programmato")}>Nessuna risposta</Button>
          <Button variant="ghost" onClick={() => void run(`lost-${a.id}`, { action: "complete", activityId: a.id, outcome: "not_interested" }, "Prospect escluso")}>Non interessato</Button>
        </div>}

        {email && <div className="space-y-2 rounded-md border p-3">
          {!p?.legal_basis && <p className="text-sm text-amber-800">Registra prima la base giuridica nella scheda prospect.</p>}
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={sender} onChange={(e) => setSenders((s) => ({ ...s, [a.id]: e.target.value }))}>
            <option value="">Seleziona mittente</option>{(data?.emailChannels || []).map((c) => <option key={c.id} value={c.id}>{c.email_address} · {c.provider}</option>)}
          </select>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!sender || !p?.legal_basis || busy === `send-${a.id}`} onClick={() => void run(`send-${a.id}`, { action: "send_email_now", activityId: a.id, channelId: sender }, "Email inviata")}><Send className="mr-2 h-4 w-4" />Invia ora</Button>
            <Button variant="outline" disabled={!sender || !p?.legal_basis} onClick={() => void run(`queue-${a.id}`, { action: "approve_email", activityId: a.id, channelId: sender }, "Email messa in coda")}><Bot className="mr-2 h-4 w-4" />Metti in coda</Button>
            <Button variant="ghost" onClick={() => void run(`reply-${a.id}`, { action: "complete", activityId: a.id, outcome: "replied" }, "Risposta registrata")}>Ha già risposto</Button>
          </div>
        </div>}

        {a.action === "call" && <div className="flex flex-wrap gap-2">
          {p?.contact_id && <Button asChild><Link href={`/admin/crm/contacts/${p.contact_id}`}><Phone className="mr-2 h-4 w-4" />Apri contatto</Link></Button>}
          <Button variant="outline" onClick={() => void run(`call-${a.id}`, { action: "complete", activityId: a.id, outcome: "completed" }, "Chiamata completata")}>Segna completata</Button>
          <Button variant="ghost" onClick={() => void run(`lost-${a.id}`, { action: "complete", activityId: a.id, outcome: "not_interested" }, "Prospect escluso")}>Non interessato</Button>
        </div>}

        {a.action === "review" && <div className="flex gap-2"><Button asChild variant="outline"><Link href="/admin/crm/intelligence/apollo">Apri Apollo</Link></Button><Button variant="ghost" onClick={() => void run(`skip-${a.id}`, { action: "complete", activityId: a.id, outcome: "skipped" }, "Attività chiusa")}>Chiudi</Button></div>}
      </CardContent>
    </Card>
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2"><Search className="h-6 w-6 text-ha-brand" /><h1 className="text-2xl font-bold">Prospecting · LinkedIn + Apollo</h1></div><p className="mt-1 text-muted-foreground">Trova i decisori, prepara i messaggi e lascia al CRM i follow-up approvati.</p></div>
      <div className="flex gap-2"><Button asChild><Link href="/admin/crm/intelligence/apollo"><Database className="mr-2 h-4 w-4" />Trova con Apollo</Link></Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Aggiorna</Button></div>
    </div>

    {error && <Card className="border-red-200"><CardContent className="pt-6 text-red-800">{error}</CardContent></Card>}

    {data && <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{[
        ["Prospect", data.summary.prospects], ["Score ≥ 75", data.summary.highScore], ["Da fare ora", data.summary.dueNow],
        ["Auto email", data.summary.automationEnabled], ["LinkedIn collegati", data.summary.connected], ["Qualificati", data.summary.qualified],
      ].map(([label, value]) => <Card key={String(label)}><CardHeader className="pb-3"><CardDescription>{label}</CardDescription><CardTitle className="text-3xl">{value}</CardTitle></CardHeader></Card>)}</div>

      <Card><CardContent className="grid gap-3 pt-6 text-sm md:grid-cols-2"><p className="rounded-md border p-3"><strong>LinkedIn:</strong> l'IA prepara il testo; il venditore invia personalmente.</p><p className="rounded-md border p-3"><strong>Email:</strong> base giuridica + mittente + approvazione rendono possibile l'invio automatico.</p></CardContent></Card>

      <section className="space-y-3"><h2 className="text-xl font-semibold">Attività operative</h2>{data.activities.length ? data.activities.map(activityCard) : <Card><CardContent className="py-8 text-center text-muted-foreground">Nessuna attività. Avvia una sequenza da un prospect.</CardContent></Card>}</section>

      <section className="space-y-3"><h2 className="text-xl font-semibold">Prospect</h2>{data.prospects.length ? data.prospects.map((p) => {
        const channel = p.preferred_email_channel_id || data.emailChannels[0]?.id || ""
        return <Card key={p.id}><CardContent className="grid gap-4 pt-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div><div className="flex flex-wrap items-center gap-2"><strong>{p.full_name || "Prospect Apollo"}</strong><Badge>Score {p.lead_score}/100</Badge><Badge variant="outline">{p.sales_stage}</Badge>{p.automation_enabled && <Badge className="bg-emerald-100 text-emerald-800">Auto email ON</Badge>}{p.do_not_contact && <Badge className="bg-red-100 text-red-800">Non contattare</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{[p.job_title, p.organization_name, p.city, p.country].filter(Boolean).join(" · ")}</p><p className="mt-2 text-sm">{p.email || "Email non disponibile"}{p.next_action ? ` · Prossimo: ${labels[p.next_action] || p.next_action}${p.next_action_at ? ` (${fmt(p.next_action_at)})` : ""}` : ""}</p></div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            {!p.do_not_contact && <Button variant="outline" onClick={() => void run(`start-${p.id}`, { action: "start", prospectId: p.id }, "Sequenza avviata")}><Play className="mr-2 h-4 w-4" />Avvia/riattiva</Button>}
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={p.legal_basis || ""} disabled={p.do_not_contact} onChange={(e) => e.target.value && void run(`legal-${p.id}`, { action: "set_legal_basis", prospectId: p.id, legalBasis: e.target.value }, "Base giuridica registrata")}><option value="">Base giuridica…</option>{Object.entries(legalBases).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            {p.email && p.legal_basis && !p.do_not_contact && (p.automation_enabled
              ? <Button variant="outline" onClick={() => void run(`auto-${p.id}`, { action: "set_automation", prospectId: p.id, enabled: false }, "Auto email disattivata")}>Stop auto email</Button>
              : <Button variant="outline" disabled={!channel} onClick={() => void run(`auto-${p.id}`, { action: "set_automation", prospectId: p.id, enabled: true, channelId: channel }, "Auto email attivata")}><Bot className="mr-2 h-4 w-4" />Attiva auto email</Button>)}
            {p.linkedin_url && <Button asChild variant="ghost" size="icon"><a href={p.linkedin_url} target="_blank" rel="noreferrer" aria-label="Apri LinkedIn"><ArrowUpRight className="h-4 w-4" /></a></Button>}
            {p.contact_id && <Button asChild variant="ghost" size="icon"><Link href={`/admin/crm/contacts/${p.contact_id}`} aria-label="Apri contatto"><Mail className="h-4 w-4" /></Link></Button>}
          </div>
        </CardContent></Card>
      }) : <Card><CardContent className="py-10 text-center"><p className="text-muted-foreground">Non ci sono ancora prospect salvati.</p><Button asChild className="mt-4"><Link href="/admin/crm/intelligence/apollo">Cerca decision maker con Apollo</Link></Button></CardContent></Card>}</section>
    </>}

    {loading && !data && <Card><CardContent className="py-10 text-muted-foreground">Caricamento prospecting…</CardContent></Card>}
  </div>
}
