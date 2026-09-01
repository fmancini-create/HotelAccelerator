"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, Check, Database, Mail, RefreshCw, Search, Sparkles, UserPlus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Person = {
  id: string
  firstName: string | null
  lastName: string | null
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
  apollo_person_id: string
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

async function api(body?: Record<string, unknown>) {
  const response = await fetch("/api/admin/crm/apollo", {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || "Operazione Apollo non completata")
  return payload
}

export default function ApolloCrmPage() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [results, setResults] = useState<Person[]>([])
  const [keywords, setKeywords] = useState("hotel,hospitality")
  const [titles, setTitles] = useState("general manager, hotel manager, direttore, owner")
  const [location, setLocation] = useState("Italy")
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [searched, setSearched] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api()
      setConfigured(data.configured)
      setProspects(data.prospects ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const searchPeople = async () => {
    setLoading(true)
    setSearched(false)
    setError("")
    setNotice("")
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ricerca non completata")
    } finally {
      setLoading(false)
    }
  }

  const act = async (id: string, action: "enrich" | "import" | "dismiss") => {
    if (action === "enrich") {
      const confirmed = window.confirm(
        "Questa operazione può consumare 1 credito Apollo se il profilo viene trovato. Vuoi procedere?",
      )
      if (!confirmed) return
    }
    setBusyId(id)
    setError("")
    setNotice("")
    try {
      const data = await api({ action, prospectId: id, ...(action === "enrich" ? { confirmCredit: true } : {}) })
      if (action === "enrich") {
        setNotice(data.message || (data.prospect?.email ? "Email trovata da Apollo." : "Apollo non ha un'email disponibile per questo profilo."))
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
      setNotice("Prospect salvato. Ora puoi chiedere ad Apollo di verificare l'email.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio non completato")
    } finally {
      setBusyId("")
    }
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
          <Database className="h-6 w-6 text-ha-brand" aria-hidden />
          <h1 className="text-2xl font-bold">Apollo · Decision maker hotel</h1>
        </div>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Cerca responsabili di strutture italiane, salva i profili interessanti e importa nel CRM solo quelli verificati.
        </p>
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
            Apollo è collegato a 4BID, ma HotelAccelerator non ha ancora la variabile server <code>APOLLO_API_KEY</code>.
            La pagina resta bloccata finché il segreto non viene configurato su Vercel.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trova nuovi prospect</CardTitle>
          <CardDescription>La ricerca persone non consuma crediti e non restituisce ancora email o telefoni.</CardDescription>
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
              Cerca decision maker
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Risultati Apollo</CardTitle>
            <CardDescription>Salva solo i profili coerenti. I valori mascherati richiedono arricchimento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((person) => (
              <div key={person.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">{person.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {[person.title, person.organizationName, person.city, person.country].filter(Boolean).join(" · ") || "Dati essenziali non disponibili"}
                  </p>
                  {person.seniority && <Badge variant="secondary" className="mt-2">{person.seniority}</Badge>}
                </div>
                <Button variant="outline" onClick={() => void save(person)} disabled={busyId === person.id}>
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
          <CardTitle>Prospect salvati</CardTitle>
          <CardDescription>
            L’arricchimento email richiede conferma e può consumare 1 credito. Nessun contatto viene usato per campagne automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {prospects.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nessun prospect Apollo salvato nel tenant attivo.
            </div>
          ) : prospects.map((p) => {
            const emailUnavailable = !p.email && p.status === "enriched"
            return (
              <div key={p.id} className="flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{p.full_name}</p>
                    <Badge variant="outline">{p.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[p.job_title, p.organization_name, p.city, p.country].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {p.email || (emailUnavailable ? "Email non disponibile su Apollo" : "Email non ancora verificata")}
                    {p.email_status && <Badge variant="secondary">{p.email_status}</Badge>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!p.email && p.status === "saved" && (
                    <Button variant="outline" onClick={() => void act(p.id, "enrich")} disabled={busyId === p.id}>
                      <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                      Rivela email
                    </Button>
                  )}
                  {p.email && p.status !== "imported" && (
                    <Button onClick={() => void act(p.id, "import")} disabled={busyId === p.id}>
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
                    <Button variant="ghost" size="icon" onClick={() => void act(p.id, "dismiss")} disabled={busyId === p.id} aria-label={`Scarta ${p.full_name}`}>
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
        I prospect Apollo sono isolati per tenant. L’importazione imposta il consenso marketing a «non concesso»:
        prima di qualsiasi contatto va verificata e registrata la base giuridica applicabile.
      </p>
    </div>
  )
}
