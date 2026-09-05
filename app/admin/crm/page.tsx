"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, Download, Eye, MoreHorizontal, MousePointer, Pencil, Plus, RefreshCw, Search, Upload } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { describeSegmentConditions, normalizeSegmentConditions } from "@/lib/crm/segment-engine"

type Contact = { id: string; name?: string|null; email?: string|null; company?: string|null; source?: string|null; vip_level?: string|null; lead_score?: number|null; total_bookings?: number|null; total_revenue_cents?: number|null; marketing_consent?: boolean|null; unsubscribed?: boolean|null; email_opens_count?: number|null; email_clicks_count?: number|null }
type Segment = { id: string; name: string; description?: string|null; segment_type?: string|null; conditions: unknown; contact_count?: number|null; last_computed_at?: string|null }
type Stats = { total_contacts: number; with_consent: number; vip_contacts: number; avg_lead_score: number; total_bookings: number; total_revenue: number }

function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 text-destructive"/><span>{message}</span></div>
}

export default function CRMPage() {
  const [tab, setTab] = useState("contacts")
  const [contacts, setContacts] = useState<Contact[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [stats, setStats] = useState<Stats|null>(null)
  const [segment, setSegment] = useState("all")
  const [vip, setVip] = useState("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [segmentsLoading, setSegmentsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [contactsError, setContactsError] = useState<string|null>(null)
  const [segmentsError, setSegmentsError] = useState<string|null>(null)

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab")
    if (["contacts", "segments", "imports"].includes(requested || "")) setTab(requested!)
  }, [])

  const loadSegments = async (force = false) => {
    force ? setRefreshing(true) : setSegmentsLoading(true)
    try {
      const res = await fetch(`/api/admin/crm/segments${force ? "?refresh=1" : ""}`, { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || "Impossibile caricare i segmenti")
      setSegments(Array.isArray(body) ? body : [])
      setSegmentsError(null)
      if (force) toast.success("Conteggi aggiornati")
    } catch (e) {
      const message = e instanceof Error ? e.message : "Impossibile caricare i segmenti"
      setSegmentsError(message)
      if (force) toast.error(message)
    } finally { setSegmentsLoading(false); setRefreshing(false) }
  }

  const loadStats = async () => {
    const res = await fetch("/api/admin/crm/stats", { cache: "no-store" })
    if (res.ok) setStats(await res.json())
  }

  const loadContacts = async () => {
    setContactsLoading(true)
    try {
      const p = new URLSearchParams({ limit: "250" })
      if (segment !== "all") p.set("segment", segment)
      if (vip !== "all") p.set("vip", vip)
      const res = await fetch(`/api/admin/crm/contacts?${p}`, { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || "Impossibile caricare i contatti")
      setContacts(Array.isArray(body) ? body : [])
      setContactsError(null)
    } catch (e) {
      setContacts([])
      setContactsError(e instanceof Error ? e.message : "Impossibile caricare i contatti")
    } finally { setContactsLoading(false) }
  }

  useEffect(() => { loadSegments(); loadStats() }, [])
  useEffect(() => { loadContacts(); setSelected([]) }, [segment, vip])

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("it-IT")
    if (!q) return contacts
    return contacts.filter(c => [c.name, c.email, c.company].some(v => String(v || "").toLocaleLowerCase("it-IT").includes(q)))
  }, [contacts, search])

  const changeTab = (value: string) => {
    setTab(value)
    window.history.replaceState(null, "", `/admin/crm?tab=${value}`)
  }

  const showContacts = (id: string) => { setSegment(id); changeTab("contacts") }

  const exportContacts = async () => {
    const res = await fetch("/api/admin/crm/contacts/export", { method: "POST" })
    if (!res.ok) return toast.error("Esportazione non disponibile")
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement("a"); a.href = url; a.download = `contacts-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><h1 className="text-2xl font-bold">CRM & Contatti</h1><p className="text-muted-foreground">Database intelligente per marketing e vendite mirate</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><Link href="/admin/crm/pms-sync/gestionale">PMS</Link></Button>
        <Button variant="outline" asChild><Link href="/admin/crm/settings">Impostazioni</Link></Button>
        <Button variant="outline" onClick={() => changeTab("imports")}><Upload className="mr-2 h-4 w-4"/>Importa</Button>
        <Button variant="outline" onClick={exportContacts}><Download className="mr-2 h-4 w-4"/>Esporta</Button>
      </div>
    </div>

    {stats && <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {[["Totale",stats.total_contacts],["Con consenso",stats.with_consent],["VIP",stats.vip_contacts],["Lead score medio",stats.avg_lead_score],["Prenotazioni",stats.total_bookings],["Revenue",(stats.total_revenue/100).toLocaleString("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0})]].map(([label,value]) => <Card key={String(label)}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString("it-IT") : value}</p></CardContent></Card>)}
    </div>}

    <Tabs value={tab} onValueChange={changeTab}>
      <TabsList><TabsTrigger value="contacts">Contatti</TabsTrigger><TabsTrigger value="segments">Segmenti</TabsTrigger><TabsTrigger value="imports">Import/Export</TabsTrigger></TabsList>

      <TabsContent value="contacts" className="space-y-4">
        {contactsError && <ErrorBox message={contactsError}/>}        
        <Card><CardContent className="pt-4"><div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-10" placeholder="Cerca per nome, email o azienda..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <Select value={segment} onValueChange={setSegment}><SelectTrigger className="w-full lg:w-64"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Tutti i segmenti</SelectItem>{segments.map(s=><SelectItem key={s.id} value={s.id}>{s.name} ({s.contact_count ?? 0})</SelectItem>)}</SelectContent></Select>
          <Select value={vip} onValueChange={setVip}><SelectTrigger className="w-full lg:w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Tutti i livelli VIP</SelectItem><SelectItem value="platinum">Platinum</SelectItem><SelectItem value="gold">Gold</SelectItem><SelectItem value="silver">Silver</SelectItem><SelectItem value="standard">Standard</SelectItem></SelectContent></Select>
        </div></CardContent></Card>
        <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1000px]"><thead className="border-b bg-muted/50"><tr><th className="w-10 p-3"><Checkbox checked={visible.length>0 && selected.length===visible.length} onCheckedChange={v=>setSelected(v?visible.map(c=>c.id):[])}/></th><th className="p-3 text-left">Contatto</th><th className="p-3 text-left">Fonte</th><th className="p-3 text-left">VIP</th><th className="p-3 text-left">Score</th><th className="p-3 text-left">Prenotazioni</th><th className="p-3 text-left">Revenue</th><th className="p-3 text-left">Email</th></tr></thead><tbody>
          {contactsLoading ? <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">Caricamento...</td></tr> : visible.length===0 ? <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">Nessun contatto trovato</td></tr> : visible.map(c=><tr key={c.id} className="border-b hover:bg-muted/30"><td className="p-3"><Checkbox checked={selected.includes(c.id)} onCheckedChange={v=>setSelected(x=>v?[...x,c.id]:x.filter(id=>id!==c.id))}/></td><td className="p-3"><Link href={`/admin/crm/contacts/${c.id}`} className="font-medium hover:underline">{c.name || "N/D"}</Link><div className="text-xs text-muted-foreground">{c.email || "Nessuna email"}{c.company ? ` · ${c.company}` : ""}</div></td><td className="p-3"><Badge variant="outline">{String(c.source || "manual").toLowerCase()==="apollo"?"scout":c.source || "manual"}</Badge></td><td className="p-3"><Badge variant="secondary">{c.vip_level || "standard"}</Badge></td><td className="p-3">{c.lead_score ?? 0}</td><td className="p-3">{c.total_bookings ?? 0}</td><td className="p-3">{((c.total_revenue_cents ?? 0)/100).toLocaleString("it-IT",{style:"currency",currency:"EUR"})}</td><td className="p-3"><span className="mr-3 inline-flex items-center gap-1 text-xs"><Eye className="h-3 w-3"/>{c.email_opens_count ?? 0}</span><span className="inline-flex items-center gap-1 text-xs"><MousePointer className="h-3 w-3"/>{c.email_clicks_count ?? 0}</span></td></tr>)}
        </tbody></table></div></CardContent></Card>
      </TabsContent>

      <TabsContent value="segments" className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-semibold">Segmenti CRM</h2><p className="text-sm text-muted-foreground">Le card ora sono segmenti reali e modificabili, non preset hardcoded.</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>loadSegments(true)} disabled={refreshing}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing?"animate-spin":""}`}/>Aggiorna conteggi</Button><Button asChild><Link href="/admin/crm/segments/new"><Plus className="mr-2 h-4 w-4"/>Nuovo Segmento</Link></Button></div></div>
        {segmentsError && <ErrorBox message={segmentsError}/>}        
        {segmentsLoading ? <Card><CardContent className="p-10 text-center text-muted-foreground">Caricamento segmenti...</CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{segments.map(s=>{const system=Boolean(normalizeSegmentConditions(s.conditions).preset); return <Card key={s.id} className={system?"border-dashed":undefined}><CardHeader><div className="flex items-start justify-between gap-2"><div><CardTitle className="text-lg">{s.name}</CardTitle><CardDescription className="mt-1 min-h-10">{s.description || "Nessuna descrizione"}</CardDescription></div><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/admin/crm/segments/${s.id}/edit`}><Pencil className="mr-2 h-4 w-4"/>Modifica</Link></DropdownMenuItem><DropdownMenuItem onClick={()=>showContacts(s.id)}>Mostra contatti</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem asChild><Link href={`/admin/marketing/campaigns/new?segment=${s.id}`}>Usa in campagna</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></CardHeader><CardContent className="space-y-4"><div className="flex items-end justify-between"><div><p className="text-3xl font-bold">{s.contact_count ?? 0}</p><p className="text-xs text-muted-foreground">contatti</p></div><div className="flex gap-1">{system&&<Badge variant="outline">Sistema</Badge>}<Badge>{s.segment_type==="static"?"Statico":"Dinamico"}</Badge></div></div><div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{describeSegmentConditions(s.conditions)}</div><div className="flex items-center justify-between border-t pt-3"><span className="text-xs text-muted-foreground">{s.last_computed_at?`Aggiornato ${new Date(s.last_computed_at).toLocaleString("it-IT")}`:"Da calcolare"}</span><Button size="sm" variant="ghost" asChild><Link href={`/admin/crm/segments/${s.id}/edit`}>Modifica</Link></Button></div></CardContent></Card>})}</div>}
      </TabsContent>

      <TabsContent value="imports"><Card><CardHeader><CardTitle>Import / Export</CardTitle><CardDescription>Importa contatti o scarica il database CRM.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border p-5"><Upload className="mb-3 h-6 w-6"/><p className="font-medium">Importa contatti</p><p className="mt-1 text-sm text-muted-foreground">CSV o Excel. Il flusso di importazione resta disponibile dalla funzione Importa del CRM.</p><Button className="mt-4" variant="outline" disabled>Seleziona file</Button></div><div className="rounded-xl border p-5"><Download className="mb-3 h-6 w-6"/><p className="font-medium">Esporta contatti</p><p className="mt-1 text-sm text-muted-foreground">Scarica il database corrente in CSV.</p><Button className="mt-4" variant="outline" onClick={exportContacts}>Scarica CSV</Button></div></CardContent></Card></TabsContent>
    </Tabs>
  </div>
}
