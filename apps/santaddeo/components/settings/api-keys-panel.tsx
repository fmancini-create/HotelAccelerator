"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, Check, Copy, Eye, EyeOff, Key, Plus, Shield, Trash2, X, BookOpen, PenLine, FileDown } from "lucide-react"

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  key_encrypted: string | null
  scopes: string[]
  is_active: boolean
  last_used_at: string | null
  expires_at: string | null
  rate_limit_per_minute: number
  created_at: string
}

/** Risorse API con scopes lettura e scrittura */
const API_RESOURCES = [
  {
    resource: "hotels",
    label: "Strutture",
    desc: "Dati anagrafici e configurazione hotel",
    readScope: "hotels:read",
    writeScope: "hotels:write",
    endpoints: ["GET /api/v1/hotels"],
  },
  {
    resource: "bookings",
    label: "Prenotazioni",
    desc: "Prenotazioni, date soggiorno, prezzi",
    readScope: "bookings:read",
    writeScope: "bookings:write",
    endpoints: ["GET /api/v1/hotels/:id/bookings"],
  },
  {
    resource: "production",
    label: "Produzione",
    desc: "Revenue, ADR, RevPAR, occupazione giornaliera",
    readScope: "production:read",
    writeScope: null,
    endpoints: ["GET /api/v1/hotels/:id/production"],
  },
  {
    resource: "fiscal",
    label: "Produzione Fiscale",
    desc: "Corrispettivi, fatture, documenti fiscali con dettaglio righe IVA",
    readScope: "fiscal:read",
    writeScope: null,
    endpoints: ["GET /api/v1/hotels/:id/fiscal"],
  },
  {
    resource: "availability",
    label: "Disponibilita'",
    desc: "Camere disponibili, fuori servizio, occupate",
    readScope: "availability:read",
    writeScope: null,
    endpoints: ["GET /api/v1/hotels/:id/availability"],
  },
  {
    resource: "guests",
    label: "Ospiti",
    desc: "Anagrafica ospiti, nazionalita', soggiorni",
    readScope: "guests:read",
    writeScope: null,
    endpoints: ["GET /api/v1/hotels/:id/guests"],
  },
  {
    resource: "channels",
    label: "Canali",
    desc: "Breakdown revenue e prenotazioni per canale",
    readScope: "channels:read",
    writeScope: null,
    endpoints: ["GET /api/v1/hotels/:id/channels"],
  },
  {
    resource: "webhooks",
    label: "Webhooks",
    desc: "Notifiche real-time per eventi (sync, prenotazioni)",
    readScope: "webhooks:read",
    writeScope: "webhooks:write",
    endpoints: ["GET /api/v1/webhooks", "POST /api/v1/webhooks"],
  },
]

const ALL_READ_SCOPES = API_RESOURCES.map((r) => r.readScope)
const ALL_WRITE_SCOPES = API_RESOURCES.filter((r) => r.writeScope).map((r) => r.writeScope as string)

const PRESETS = [
  { label: "Completo (lettura + scrittura)", scopes: [...ALL_READ_SCOPES, ...ALL_WRITE_SCOPES] },
  { label: "Solo Lettura (tutti i dati)", scopes: ALL_READ_SCOPES },
  { label: "CRM / Marketing", scopes: ["hotels:read", "bookings:read", "guests:read", "channels:read", "webhooks:read", "webhooks:write"] },
  { label: "Contabilita'", scopes: ["hotels:read", "bookings:read", "production:read", "fiscal:read"] },
  { label: "Booking Engine", scopes: ["hotels:read", "bookings:read", "bookings:write", "availability:read", "webhooks:read", "webhooks:write"] },
  { label: "Webhook Only", scopes: ["hotels:read", "webhooks:read", "webhooks:write"] },
]

export function ApiKeysPanel({ hotelId }: { hotelId?: string }) {
  const hotelParam = hotelId ? `?hotelId=${hotelId}` : ""
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([])
  const [newKeyExpiry, setNewKeyExpiry] = useState<string>("")
  const [creating, setCreating] = useState(false)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set())
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)
  const [baseUrl, setBaseUrl] = useState("https://app.santaddeo.com")

  // Set baseUrl on client side to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin)
    }
  }, [])

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/settings/api-keys${hotelParam}`)
      const json = await res.json()
      if (res.ok) setKeys(json.data || [])
      else setError(json.error)
    } catch {
      setError("Errore nel caricamento delle API keys")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  async function createKey() {
    if (!newKeyName.trim() || newKeyScopes.length === 0) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/api-keys${hotelParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: newKeyScopes,
          expires_in_days: newKeyExpiry ? Number(newKeyExpiry) : null,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setGeneratedKey(json.data.plain_key)
        setNewKeyName("")
        setNewKeyScopes([])
        setNewKeyExpiry("")
        fetchKeys()
      } else {
        setError(json.error)
      }
    } catch {
      setError("Errore nella creazione")
    } finally {
      setCreating(false)
    }
  }

  async function toggleKey(id: string) {
    await fetch(`/api/settings/api-keys/${id}`, { method: "PATCH" })
    fetchKeys()
  }

  async function deleteKey(id: string) {
    if (!confirm("Sei sicuro di voler revocare questa API key? L'operazione e' irreversibile.")) return
    await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" })
    fetchKeys()
  }

  function toggleScope(scope: string) {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  function applyPreset(scopes: string[]) {
    setNewKeyScopes(scopes)
  }

  function downloadApiDocs() {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"
    const date = new Date().toLocaleDateString("it-IT")

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Santaddeo API - Documentazione</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    h2 { font-size: 15px; font-weight: 700; margin: 24px 0 10px; border-bottom: 2px solid #111; padding-bottom: 4px; }
    h3 { font-size: 13px; font-weight: 700; margin: 16px 0 6px; }
    .subtitle { font-size: 12px; color: #555; margin-bottom: 32px; }
    .info-box { background: #f4f4f4; border: 1px solid #ddd; border-radius: 6px; padding: 14px 16px; margin-bottom: 16px; }
    .info-box p { margin-bottom: 6px; line-height: 1.6; }
    .info-box p:last-child { margin-bottom: 0; }
    code { font-family: 'Courier New', monospace; background: #eee; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
    pre { font-family: 'Courier New', monospace; background: #1e1e1e; color: #d4d4d4; padding: 14px 16px; border-radius: 6px; font-size: 11px; white-space: pre-wrap; word-break: break-all; margin: 8px 0; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
    th { background: #f4f4f4; text-align: left; padding: 8px 10px; border: 1px solid #ddd; font-weight: 700; }
    td { padding: 7px 10px; border: 1px solid #ddd; vertical-align: top; }
    td code { background: none; padding: 0; font-size: 11px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; margin: 1px 2px; }
    .badge-read { background: #e8f4fd; color: #1a6fa8; border: 1px solid #b3d9f7; }
    .badge-write { background: #111; color: #fff; }
    .method-get { color: #1a7a1a; font-weight: 700; }
    .method-post { color: #b45309; font-weight: 700; }
    .alert { background: #fff8e1; border: 1px solid #f0c040; border-radius: 6px; padding: 10px 14px; margin: 16px 0; font-size: 12px; }
    footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Santaddeo RMS - Documentazione API v1</h1>
  <p class="subtitle">Generato il ${date} &nbsp;&bull;&nbsp; Base URL: <code>${baseUrl}/api/v1</code></p>

  <h2>1. Autenticazione</h2>
  <div class="info-box">
    <p>Tutte le richieste richiedono una <strong>API Key</strong> ottenuta dalla sezione <em>Impostazioni &gt; API e Integrazioni</em>.</p>
    <p>Aggiungi l'header <code>x-api-key</code> (o <code>Authorization: Bearer</code>) a ogni richiesta:</p>
  </div>
  <pre>curl -H "x-api-key: sk_live_..." \\
  ${baseUrl}/api/v1/hotels</pre>
  <p style="font-size:12px;margin-top:8px;">Metodi di autenticazione accettati:</p>
  <table>
    <tr><th>Metodo</th><th>Header / Parametro</th><th>Esempio</th></tr>
    <tr><td>Header (consigliato)</td><td><code>x-api-key</code></td><td><code>x-api-key: sk_live_...</code></td></tr>
    <tr><td>Bearer Token</td><td><code>Authorization</code></td><td><code>Authorization: Bearer sk_live_...</code></td></tr>
    <tr><td>Query param (sconsigliato)</td><td><code>api_key</code></td><td><code>?api_key=sk_live_...</code></td></tr>
  </table>

  <h2>2. Endpoint Disponibili</h2>
  <table>
    <tr><th style="width:40%">Endpoint</th><th style="width:35%">Descrizione</th><th>Scope richiesto</th></tr>
    ${API_RESOURCES.map(res => res.endpoints.map(ep => {
      const isWrite = ep.startsWith("POST") || ep.startsWith("PUT") || ep.startsWith("PATCH") || ep.startsWith("DELETE")
      const scope = isWrite && res.writeScope ? res.writeScope : res.readScope
      const method = ep.split(" ")[0]
      const path = ep.split(" ")[1]
      return `<tr>
        <td><span class="${method === "GET" ? "method-get" : "method-post"}">${method}</span> <code>${path}</code></td>
        <td>${res.desc}</td>
        <td><span class="badge ${isWrite ? "badge-write" : "badge-read"}">${scope}</span></td>
      </tr>`
    }).join("")).join("")}
  </table>

  <h2>3. Parametri Comuni</h2>
  <table>
    <tr><th>Parametro</th><th>Tipo</th><th>Descrizione</th><th>Esempio</th></tr>
    <tr><td><code>from</code></td><td>string</td><td>Data inizio (YYYY-MM-DD)</td><td><code>2024-01-01</code></td></tr>
    <tr><td><code>to</code></td><td>string</td><td>Data fine (YYYY-MM-DD)</td><td><code>2024-12-31</code></td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Numero pagina (default: 1)</td><td><code>1</code></td></tr>
    <tr><td><code>per_page</code></td><td>integer</td><td>Risultati per pagina (default: 50, max: 100)</td><td><code>50</code></td></tr>
    <tr><td><code>status</code></td><td>string</td><td>Filtro stato prenotazione (active, cancelled, all)</td><td><code>active</code></td></tr>
    <tr><td><code>channel</code></td><td>string</td><td>Filtro canale di vendita</td><td><code>Booking.com</code></td></tr>
  </table>

  <h2>4. Esempi di Chiamata</h2>
  <h3>Lista hotel</h3>
  <pre>curl -H "x-api-key: sk_live_..." \\
  ${baseUrl}/api/v1/hotels</pre>

  <h3>Prenotazioni con filtro date</h3>
  <pre>curl -H "x-api-key: sk_live_..." \\
  "${baseUrl}/api/v1/hotels/HOTEL_ID/bookings?from=2024-01-01&to=2024-01-31"</pre>

  <h3>Disponibilita' camere</h3>
  <pre>curl -H "x-api-key: sk_live_..." \\
  "${baseUrl}/api/v1/hotels/HOTEL_ID/availability?from=2024-01-01&to=2024-01-31"</pre>

  <h3>Dati produzione (revenue)</h3>
  <pre>curl -H "x-api-key: sk_live_..." \\
  "${baseUrl}/api/v1/hotels/HOTEL_ID/production?from=2024-01-01&to=2024-01-31"</pre>

  <h2>5. Formato Risposta</h2>
  <div class="info-box">
    <p>Tutte le risposte sono in formato <strong>JSON</strong>.</p>
    <p>In caso di errore viene restituito un oggetto con il campo <code>error</code> e lo status HTTP corrispondente (400, 401, 403, 404, 500).</p>
  </div>
  <pre>{
  "data": [...],
  "total": 100,
  "limit": 50,
  "offset": 0
}</pre>

  <h2>6. Codici di Errore</h2>
  <table>
    <tr><th>HTTP Status</th><th>Significato</th></tr>
    <tr><td><code>200</code></td><td>Successo</td></tr>
    <tr><td><code>400</code></td><td>Parametri mancanti o non validi</td></tr>
    <tr><td><code>401</code></td><td>API key mancante o non valida</td></tr>
    <tr><td><code>403</code></td><td>Scope insufficienti per questa risorsa</td></tr>
    <tr><td><code>404</code></td><td>Risorsa non trovata (hotel_id errato)</td></tr>
    <tr><td><code>429</code></td><td>Troppe richieste (rate limit superato)</td></tr>
    <tr><td><code>500</code></td><td>Errore interno del server</td></tr>
  </table>

  <div class="alert">
    <strong>Importante:</strong> Le API key sono confidenziali. Non condividerle in ambienti non sicuri. 
    In caso di compromissione, revocare immediatamente la chiave dalla sezione Impostazioni e generarne una nuova.
  </div>

  <footer>
    Santaddeo RMS &bull; Documentazione API v1 &bull; ${baseUrl} &bull; Generato il ${date}
  </footer>
</body>
</html>`

    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, "_blank")
    if (win) {
      win.onload = () => {
        setTimeout(() => {
          win.print()
          URL.revokeObjectURL(url)
        }, 500)
      }
    }
  }

  async function copyToClipboard(text: string) {
    try {
      // Try modern clipboard API first
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback: create a temporary textarea and use execCommand
        const textarea = document.createElement("textarea")
        textarea.value = text
        textarea.style.position = "fixed"
        textarea.style.left = "-9999px"
        textarea.style.top = "-9999px"
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Last resort: prompt user to copy manually
      window.prompt("Copia questa chiave manualmente:", text)
    }
  }

  return (
    <div className="space-y-6">
      {/* Generated Key Alert */}
      {generatedKey && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-800">
              <Check className="h-5 w-5" />
              Chiave API Generata
            </CardTitle>
            <CardDescription className="text-emerald-700">
              La chiave e' stata creata. Puoi rivederla in qualsiasi momento dalla lista qui sotto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type={showKey ? "text" : "password"}
                readOnly
                value={generatedKey}
                className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm border border-emerald-200 select-all cursor-text focus:outline-none focus:ring-2 focus:ring-emerald-400"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)} title={showKey ? "Nascondi" : "Mostra"}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(generatedKey)} title="Copia negli appunti">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {copied && (
              <p className="text-sm text-green-700 font-medium">Chiave copiata negli appunti!</p>
            )}
            <Button variant="outline" size="sm" onClick={() => setGeneratedKey(null)} className="text-emerald-700">
              Chiudi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Key */}
      {!showCreate ? (
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Crea nuova API Key
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nuova API Key</CardTitle>
            <CardDescription>
              Le API keys permettono ai tuoi applicativi esterni di leggere i dati di Santaddeo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="es. CRM Integrazione, Contabilita' Export..."
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Preset permessi</Label>
              <Select onValueChange={(v) => applyPreset(PRESETS[Number(v)].scopes)}>
                <SelectTrigger>
                  <SelectValue placeholder="Scegli un preset o seleziona manualmente..." />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p, i) => (
                    <SelectItem key={i} value={String(i)}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Permessi per risorsa</Label>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setNewKeyScopes([...ALL_READ_SCOPES, ...ALL_WRITE_SCOPES])}
                    className="underline hover:text-foreground"
                  >
                    Seleziona tutti
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewKeyScopes([])}
                    className="underline hover:text-foreground"
                  >
                    Deseleziona tutti
                  </button>
                </div>
              </div>
              <div className="rounded-lg border overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_80px] bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b">
                  <span>Risorsa</span>
                  <span className="flex items-center justify-center gap-1"><BookOpen className="h-3 w-3" /> Lettura</span>
                  <span className="flex items-center justify-center gap-1"><PenLine className="h-3 w-3" /> Scrittura</span>
                </div>
                {/* Resource rows */}
                {API_RESOURCES.map((res) => {
                  const hasRead = newKeyScopes.includes(res.readScope)
                  const hasWrite = res.writeScope ? newKeyScopes.includes(res.writeScope) : false
                  return (
                    <div
                      key={res.resource}
                      className="grid grid-cols-[1fr_80px_80px] items-center px-4 py-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Shield className={`h-3.5 w-3.5 shrink-0 ${hasRead || hasWrite ? "text-foreground" : "text-muted-foreground/50"}`} />
                          <span className="font-medium text-sm">{res.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 ml-5.5">{res.desc}</p>
                      </div>
                      <div className="flex justify-center">
                        <Switch
                          checked={hasRead}
                          onCheckedChange={() => toggleScope(res.readScope)}
                          aria-label={`Lettura ${res.label}`}
                        />
                      </div>
                      <div className="flex justify-center">
                        {res.writeScope ? (
                          <Switch
                            checked={hasWrite}
                            onCheckedChange={() => toggleScope(res.writeScope!)}
                            aria-label={`Scrittura ${res.label}`}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground/50">-</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {newKeyScopes.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {newKeyScopes.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs gap-1">
                      {s}
                      <button type="button" onClick={() => toggleScope(s)} className="ml-0.5 hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Scadenza</Label>
              <Select value={newKeyExpiry} onValueChange={setNewKeyExpiry}>
                <SelectTrigger>
                  <SelectValue placeholder="Nessuna scadenza" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuna scadenza</SelectItem>
                  <SelectItem value="30">30 giorni</SelectItem>
                  <SelectItem value="90">90 giorni</SelectItem>
                  <SelectItem value="180">6 mesi</SelectItem>
                  <SelectItem value="365">1 anno</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={createKey}
                disabled={creating || !newKeyName.trim() || newKeyScopes.length === 0}
              >
                {creating ? "Generazione..." : "Genera API Key"}
              </Button>
              <Button variant="outline" onClick={() => { setShowCreate(false); setError(null) }}>
                Annulla
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keys List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Le tue API Keys
          </CardTitle>
          <CardDescription>
            Gestisci le chiavi di accesso per le integrazioni esterne con la tua organizzazione
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">Caricamento...</div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Key className="h-10 w-10 mb-3 opacity-30" />
              <p>Nessuna API key creata</p>
              <p className="text-sm mt-1">Crea la tua prima chiave per integrare Santaddeo con i tuoi applicativi</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${
                    key.is_active ? "bg-background" : "bg-muted/50 opacity-70"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{key.name}</span>
                      <Badge variant={key.is_active ? "default" : "secondary"} className="text-xs shrink-0">
                        {key.is_active ? "Attiva" : "Disattivata"}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      {key.key_encrypted ? (
                        <>
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded select-all cursor-text">
                            {visibleKeyIds.has(key.id) ? key.key_encrypted : `${key.key_prefix}${"*".repeat(40)}`}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setVisibleKeyIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(key.id)) next.delete(key.id)
                                else next.add(key.id)
                                return next
                              })
                            }}
                            title={visibleKeyIds.has(key.id) ? "Nascondi" : "Mostra chiave"}
                          >
                            {visibleKeyIds.has(key.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              copyToClipboard(key.key_encrypted!)
                              setCopiedKeyId(key.id)
                              setTimeout(() => setCopiedKeyId(null), 2000)
                            }}
                            title="Copia chiave"
                          >
                            {copiedKeyId === key.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </>
                      ) : (
                        <code className="text-xs font-mono text-muted-foreground">{key.key_prefix}...****</code>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{key.scopes.length} permessi</span>
                      {key.last_used_at && (
                        <span>Ultimo uso: {new Date(key.last_used_at).toLocaleDateString("it-IT")}</span>
                      )}
                      {key.expires_at && (
                        <span>Scade: {new Date(key.expires_at).toLocaleDateString("it-IT")}</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {key.scopes.map((s) => {
                        const isWrite = s.endsWith(":write")
                        return (
                          <Badge key={s} variant={isWrite ? "default" : "outline"} className="text-xs gap-1">
                            {isWrite ? <PenLine className="h-2.5 w-2.5" /> : <BookOpen className="h-2.5 w-2.5" />}
                            {s}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={key.is_active}
                      onCheckedChange={() => toggleKey(key.id)}
                      aria-label={key.is_active ? "Disattiva" : "Attiva"}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteKey(key.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentation Snippet */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Come usare le API</CardTitle>
            <Button variant="outline" size="sm" className="gap-2" onClick={downloadApiDocs}>
              <FileDown className="h-4 w-4" />
              Scarica PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {"Aggiungi l'header"} <code className="rounded bg-muted px-1.5 py-0.5 text-xs">x-api-key</code> a ogni richiesta:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
{`curl -H "x-api-key: sk_live_..." \\
  ${baseUrl}/api/v1/hotels`}
          </pre>
          <p className="text-sm text-muted-foreground">
            Endpoint disponibili e permessi richiesti:
          </p>
          <div className="rounded-lg border overflow-hidden text-sm">
            <div className="grid grid-cols-[1fr_auto] bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
              <span>Endpoint</span>
              <span>Scope richiesto</span>
            </div>
            {API_RESOURCES.map((res) => (
              <div key={res.resource} className="border-b last:border-b-0">
                {res.endpoints.map((ep) => {
                  const isWrite = ep.startsWith("POST") || ep.startsWith("PUT") || ep.startsWith("PATCH") || ep.startsWith("DELETE")
                  const scope = isWrite && res.writeScope ? res.writeScope : res.readScope
                  return (
                    <div key={ep} className="grid grid-cols-[1fr_auto] items-center px-3 py-2 hover:bg-muted/30">
                      <code className="text-xs">{ep}</code>
                      <Badge variant={isWrite ? "default" : "outline"} className="text-xs gap-1">
                        {isWrite ? <PenLine className="h-2.5 w-2.5" /> : <BookOpen className="h-2.5 w-2.5" />}
                        {scope}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
