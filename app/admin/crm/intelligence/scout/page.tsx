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

function ToggleSelection({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
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
  const [keywords, setKeywords] = useState("hotel,hospitality")
  const [titles, setTitles] = useState("general manager, hotel manager, direttore, owner")
  const [location, setLocation] = useState("Italy")
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

  useEffect(() => {
    void load()
  }, [load])

  const selectedResults = useMemo(
    () => results.filter((person) => selectedResultIds.includes(person.id)),
    [results, selectedResultIds],
  )
  const selectedProspects = useMemo(
    () => prospects.filter((prospect) => selectedProspectIds.includes(prospect.id)),
    [prospects, selectedProspectIds],
  )
  const enrichableSelected = selectedProspects.filter((p) => !p.email && p.status === "saved")
  const importableSelected = selectedProspects.filter((p) => Boolean(p.email) && p.status !== "imported")

  const searchPeople = async () => {
    setLoading(true)
    setSearched(false)
    setError("")
    setNotice("")
    setSelectedResultIds([])
    try {
      const data = await api({
        action: "search",
        keywords,
        titles: titles.split(",").map((v) => v.trim()).filter(Boolean),
        seniorities: ["owner", "founder", "c_suite", "director", "manager"],
        organizationLocations: location.split(",").map((v) => v.trim()).filter(Boolean),
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
    setKeywords(search.keywords)
    setTitles(search.titles.join(", "))
    setLocation(search.organization_locations.join(", "))
    setResults(Array.isArray(search.people) ? search.people : [])
    setSelectedResultIds([])
    setSearched(true)
    setError("")
    setNotice(`Ricerca del ${formatDate(search.created_at)} riaperta dalla cronologia: nessuna nuova chiamata Scout.`)
  }

  const act = async (id: string, action: "enrich" | "import" | "dismiss") => {
    if (action === "enrich") {
      const confirmed = window.confirm(
        "La verifica del recapito può utilizzare fino a 1 credito Scout se il profilo viene identificato. Vuoi procedere?",
      )
      if (!confirmed) return
    }
    setBusyId(id)
    setError("")
    setNotice("")
    try {
      const data = await api({ action, prospectId: id, ...(action === "enrich" ? { confirmCredit: true } : {}) })
      if (action === "enrich") {
        setNotice(data.message || (data.prospect?.email ? "Email trovata." : "Email non disponibile per questo profilo."))
      } else if (action === "import") {
        setNotice("Prospect importato nel CRM.")
      }
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
    setError("")
    setNotice("")
    let ok = 0
    let failed = 0
    for (const person of selectedResults) {
      try {
        await api({ action: "save", person })
        ok += 1
      } catch {
        failed += 1
      }
    }
    await load()
    setBulkBusy("")
    setSelectedResultIds([])
    setNotice(`${ok} prospect salvati${failed ? `; ${failed} non salvati` : ""}. Nessun credito di verifica utilizzato.`)
  }

  const bulkEnrich = async () => {
    if (!enrichableSelected.length) return
    const count = enrichableSelected.length
    const confirmed = window.confirm(
      `Stai per verificare ${count} prospect. Il consumo massimo potenziale è ${count} crediti Scout (fino a 1 per profilo identificato). Vuoi procedere?`,
    )
    if (!confirmed) return
    setBulkBusy("enrich")
    setError("")
    setNotice("")
    let found = 0
    let unavailable = 0
    let failed = 0
    for (const prospect of enrichableSelected) {
      try {
        const data = await api({ action: "enrich", prospectId: prospect.id, confirmCredit: true })
        if (data.prospect?.email) found += 1
        else unavailable += 1
      } catch {
        failed += 1
      }
    }
    await load()
    setBulkBusy("")
    setSelectedProspectIds([])
    setNotice(`Verifica completata: ${found} email trovate, ${unavailable} non disponibili${failed ? `, ${failed} errori` : ""}.`)
  }

  const bulkImport = async () => {
    if (!importableSelected.length) return
    setBulkBusy("import")
    setError("")
    setNotice("")
    let ok = 0
    let failed = 0
    for (const prospect of importableSelected) {
      try {
        await api({ action: "import", prospectId: prospect.id })
        ok += 1
      } catch {
        failed += 1
      }
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
          <Link href="/admin/crm/intelligence">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Vendite IA
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <UserRoundSearch className="h-6 w-6 text-ha-brand" aria-hidden />
          <h1 className="text-2xl font-bold">HotelAccelerator Scout</h1>
        </div>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Il motore HotelAccelerator per trovare nuovi clienti e partner. Questa versione ricerca aziende, agenzie e decision maker B2B; Guest Scout sarà attivato con una sorgente dedicata.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">Company Scout</Badge>
          <Badge variant="secondary">Agency Scout</Badge>
          <Badge variant="outline">Guest Scout · prossimamente</Badge>
        </div>
      </div>

      {error && (
        <Card className="border-red-200">
          <CardContent className="flex gap-3 pt-6 text-red-800" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {notice && (
        <Card>
          <CardContent className="pt-6 text-sm" role="status" aria-live="polite">
            {notice}
          </CardContent>
        </Card>
      )}

      {configured === false && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6 text-sm text-amber-900">
            Scout non è disponibile in questo ambiente. Contatta l'amministratore della piattaforma.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Company & Agency Scout</CardTitle>
          <CardDescription>
            Ricerca: 0 crediti. Salvataggio: 0 crediti. Verifica email: fino a 1 credito per profilo identificato. Import CRM: 0 crediti.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Settori azienda, separati da virgola</span>
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="hotel,hospitality" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Ruoli, separati da virgola</span>
            <Input value={titles} onChange={(e) => setTitles(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Sede azienda</span>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <div className="md:col-span-3">
            <Button onClick={() => void searchPeople()} disabled={loading || configured === false}>
              {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Search className="mr-2 h-4 w-4" aria-hidden />}
              Cerca con Scout
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" aria-hidden /> Ricerche recenti</CardTitle>
          <CardDescription>Le ricerche restano nel tenant. Riaprirle non esegue una nuova chiamata e non usa crediti.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentSearches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna ricerca salvata finora.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {recentSearches.map((search) => (
                <button
                  type="button"
                  key={search.id}
                  onClick={() => reopenSearch(search)}
                  className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
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
              <div>
                <CardTitle>Risultati Scout</CardTitle>
                <CardDescription>Seleziona più profili e salvali insieme. Il salvataggio non consuma crediti.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <ToggleSelection
                    checked={selectedResultIds.length === results.length && results.length > 0}
                    onChange={(checked) => setSelectedResultIds(checked ? results.map((person) => person.id) : [])}
                    label="Seleziona tutti i risultati"
                  />
                  Tutti
                </label>
                <Button variant="outline" onClick={() => void bulkSave()} disabled={!selectedResults.length || Boolean(bulkBusy)}>
                  <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                  Salva selezionati ({selectedResults.length})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((person) => (
              <div key={person.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 gap-3">
                  <ToggleSelection
                    checked={selectedResultIds.includes(person.id)}
                    onChange={(checked) =>
                      setSelectedResultIds((current) => checked ? [...new Set([...current, person.id])] : current.filter((id) => id !== person.id))
                    }
                    label={`Seleziona ${person.fullName}`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{person.fullName}</p>
                      {person.lastNameObfuscated && <Badge variant="outline">Cognome parziale</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[person.title, person.organizationName, person.city, person.country].filter(Boolean).join(" · ") || "Dati essenziali non disponibili"}
                    </p>
                    {person.lastNameObfuscated && (
                      <p className="mt-1 text-xs text-muted-foreground">Scout maschera il cognome nella ricerca iniziale; l'arricchimento può restituire il nominativo completo.</p>
                    )}
                    {person.seniority && <Badge variant="secondary" className="mt-2">{person.seniority}</Badge>}
                  </div>
                </div>
                <Button variant="outline" onClick={() => void save(person)} disabled={busyId === person.id || Boolean(bulkBusy)}>
                  <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                  Salva prospect
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {searched && results.length === 0 && !error && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Nessun decision maker trovato con questi filtri. Prova ad ampliare settore, ruoli o località.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle>Prospect salvati</CardTitle>
              <CardDescription>
                Seleziona più righe per verificare email o importare in CRM con un solo comando. La verifica è l'unica fase che può usare crediti Scout.
              </CardDescription>
            </div>
            {prospects.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <ToggleSelection
                    checked={selectedProspectIds.length === prospects.length && prospects.length > 0}
                    onChange={(checked) => setSelectedProspectIds(checked ? prospects.map((p) => p.id) : [])}
                    label="Seleziona tutti i prospect salvati"
                  />
                  Tutti
                </label>
                <Button variant="outline" onClick={() => void bulkEnrich()} disabled={!enrichableSelected.length || Boolean(bulkBusy)}>
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                  Verifica email ({enrichableSelected.length})
                </Button>
                <Button onClick={() => void bulkImport()} disabled={!importableSelected.length || Boolean(bulkBusy)}>
                  <Check className="mr-2 h-4 w-4" aria-hidden />
                  Importa CRM ({importableSelected.length})
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {prospects.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nessun prospect Scout salvato nel tenant attivo.
            </div>
          ) : prospects.map((p) => {
            const emailUnavailable = !p.email && p.status === "enriched"
            return (
              <div key={p.id} className="flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <ToggleSelection
                    checked={selectedProspectIds.includes(p.id)}
                    onChange={(checked) =>
                      setSelectedProspectIds((current) => checked ? [...new Set([...current, p.id])] : current.filter((id) => id !== p.id))
                    }
                    label={`Seleziona ${p.full_name}`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{p.full_name}</p>
                      <Badge variant="outline">{statusLabels[p.status]}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[p.job_title, p.organization_name, p.city, p.country].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {p.email || (emailUnavailable ? "Email non disponibile" : "Email non ancora verificata")}
                      {p.email_status && <Badge variant="secondary">{p.email_status}</Badge>}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!p.email && p.status === "saved" && (
                    <Button variant="outline" onClick={() => void act(p.id, "enrich")} disabled={busyId === p.id || Boolean(bulkBusy)}>
                      <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                      Verifica email
                    </Button>
                  )}
                  {p.email && p.status !== "imported" && (
                    <Button onClick={() => void act(p.id, "import")} disabled={busyId === p.id || Boolean(bulkBusy)}>
                      <Check className="mr-2 h-4 w-4" aria-hidden />
                      Importa nel CRM
                    </Button>
                  )}
                  {p.status === "imported" && p.contact_id && (
                    <Button asChild variant="outline">
                      <Link href={`/admin/crm/contacts/${p.contact_id}`}>Apri contatto</Link>
                    </Button>
                  )}
                  {p.status !== "imported" && (
                    <Button variant="ghost" size="icon" onClick={() => void act(p.id, "dismiss")} disabled={busyId === p.id || Boolean(bulkBusy)} aria-label={`Scarta ${p.full_name}`}>
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        I prospect Scout sono isolati per tenant. L'importazione imposta il consenso marketing a «non concesso»:
        prima di qualsiasi contatto va verificata e registrata la base giuridica applicabile.
      </p>
    </div>
  )
}
