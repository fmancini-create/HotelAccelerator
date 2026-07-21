"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertCircle,
  Copy,
  Check,
  Key,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Shield,
  Clock,
  Globe,
} from "lucide-react"

const ALL_SCOPES = [
  { value: "hotels:read", label: "Hotels: Read" },
  { value: "production:read", label: "Production: Read" },
  { value: "fiscal:read", label: "Fiscal: Read (Corrispettivi, Fatture)" },
  { value: "bookings:read", label: "Bookings: Read" },
  { value: "bookings:write", label: "Bookings: Write" },
  { value: "guests:read", label: "Guests: Read" },
  { value: "channels:read", label: "Channels: Read" },
  { value: "availability:read", label: "Availability: Read" },
  { value: "webhooks:read", label: "Webhooks: Read" },
  { value: "webhooks:write", label: "Webhooks: Write" },
  { value: "admin", label: "Admin (Full Access)" },
]

const SCOPE_PRESETS = {
  crm: ["hotels:read", "bookings:read", "guests:read", "channels:read", "availability:read", "webhooks:read", "webhooks:write"],
  accounting: ["hotels:read", "production:read", "fiscal:read", "bookings:read", "webhooks:read", "webhooks:write"],
  readonly: ["hotels:read", "production:read", "fiscal:read", "bookings:read", "guests:read", "channels:read", "availability:read"],
  full: ["admin"],
}

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  allowed_ips: string[] | null
  is_active: boolean
  last_used_at: string | null
  expires_at: string | null
  rate_limit_per_minute: number
  created_at: string
  organization_id: string
  organization_name: string
}

interface Org {
  id: string
  name: string
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newKeyResult, setNewKeyResult] = useState<{ plain_key: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [filterOrgId, setFilterOrgId] = useState<string>("all")

  // Form state
  const [formName, setFormName] = useState("")
  const [formOrgId, setFormOrgId] = useState("")
  const [formScopes, setFormScopes] = useState<string[]>([])
  const [formExpiry, setFormExpiry] = useState("none")
  const [formRateLimit, setFormRateLimit] = useState("100")
  const [isCreating, setIsCreating] = useState(false)

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/api-keys")
      if (!res.ok) throw new Error("Errore caricamento")
      const json = await res.json()
      setKeys(json.data || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadOrgs = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/organizations")
      if (!res.ok) return
      const json = await res.json()
      setOrgs(json.data || json || [])
    } catch {
      // fallback: extract from keys
    }
  }, [])

  useEffect(() => {
    loadKeys()
    loadOrgs()
  }, [loadKeys, loadOrgs])

  const handleCreate = async () => {
    if (!formName || !formOrgId || formScopes.length === 0) return
    setIsCreating(true)
    try {
      const res = await fetch("/api/superadmin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          organization_id: formOrgId,
          scopes: formScopes,
          expires_in_days: formExpiry === "none" ? null : parseInt(formExpiry),
          rate_limit_per_minute: parseInt(formRateLimit) || 100,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore creazione")

      setNewKeyResult({ plain_key: json.data.plain_key, name: json.data.name })
      setDialogOpen(false)
      resetForm()
      loadKeys()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleToggle = async (keyId: string, currentActive: boolean) => {
    try {
      await fetch(`/api/superadmin/api-keys/${keyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive }),
      })
      loadKeys()
    } catch {}
  }

  const handleDelete = async (keyId: string) => {
    if (!confirm("Sei sicuro di voler revocare questa API key? L'operazione e' irreversibile.")) return
    try {
      await fetch(`/api/superadmin/api-keys/${keyId}`, { method: "DELETE" })
      loadKeys()
    } catch {}
  }

  const resetForm = () => {
    setFormName("")
    setFormOrgId("")
    setFormScopes([])
    setFormExpiry("none")
    setFormRateLimit("100")
  }

  const toggleScope = (scope: string) => {
    setFormScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  const applyPreset = (preset: keyof typeof SCOPE_PRESETS) => {
    setFormScopes(SCOPE_PRESETS[preset])
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Gestisci le chiavi per la Public API v1 di Santaddeo. Le chiavi permettono ai SaaS esterni (CRM, Contabilita) di accedere ai dati.
            </p>
          </div>
          <Select value={filterOrgId} onValueChange={setFilterOrgId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filtra per organizzazione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le organizzazioni</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuova API Key
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Genera nuova API Key</DialogTitle>
              <DialogDescription>
                La chiave sara' mostrata UNA SOLA VOLTA dopo la creazione.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="key-name">Nome</Label>
                <Input
                  id="key-name"
                  placeholder="es. CRM Production, Contabilita Dev"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Organizzazione</Label>
                <Select value={formOrgId} onValueChange={setFormOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona organizzazione" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Scopes</Label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => applyPreset("crm")}>
                    Preset CRM
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => applyPreset("accounting")}>
                    Preset Contabilita
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => applyPreset("readonly")}>
                    Read-only
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => applyPreset("full")}>
                    Full Admin
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_SCOPES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleScope(s.value)}
                      className={`text-left text-xs px-2 py-1.5 rounded border transition-colors ${
                        formScopes.includes(s.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-border"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Scadenza</Label>
                  <Select value={formExpiry} onValueChange={setFormExpiry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Mai</SelectItem>
                      <SelectItem value="30">30 giorni</SelectItem>
                      <SelectItem value="90">90 giorni</SelectItem>
                      <SelectItem value="365">1 anno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rate limit/min</Label>
                  <Input
                    type="number"
                    value={formRateLimit}
                    onChange={(e) => setFormRateLimit(e.target.value)}
                    min={10}
                    max={1000}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
              <Button
                onClick={handleCreate}
                disabled={isCreating || !formName || !formOrgId || formScopes.length === 0}
              >
                {isCreating ? "Generando..." : "Genera Key"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* New Key Result Banner */}
      {newKeyResult && (
        <Card className="border-blue-300 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Key className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-900">
                  API Key "{newKeyResult.name}" generata con successo
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Copia questa chiave ORA. Non potra' essere recuperata in futuro.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="text-xs bg-white px-3 py-1.5 rounded border border-blue-200 font-mono break-all">
                    {newKeyResult.plain_key}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-8"
                    onClick={() => copyToClipboard(newKeyResult.plain_key)}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNewKeyResult(null)}>
                Chiudi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Keys List */}
      {keys.filter(k => filterOrgId === "all" || k.organization_id === filterOrgId).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Key className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nessuna API key creata</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crea la prima key per permettere ai SaaS esterni di accedere alla API Santaddeo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.filter(k => filterOrgId === "all" || k.organization_id === filterOrgId).map((k) => (
            <Card key={k.id} className={!k.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-sm font-semibold">{k.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {k.organization_name} -- <code className="font-mono">{k.key_prefix}...</code>
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={k.is_active ? "default" : "secondary"} className="text-[10px]">
                      {k.is_active ? "Attiva" : "Disattivata"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={k.is_active ? "Disattiva" : "Attiva"}
                      onClick={() => handleToggle(k.id, k.is_active)}
                    >
                      {k.is_active
                        ? <ToggleRight className="h-4 w-4 text-emerald-600" />
                        : <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                      }
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Revoca definitiva"
                      onClick={() => handleDelete(k.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {k.scopes.join(", ")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {k.rate_limit_per_minute} req/min
                  </span>
                  {k.last_used_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Ultimo uso: {new Date(k.last_used_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {k.expires_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Scade: {new Date(k.expires_at).toLocaleDateString("it-IT")}
                    </span>
                  )}
                  <span>
                    Creata: {new Date(k.created_at).toLocaleDateString("it-IT")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* API Reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Riferimento rapido API v1</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <p><code className="font-mono bg-muted px-1 rounded">Authorization: Bearer sk_live_...</code></p>
          <p><code className="font-mono bg-muted px-1 rounded">GET /api/v1/hotels</code> -- Lista hotel</p>
          <p><code className="font-mono bg-muted px-1 rounded">GET /api/v1/hotels/:id/production?from=...&to=...</code> -- Produzione</p>
          <p><code className="font-mono bg-muted px-1 rounded">GET /api/v1/hotels/:id/bookings?status=active&channel=...</code> -- Prenotazioni</p>
          <p><code className="font-mono bg-muted px-1 rounded">GET /api/v1/hotels/:id/guests?search=...</code> -- Ospiti</p>
          <p><code className="font-mono bg-muted px-1 rounded">GET /api/v1/hotels/:id/channels</code> -- Canali</p>
          <p><code className="font-mono bg-muted px-1 rounded">GET /api/v1/hotels/:id/availability</code> -- Disponibilita</p>
          <p><code className="font-mono bg-muted px-1 rounded">POST /api/v1/webhooks</code> -- Registra webhook</p>
        </CardContent>
      </Card>
    </div>
  )
}
