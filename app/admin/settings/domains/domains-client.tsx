"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Globe, CheckCircle2, Clock, Copy, ExternalLink, RefreshCw, Info } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"

interface PropertyDomain {
  id: string
  name: string
  subdomain: string | null
  custom_domain: string | null
  domain_status: string
  domain_verification_token: string | null
  domain_verified_at: string | null
  active_domain_type: string
  frontend_enabled: boolean
}

export function DomainsClient() {
  const [property, setProperty] = useState<PropertyDomain | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [subdomain, setSubdomain] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [activeDomainType, setActiveDomainType] = useState<"subdomain" | "custom_domain">("subdomain")
  const [frontendEnabled, setFrontendEnabled] = useState(true)

  useEffect(() => {
    fetchProperty()
  }, [])

  const fetchProperty = async () => {
    try {
      const response = await fetch(`/api/admin/domains`)
      const data = await response.json()

      if (data.error) {
        setError(data.error)
      } else {
        setProperty(data.property)
        setSubdomain(data.property.subdomain || "")
        setCustomDomain(data.property.custom_domain || "")
        setActiveDomainType(data.property.active_domain_type || "subdomain")
        setFrontendEnabled(data.property.frontend_enabled ?? true)
      }
    } catch {
      setError("Errore nel caricamento della configurazione")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
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

      if (data.error) {
        setError(data.error)
      } else {
        setProperty(data.property)
        setSuccess("Configurazione salvata con successo!")
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch {
      setError("Errore nel salvataggio")
    } finally {
      setSaving(false)
    }
  }

  const handleVerifyDns = async () => {
    setVerifying(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/admin/domains/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      const data = await response.json()

      if (data.verified) {
        setSuccess(data.message)
        fetchProperty() // Ricarica per aggiornare lo stato
      } else {
        setError(data.message)
      }
    } catch {
      setError("Errore nella verifica DNS")
    } finally {
      setVerifying(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setSuccess("Copiato negli appunti!")
    setTimeout(() => setSuccess(null), 2000)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
      case "active":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Verificato
          </Badge>
        )
      case "pending_verification":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" /> In attesa
          </Badge>
        )
      default:
        return <Badge variant="secondary">Non configurato</Badge>
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* AdminHeader */}
        <AdminHeader
          title="Domini"
          subtitle="Configura il dominio del tuo sito"
          breadcrumbs={[{ label: "Impostazioni", href: "/admin/settings" }, { label: "Domini" }]}
        />

        {/* Frontend Toggle */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Sito Pubblico
            </CardTitle>
            <CardDescription>Abilita o disabilita il sito web pubblico per questa struttura</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Frontend abilitato</p>
                <p className="text-sm text-muted-foreground">
                  {frontendEnabled ? "Il sito web è accessibile pubblicamente" : "Il sito web non è accessibile"}
                </p>
              </div>
              <Switch checked={frontendEnabled} onCheckedChange={setFrontendEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* Subdomain */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Subdomain HotelAccelerator</CardTitle>
            <CardDescription>Il subdomain gratuito su hotelaccelerator.com</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="subdomain">Subdomain</Label>
                <div className="flex mt-1.5">
                  <Input
                    id="subdomain"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value.replace(/[^a-z0-9-]/gi, ""))}
                    placeholder="miohotel"
                    className="rounded-r-none"
                  />
                  <div className="px-3 bg-muted border border-l-0 rounded-r-md flex items-center text-sm text-muted-foreground">
                    .hotelaccelerator.com
                  </div>
                </div>
              </div>
            </div>

            {subdomain && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">URL:</span>
                <code className="bg-muted px-2 py-1 rounded text-sm">https://{subdomain}.hotelaccelerator.com</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(`https://${subdomain}.hotelaccelerator.com`)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="use-subdomain"
                name="domain-type"
                checked={activeDomainType === "subdomain"}
                onChange={() => setActiveDomainType("subdomain")}
                className="h-4 w-4"
              />
              <Label htmlFor="use-subdomain" className="font-normal cursor-pointer">
                Usa questo subdomain come indirizzo principale
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Custom Domain */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Dominio Personalizzato</CardTitle>
                <CardDescription>Collega il tuo dominio (es. www.miohotel.com)</CardDescription>
              </div>
              {property?.domain_status && getStatusBadge(property.domain_status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="custom-domain">Dominio</Label>
              <Input
                id="custom-domain"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
                placeholder="www.miohotel.com"
                className="mt-1.5"
              />
            </div>

            {customDomain && (
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="use-custom"
                  name="domain-type"
                  checked={activeDomainType === "custom_domain"}
                  onChange={() => setActiveDomainType("custom_domain")}
                  className="h-4 w-4"
                />
                <Label htmlFor="use-custom" className="font-normal cursor-pointer">
                  Usa questo dominio come indirizzo principale
                </Label>
              </div>
            )}

            {/* DNS Instructions */}
            {property?.domain_verification_token && property.domain_status === "pending_verification" && (
              <Alert className="border-blue-200 bg-blue-50">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <p className="font-medium mb-2">Configura i record DNS:</p>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="font-medium">1. Record TXT (per verifica)</p>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="bg-white px-2 py-1 rounded border text-xs flex-1 break-all">
                          {property.domain_verification_token}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(property.domain_verification_token!)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="font-medium">2. Record CNAME</p>
                      <p className="text-muted-foreground">
                        Punta <code className="bg-white px-1 rounded">{customDomain}</code> a{" "}
                        <code className="bg-white px-1 rounded">cname.vercel-dns.com</code>
                      </p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {property?.domain_status === "pending_verification" && (
              <Button
                variant="outline"
                onClick={handleVerifyDns}
                disabled={verifying}
                className="w-full bg-transparent"
              >
                {verifying ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Verifica in corso...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Verifica DNS
                  </>
                )}
              </Button>
            )}

            {property?.domain_status === "verified" && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Dominio verificato il {new Date(property.domain_verified_at!).toLocaleDateString("it-IT")}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Salvataggio..." : "Salva Configurazione"}
          </Button>

          {property && subdomain && (
            <Button variant="outline" asChild>
              <a href={`https://${subdomain}.hotelaccelerator.com`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Apri Sito
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
