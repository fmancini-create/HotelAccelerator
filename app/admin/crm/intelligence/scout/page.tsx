"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock3,
  Mail,
  RefreshCw,
  Search,
  Sparkles,
  UserPlus,
  UserRoundSearch,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  SCOUT_INDUSTRY_OPTIONS,
  SCOUT_LOCATION_OPTIONS,
  SCOUT_ROLE_OPTIONS,
} from "@/lib/crm/scout-search"

type Person = {
  id: string
  firstName: string | null
  lastName: string | null
  lastNameObfuscated?: boolean
  fullName: string
  title: string | null
  seniority: string | null
  linkedinUrl: string | null
  city: string | null
  region: string | null
  country: string | null
  organizationName: string | null
  organizationDomain: string | null
  email: string | null
  emailStatus: string | null
}

type Prospect = {
  id: string
  full_name: string
  job_title: string | null
  organization_name: string | null
  organization_domain: string | null
  city: string | null
  country: string | null
  email: string | null
  email_status: string | null
  status: "saved" | "enriched" | "imported" | "dismissed"
  contact_id: string | null
}

type SearchHistory = {
  id: string
  keywords: string
  titles: string[]
  seniorities: string[]
  organization_locations: string[]
  page: number
  per_page: number
  total_entries: number
  total_pages: number
  people: Person[]
  created_at: string
}

const statusLabels: Record<Prospect["status"], string> = {
  saved: "Salvato",
  enriched: "Verificato",
  imported: "Nel CRM",
  dismissed: "Scartato",
}

async function api(body?: Record<string, unknown>) {
  const response = await fetch("/api/admin/crm/scout", {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || "Operazione Scout non completata")
  return payload
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function optionById(options: typeof SCOUT_INDUSTRY_OPTIONS, id: string) {
  return options.find((option) => option.id === id)
}

function ToggleSelection({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
      className="h-4 w-4 rounded border-border"
    />
  )
}

export default function ScoutCrmPage() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [recentSearches, setRecentSearches] = useState<SearchHistory[]>([])
  const [results, setResults] = useState<Person[]>([])

  const [industryId, setIndustryId] = useState("hospitality")
  const [roleId, setRoleId] = useState("general-management")
  const [locationId, setLocationId] = useState("it")
  const [customIndustry, setCustomIndustry] = useState("")
  const [customRole, setCustomRole] = useState("")
  const [customLocation, setCustomLocation] = useState("")

  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState("")
  const [bulkBusy, setBulkBusy] = useState<"save" | "enrich" | "import" | "">("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [searched, setSearched] = useState(false)
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([])
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const data = await api()
      setConfigured(data.configured)
      setProspects(data.prospects ?? [])
      setRecentSearches(data.recentSearches ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso")
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const selectedResults = useMemo(
    () => results.filter((person) => selectedResultIds.includes(person.id)),
    [results, selectedResultIds],
  )
  const selectedProspects = useMemo(
    () => prospects.filter((prospect) => selectedProspectIds.includes(prospect.id)),
    [prospects, selectedProspectIds],
  )
  const enrichableSelected = selectedProspects.filter((prospect) => !prospect.email && prospect.status === "saved")
  const importableSelected = selectedProspects.filter((prospect) => Boolean(prospect.email) && prospect.status !== "imported")

  const selectedIndustry = optionById(SCOUT_INDUSTRY_OPTIONS, industryId)
  const selectedRole = optionById(SCOUT_ROLE_OPTIONS, roleId)
  const selectedLocation = optionById(SCOUT_LOCATION_OPTIONS, locationId)

  const searchPeople = async () => {
    const keywords = industryId === "other" ? customIndustry.trim() : selectedIndustry?.searchTerm ?? ""
    const role = roleId === "other" ? customRole.trim() : selectedRole?.searchTerm ?? ""
    const location = locationId === "other" ? customLocation.trim() : selectedLocation?.searchTerm ?? ""

    if (!keywords) return setError("Seleziona un settore oppure specificane uno.")
    if (!role) return setError("Seleziona un ruolo oppure specificane uno.")
    if (!location) return setError("Seleziona una localita oppure specificane una.")

    setLoading(true)
    setSearched(false)
    setError("")
    setNotice("")
    setSelectedResultIds([])
    try {
      const data = await api({
        action: "search",
        keywords,
        titles: [role],
        seniorities: ["owner", "founder", "c_suite", "director", "manager"],
        organizationLocations: [location],
        page: 1,
        perPage: 25,
      })
      setResults(data.people ?? [])
      setSearched(true)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ricerca non completata")
    } finally {
      setLoading(false)
    }
  }

  const reopenSearch = (search: SearchHistory) => {
    setIndustryId("other")
    setRoleId("other")
    setLocationId("other")
    setCustomIndustry(search.keywords)
    setCustomRole(search.titles.join(", "))
    setCustomLocation(search.organization_locations.join(", "))
    setResults(Array.isArray(search.people) ? search.people : [])
    setSelectedResultIds([])
    setSearched(true)
    setError("")
    setNotice(`Ricerca del ${formatDate(search.created_at)} riaperta dalla cronologia: nessuna nuova chiamata Scout.`)
  }

  const act = async (id: string, action: "enrich" | "import" | "dismiss") => {
    if (action === "enrich" && !window.confirm("La verifica del recapito puo utilizzare fino a 1 credito Scout se il profilo viene identificato. Vuoi procedere?")) return
    setBusyId(id)
    setError("")
    setNotice("")
    try {
      const data = await api({ action, prospectId: id, ...(action === "enrich" ? { confirmCredit: true } : {}) })
      if (action === "enrich") setNotice(data.message || (data.prospect?.email ? "Email trovata." : "Email non disponibile per questo profilo."))
      if (action === "import") setNotice("Prospect importato nel CRM.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non completata")
    } finally {
      setBusyId("")
    }
  }

  const save = async (person: Person) => {
    setBusyId(person.id)
    setError("")
    setNotice("")
    try {
      await api({ action: "save", person })
      setNotice("Prospect salvato. Ora puoi verificare l'email.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio non completato")
    } finally {
      setBusyId("")
    }
  }

  const bulkSave = async () => {
    if (!selectedResults.length) return
    setBulkBusy("save")
    let ok = 0
    let failed = 0
    for (const person of selectedResults) {
      try { await api({ action: "save", person }); ok += 1 } catch { failed += 1 }
    }
    await load()
    setBulkBusy("")
    setSelectedResultIds([])
    setNotice(`${ok} prospect salvati${failed ? `; ${failed} non salvati` : ""}. Nessun credito di verifica utilizzato.`)
  }

  const bulkEnrich = async () => {
    if (!enrichableSelected.length) return
    const count = enrichableSelected.length
    if (!window.confirm(`Stai per verificare ${count} prospect. Il consumo massimo potenziale e ${count} crediti Scout. Vuoi procedere?`)) return
    setBulkBusy("enrich")
    let found = 0
    let unavailable = 0
    let failed = 0
    for (const prospect of enrichableSelected) {
      try {
        const data = await api({ action: "enrich", prospectId: prospect.id, confirmCredit: true })
        if (data.prospect?.email) found += 1
        else unavailable += 1
      } catch { failed += 1 }
    }
    await load()
    setBulkBusy("")
    setSelectedProspectIds([])
    setNotice(`Verifica completata: ${found} email trovate, ${unavailable} non disponibili${failed ? `, ${failed} errori` : ""}.`)
  }

  const bulkImport = async () => {
    if (!importableSelected.length) return
    setBulkBusy("import")
    let ok = 0
    let failed = 0
    for (const prospect of importableSelected) {
      try { await api({ action: "import", prospectId: prospect.id }); ok += 1 } catch { failed += 1 }
    }
    await load()
    setBulkBusy("")
    setSelectedProspectIds([])
    setNotice(`${ok} prospect importati nel CRM${failed ? `; ${failed} non importati` : ""}. L'importazione non usa crediti Scout.`)
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
          <Link href="/admin/crm/intelligence"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden />Vendite IA</Link>
        </Button>
        <div className="flex items-center gap-2">
          <UserRoundSearch className="h-6 w-6 text-ha-brand" aria-hidden />
          <h1 className="text-2xl font-bold">HotelAccelerator Scout</h1>
        </div>
        <p className="mt-1 max-w-3xl text-muted-foreground">Trova aziende, agenzie e decision maker senza conoscere il vocabolario tecnico del motore dati.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">Company Scout</Badge>
          <Badge variant="secondary">Agency Scout</Badge>
          <Badge variant="outline">Guest Scout · prossimamente</Badge>
        </div>
      </div>

      {error && <Card className="border-red-200"><CardContent className="flex gap-3 pt-6 text-red-800" role="alert"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><span>{error}</span></CardContent></Card>}
      {notice && <Card><CardContent className="pt-6 text-sm" role="status" aria-live="polite">{notice}</CardContent></Card>}
      {configured === false && <Card className="border-amber-300 bg-amber-50"><CardContent className="pt-6 text-sm text-amber-900">Scout non e disponibile in questo ambiente. Contatta l'amministratore della piattaforma.</CardContent></Card>}

      <Card>
        <CardHeader>
          <CardTitle>Company & Agency Scout</CardTitle>
          <CardDescription>Seleziona settore, ruolo e territorio. Scout traduce automaticamente le scelte nei termini tecnici necessari alla ricerca.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 text-sm">
            <span className="font-medium">Settore azienda</span>
            <Select value={industryId} onValueChange={setIndustryId}>
              <SelectTrigger aria-label="Settore azienda"><SelectValue placeholder="Seleziona settore" /></SelectTrigger>
              <SelectContent>
                {SCOUT_INDUSTRY_OPTIONS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                <SelectItem value="other">Altro settore...</SelectItem>
              </SelectContent>
            </Select>
            {industryId === "other" && <Input value={customIndustry} onChange={(event) => setCustomIndustry(event.target.value)} placeholder="Es. microbirrifici" />}
            {selectedIndustry?.description && <p className="text-xs text-muted-foreground">{selectedIndustry.description}</p>}
          </div>

          <div className="space-y-2 text-sm">
            <span className="font-medium">Ruolo / funzione</span>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger aria-label="Ruolo o funzione"><SelectValue placeholder="Seleziona ruolo" /></SelectTrigger>
              <SelectContent>
                {SCOUT_ROLE_OPTIONS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                <SelectItem value="other">Altro ruolo...</SelectItem>
              </SelectContent>
            </Select>
            {roleId === "other" && <Input value={customRole} onChange={(event) => setCustomRole(event.target.value)} placeholder="Es. mastro birraio" />}
            {selectedRole?.description && <p className="text-xs text-muted-foreground">{selectedRole.description}</p>}
          </div>

          <div className="space-y-2 text-sm">
            <span className="font-medium">Sede azienda</span>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger aria-label="Sede azienda"><SelectValue placeholder="Seleziona paese" /></SelectTrigger>
              <SelectContent>
                {SCOUT_LOCATION_OPTIONS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                <SelectItem value="other">Altra localita...</SelectItem>
              </SelectContent>
            </Select>
            {locationId === "other" && <Input value={customLocation} onChange={(event) => setCustomLocation(event.target.value)} placeholder="Es. Tuscany, Italy" />}
          </div>

          <div className="md:col-span-3 flex flex-wrap items-center gap-3">
            <Button onClick={() => void searchPeople()} disabled={loading || configured === false}>
              {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Search className="mr-2 h-4 w-4" aria-hidden />}
              Cerca con Scout
            </Button>
            <p className="text-xs text-muted-foreground">Ricerca e salvataggio: 0 crediti. La verifica email puo usare crediti Scout.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" aria-hidden /> Ricerche recenti</CardTitle><CardDescription>Le ricerche restano nel tenant. Riaprirle non esegue una nuova chiamata.</CardDescription></CardHeader>
        <CardContent>
          {recentSearches.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna ricerca salvata finora.</p> : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {recentSearches.map((search) => (
                <button type="button" key={search.id} onClick={() => reopenSearch(search)} className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50">
                  <p className="font-medium">{search.keywords || "Ricerca Scout"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(search.created_at)} · {search.people?.length ?? 0} visualizzati · {search.total_entries.toLocaleString("it-IT")} risultati totali</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><CardTitle>Risultati Scout</CardTitle><CardDescription>Seleziona piu profili e salvali insieme. Il salvataggio non consuma crediti.</CardDescription></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm"><ToggleSelection checked={selectedResultIds.length === results.length && results.length > 0} onChange={(checked) => setSelectedResultIds(checked ? results.map((person) => person.id) : [])} label="Seleziona tutti i risultati" />Tutti</label>
                <Button variant="outline" onClick={() => void bulkSave()} disabled={!selectedResults.length || Boolean(bulkBusy)}><UserPlus className="mr-2 h-4 w-4" aria-hidden />Salva selezionati ({selectedResults.length})</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((person) => (
              <div key={person.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 gap-3">
                  <ToggleSelection checked={selectedResultIds.includes(person.id)} onChange={(checked) => setSelectedResultIds((current) => checked ? [...new Set([...current, person.id])] : current.filter((id) => id !== person.id))} label={`Seleziona ${person.fullName}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{person.fullName}</p>{person.lastNameObfuscated && <Badge variant="outline">Cognome parziale</Badge>}</div>
                    <p className="text-sm text-muted-foreground">{[person.title, person.organizationName, person.city, person.country].filter(Boolean).join(" · ") || "Dati essenziali non disponibili"}</p>
                    {person.seniority && <Badge variant="secondary" className="mt-2">{person.seniority}</Badge>}
                  </div>
                </div>
                <Button variant="outline" onClick={() => void save(person)} disabled={busyId === person.id || Boolean(bulkBusy)}><UserPlus className="mr-2 h-4 w-4" aria-hidden />Salva prospect</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {searched && results.length === 0 && !error && <Card><CardContent className="pt-6 text-sm text-muted-foreground">Nessun decision maker trovato con questi filtri. Prova un settore, ruolo o territorio piu ampio.</CardContent></Card>}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div><CardTitle>Prospect salvati</CardTitle><CardDescription>Verifica i recapiti e importa nel CRM solo i profili utili.</CardDescription></div>
            {prospects.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm"><ToggleSelection checked={selectedProspectIds.length === prospects.length && prospects.length > 0} onChange={(checked) => setSelectedProspectIds(checked ? prospects.map((prospect) => prospect.id) : [])} label="Seleziona tutti i prospect salvati" />Tutti</label>
                <Button variant="outline" onClick={() => void bulkEnrich()} disabled={!enrichableSelected.length || Boolean(bulkBusy)}><Sparkles className="mr-2 h-4 w-4" aria-hidden />Verifica email ({enrichableSelected.length})</Button>
                <Button onClick={() => void bulkImport()} disabled={!importableSelected.length || Boolean(bulkBusy)}><Check className="mr-2 h-4 w-4" aria-hidden />Importa CRM ({importableSelected.length})</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {prospects.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nessun prospect Scout salvato nel tenant attivo.</div> : prospects.map((prospect) => {
            const emailUnavailable = !prospect.email && prospect.status === "enriched"
            return (
              <div key={prospect.id} className="flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <ToggleSelection checked={selectedProspectIds.includes(prospect.id)} onChange={(checked) => setSelectedProspectIds((current) => checked ? [...new Set([...current, prospect.id])] : current.filter((id) => id !== prospect.id))} label={`Seleziona ${prospect.full_name}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{prospect.full_name}</p><Badge variant="outline">{statusLabels[prospect.status]}</Badge></div>
                    <p className="text-sm text-muted-foreground">{[prospect.job_title, prospect.organization_name, prospect.city, prospect.country].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" aria-hidden />{prospect.email || (emailUnavailable ? "Email non disponibile" : "Email non ancora verificata")}{prospect.email_status && <Badge variant="secondary">{prospect.email_status}</Badge>}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!prospect.email && prospect.status === "saved" && <Button variant="outline" onClick={() => void act(prospect.id, "enrich")} disabled={busyId === prospect.id || Boolean(bulkBusy)}><Sparkles className="mr-2 h-4 w-4" aria-hidden />Verifica email</Button>}
                  {prospect.email && prospect.status !== "imported" && <Button onClick={() => void act(prospect.id, "import")} disabled={busyId === prospect.id || Boolean(bulkBusy)}><Check className="mr-2 h-4 w-4" aria-hidden />Importa nel CRM</Button>}
                  {prospect.status === "imported" && prospect.contact_id && <Button asChild variant="outline"><Link href={`/admin/crm/contacts/${prospect.contact_id}`}>Apri contatto</Link></Button>}
                  {prospect.status !== "imported" && <Button variant="ghost" size="icon" onClick={() => void act(prospect.id, "dismiss")} disabled={busyId === prospect.id || Boolean(bulkBusy)} aria-label={`Scarta ${prospect.full_name}`}><X className="h-4 w-4" aria-hidden /></Button>}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">I prospect Scout sono isolati per tenant. L'importazione imposta il consenso marketing a «non concesso»: prima di qualsiasi contatto va verificata e registrata la base giuridica applicabile.</p>
    </div>
  )
}
