"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Clock, Copy, ExternalLink, Globe, Info, Loader2, RefreshCw, ShieldAlert, XCircle } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

type DomainStatus =
  | "not_configured"
  | "automation_unavailable"
  | "not_registered"
  | "verification_required"
  | "dns_pending"
  | "ready"
  | "error"

type DnsInstruction = {
  type: "A" | "CNAME" | "TXT"
  name: string
  value: string
  purpose: "ownership" | "routing"
}

type DomainReadiness = {
  name: string | null
  status: DomainStatus
  ready: boolean
  verified: boolean
  misconfigured: boolean | null
  configuredBy: string | null
  dns: DnsInstruction[]
  checkedAt: string
  message: string
}

interface PropertyDomain {
  id: string
  name: string
  subdomain: string | null
  custom_domain: string | null
  active_domain_type: "subdomain" | "custom_domain"
  frontend_enabled: boolean
  active_cms_publication_id: string | null
}

type DomainPayload = {
  property: PropertyDomain
  automationConfigured: boolean
  domains: { subdomain: DomainReadiness; customDomain: DomainReadiness; active: DomainReadiness }
  publicSite: { url: string | null; ready: boolean; status: string; message: string }
}

type Availability = "idle" | "checking" | "available" | "unavailable"

function StatusBadge({ readiness }: { readiness: DomainReadiness | null }) {
  if (!readiness || readiness.status === "not_configured") return <Badge variant="secondary">Non configurato</Badge>
  if (readiness.status === "ready") {
    return <Badge className="bg-ha-success-soft text-ha-success-soft-foreground"><CheckCircle2 className="mr-1 h-3 w-3" />Operativo</Badge>
  }
  if (readiness.status === "automation_unavailable" || readiness.status === "error") {
    return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Errore</Badge>
  }
  return <Badge className="bg-ha-warning-soft text-ha-warning-soft-foreground"><Clock className="mr-1 h-3 w-3" />In configurazione</Badge>
}

export function DomainsClient() {
  const [payload, setPayload] = useState<DomainPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [subdomain, setSubdomain] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [activeDomainType, setActiveDomainType] = useState<"subdomain" | "custom_domain">("subdomain")
  const [frontendEnabled, setFrontendEnabled] = useState(true)
  const [availability, setAvailability] = useState<Availability>("idle")
  const [availabilityReason, setAvailabilityReason] = useState<string | null>(null)
  const [httpsReady, setHttpsReady] = useState(false)
  const [checkingHttps, setCheckingHttps] = useState(false)
  const [httpsCheck, setHttpsCheck] = useState(0)

  function applyPayload(data: DomainPayload) {
    setPayload(data)
    setSubdomain(data.property.subdomain || "")
    setCustomDomain(data.property.custom_domain || "")
    setActiveDomainType(data.property.active_domain_type || "subdomain")
    setFrontendEnabled(data.property.frontend_enabled ?? true)
  }

  async function fetchProperty() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/domains", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Errore nel caricamento della configurazione")
      applyPayload(data)
      setHttpsCheck((check) => check + 1)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Errore nel caricamento della configurazione")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchProperty() }, [])

  useEffect(() => {
    const normalized = subdomain.trim().toLowerCase()
    if (!normalized) {
      setAvailability("idle")
      setAvailabilityReason(null)
      return
    }
    if (normalized === payload?.property.subdomain) {
      setAvailability("available")
      setAvailabilityReason("Sottodominio attualmente assegnato alla struttura")
      return
    }
    setAvailability("checking")
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/domains/availability?subdomain=${encodeURIComponent(normalized)}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Controllo non riuscito")
        setAvailability(data.available ? "available" : "unavailable")
        setAvailabilityReason(data.reason || (data.available ? "Nome disponibile" : "Nome non disponibile"))
      } catch (availabilityError) {
        if (controller.signal.aborted) return
        setAvailability("unavailable")
        setAvailabilityReason(availabilityError instanceof Error ? availabilityError.message : "Controllo non riuscito")
      }
    }, 450)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [subdomain, payload?.property.subdomain])

  useEffect(() => {
    setHttpsReady(false)
    const url = payload?.publicSite.url
    if (!url) {
      setCheckingHttps(false)
      return
    }
    const controller = new AbortController()
    let active = true
    setCheckingHttps(true)
    fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit", signal: controller.signal })
      .then(() => { if (active) setHttpsReady(true) })
      .catch(() => { if (active) setHttpsReady(false) })
      .finally(() => { if (active) setCheckingHttps(false) })
    return () => {
      active = false
      controller.abort()
    }
  }, [payload?.publicSite.url, httpsCheck])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/admin/domains", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subdomain: subdomain.trim().toLowerCase(),
          custom_domain: customDomain.trim().toLowerCase(),
          active_domain_type: activeDomainType,
          frontend_enabled: frontendEnabled,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Errore nel salvataggio")
      applyPayload(data)
      setSuccess(data.publicSite.ready
        ? "Configurazione salvata: il sito è pronto su Vercel"
        : `Configurazione salvata: ${data.publicSite.message}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore nel salvataggio")
    } finally {
      setSaving(false)
    }
  }

  async function handleVerifyDns() {
    setVerifying(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/admin/domains/verify", { method: "POST" })
      const data = await response.json()
      if (!response.ok || !data.verified) throw new Error(data.message || "Verifica DNS non riuscita")
      setSuccess(data.message)
      await fetchProperty()
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Errore nella verifica DNS")
    } finally {
      setVerifying(false)
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setSuccess("Copiato negli appunti")
  }

  if (loading && !payload) {
    return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
  }

  const subdomainReadiness = payload?.domains.subdomain ?? null
  const customReadiness = payload?.domains.customDomain ?? null
  const selectedDomainMissing = activeDomainType === "subdomain" ? !subdomain.trim() : !customDomain.trim()
  const subdomainUnavailable = Boolean(subdomain.trim()) && availability === "unavailable"
  const saveDisabled = saving || availability === "checking" || subdomainUnavailable || selectedDomainMissing

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <AdminHeader title="Domini e pubblicazione" subtitle="Scegli l’indirizzo pubblico e controlla DNS, routing e SSL" />

      {!payload?.automationConfigured && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>L’automazione Vercel non è configurata: il tenant non può rendere operativo un dominio finché non vengono impostate le variabili server richieste.</AlertDescription>
        </Alert>
      )}
      {error && <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <Alert className="border-ha-success-soft bg-ha-success-soft"><CheckCircle2 className="h-4 w-4 text-ha-success-soft-foreground" /><AlertDescription className="text-ha-success-soft-foreground">{success}</AlertDescription></Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Globe className="h-5 w-5" />Sito pubblico</CardTitle>
          <CardDescription>Il link viene mostrato solo dopo pubblicazione, configurazione Vercel valida e risposta HTTPS corretta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div><p className="font-medium">Frontend abilitato</p><p className="text-sm text-muted-foreground">{frontendEnabled ? "Il sito può essere pubblicato" : "Il sito resta disattivato"}</p></div>
            <Switch checked={frontendEnabled} onCheckedChange={setFrontendEnabled} />
          </div>
          {payload?.publicSite.url && httpsReady ? (
            <Button variant="outline" asChild><a href={payload.publicSite.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Apri sito pubblico</a></Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ha-warning-soft-foreground">
              {checkingHttps && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{payload?.publicSite.url ? "DNS valido; verifica finale del certificato HTTPS in corso" : payload?.publicSite.message || "Sito non ancora disponibile"}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><CardTitle className="text-lg">Sottodominio HotelAccelerator</CardTitle><CardDescription>Indirizzo incluso, scelto autonomamente dal tenant.</CardDescription></div>
            <StatusBadge readiness={subdomainReadiness} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="subdomain">Nome</Label>
            <div className="mt-1.5 flex">
              <Input id="subdomain" value={subdomain} onChange={(event) => setSubdomain(event.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())} placeholder="miohotel" className="rounded-r-none" aria-describedby="subdomain-status" />
              <div className="flex items-center rounded-r-md border border-l-0 bg-muted px-3 text-sm text-muted-foreground">.hotelaccelerator.com</div>
            </div>
            <p id="subdomain-status" className={`mt-2 text-sm ${availability === "unavailable" ? "text-destructive" : availability === "available" ? "text-ha-success-soft-foreground" : "text-muted-foreground"}`}>
              {availability === "checking" ? "Controllo disponibilità…" : availabilityReason || "Il controllo parte mentre scrivi"}
            </p>
          </div>
          {subdomain && <div className="flex flex-wrap items-center gap-2 text-sm"><code className="rounded bg-muted px-2 py-1">https://{subdomain}.hotelaccelerator.com</code><Button variant="ghost" size="sm" onClick={() => void copyToClipboard(`https://${subdomain}.hotelaccelerator.com`)}><Copy className="h-4 w-4" /></Button></div>}
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="domain-type" checked={activeDomainType === "subdomain"} onChange={() => setActiveDomainType("subdomain")} />Usa questo sottodominio come indirizzo principale</label>
          {subdomainReadiness && <p className="text-sm text-muted-foreground">{subdomainReadiness.message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><CardTitle className="text-lg">Dominio personalizzato</CardTitle><CardDescription>Collega un dominio già posseduto, per esempio www.miohotel.com.</CardDescription></div>
            <StatusBadge readiness={customReadiness} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label htmlFor="custom-domain">Dominio</Label><Input id="custom-domain" value={customDomain} onChange={(event) => setCustomDomain(event.target.value.toLowerCase())} placeholder="www.miohotel.com" className="mt-1.5" /></div>
          {customDomain && <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="domain-type" checked={activeDomainType === "custom_domain"} onChange={() => setActiveDomainType("custom_domain")} />Usa questo dominio come indirizzo principale</label>}
          {customReadiness?.dns.length ? (
            <Alert className="border-ha-info-soft bg-ha-info-soft">
              <Info className="h-4 w-4 text-ha-info-soft-foreground" />
              <AlertDescription className="space-y-3 text-ha-info-soft-foreground">
                <p className="font-medium">Record richiesti da Vercel</p>
                <div className="space-y-2">
                  {customReadiness.dns.map((record, index) => (
                    <div key={`${record.type}-${record.name}-${index}`} className="grid gap-2 rounded border bg-card p-3 text-xs sm:grid-cols-[70px_1fr_1fr_auto] sm:items-center">
                      <Badge variant="outline" className="w-fit">{record.type}</Badge>
                      <code className="break-all">{record.name}</code>
                      <code className="break-all">{record.value}</code>
                      <Button variant="ghost" size="sm" onClick={() => void copyToClipboard(record.value)}><Copy className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs">I valori sono letti dall’API Vercel: non sono hardcoded.</p>
              </AlertDescription>
            </Alert>
          ) : null}
          {customReadiness && <p className="text-sm text-muted-foreground">{customReadiness.message}</p>}
          {customDomain && customReadiness && customReadiness.status !== "not_registered" && customReadiness.status !== "not_configured" && (
            <Button variant="outline" onClick={handleVerifyDns} disabled={verifying || customReadiness?.ready} className="w-full">
              <RefreshCw className={`mr-2 h-4 w-4 ${verifying ? "animate-spin" : ""}`} />{customReadiness?.ready ? "Dominio operativo" : "Ricontrolla DNS e verifica"}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={handleSave} disabled={saveDisabled} className="flex-1">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvataggio e provisioning…</> : "Salva e configura"}</Button>
        <Button variant="outline" onClick={() => void fetchProperty()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Aggiorna stato</Button>
      </div>
    </div>
  )
}
