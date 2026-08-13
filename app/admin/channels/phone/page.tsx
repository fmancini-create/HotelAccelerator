"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle2, Copy, Loader2, Phone, PhoneOutgoing, Save } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"

type Integration = {
  base_url: string
  client_id: string
  default_extension: string
  credentials_preview: { client_secret: string }
  has_credentials: { client_secret: boolean; inbound_secret: boolean }
  last_check_at: string | null
  last_check_status: string | null
  last_check_error: string | null
}

export default function PhoneChannelPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [baseUrl, setBaseUrl] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [extension, setExtension] = useState("")
  const [result, setResult] = useState<{ ok: boolean; message: string; extensions?: string[] } | null>(null)
  const [urls, setUrls] = useState<{ lookup_url: string; journal_url: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/telephony/3cx")
      if (!res.ok) return
      const data = await res.json()
      const row = data.integration as Integration | null
      if (row) {
        setIntegration(row)
        setBaseUrl(row.base_url)
        setClientId(row.client_id)
        setExtension(row.default_extension)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setSaving(true)
    setResult(null)
    try {
      const res = await fetch("/api/telephony/3cx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: baseUrl,
          client_id: clientId,
          client_secret: clientSecret,
          default_extension: extension,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setResult({ ok: false, message: data.error || "Salvataggio non riuscito." })
        return
      }

      setIntegration(data.integration)
      setClientSecret("")

      // Il salvataggio riesce anche quando la verifica fallisce: lo dichiaro,
      // invece di mostrare un generico "salvato" che farebbe credere tutto a
      // posto fino al primo tentativo di chiamata.
      if (data.verified) {
        const list = Array.isArray(data.extensions)
          ? (data.extensions as Array<{ dn: string }>).map((e) => e.dn)
          : []
        setResult({
          ok: true,
          message: `Connessione riuscita: il centralino risponde e l'app ha i permessi di controllo chiamate.`,
          extensions: list,
        })
        void loadUrls()
      } else {
        setResult({ ok: false, message: `Dati salvati, ma la connessione non funziona: ${data.error}` })
      }
    } catch {
      setResult({ ok: false, message: "Impossibile contattare il servizio." })
    } finally {
      setSaving(false)
    }
  }

  async function loadUrls() {
    const res = await fetch("/api/telephony/3cx/inbound-urls")
    if (!res.ok) return
    setUrls(await res.json())
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }

  const connected = integration?.last_check_status === "ok"

  return (
    <div className="min-h-full bg-background">
      <AdminHeader title="Telefono IP" subtitle="Centralino 3CX collegato al CRM" />

      <div className="container py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ha-brand-soft">
                    <Phone className="h-5 w-5 text-ha-brand-soft-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Centralino 3CX</CardTitle>
                    <CardDescription className="text-pretty">
                      Richiede 3CX v20 o superiore, dove esiste la Call Control API.
                    </CardDescription>
                  </div>
                </div>
                {!loading && (
                  <Badge variant={connected ? "default" : "secondary"} className="shrink-0">
                    {connected ? "Collegato" : "Non collegato"}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="base-url">Indirizzo del centralino</Label>
                <Input
                  id="base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://ibarroncisrl.my3cx.it"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Solo il dominio (FQDN) con https, senza percorsi finali. Lo trovi nella dashboard 3CX alla voce
                  {" "}&quot;3CX FQDN&quot;.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="client-id">Client ID</Label>
                  <Input
                    id="client-id"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="900"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground text-pretty leading-relaxed">
                    Non è un codice che 3CX vi consegna: è un <strong>numero che scegliete voi</strong> quando create
                    l&apos;applicazione API (es. 900). Riscrivete qui lo stesso numero.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="extension">Interno da cui chiamare</Label>
                  <Input
                    id="extension"
                    value={extension}
                    onChange={(e) => setExtension(e.target.value)}
                    placeholder="100"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground text-pretty leading-relaxed">
                    Diverso dal Client ID: è l&apos;interno <strong>di una persona reale</strong>, il telefono che
                    squilla quando si avvia una chiamata dal CRM.
                  </p>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="client-secret">
                  Client Secret <span className="font-normal text-muted-foreground">(in 3CX si chiama &quot;API key&quot;)</span>
                </Label>
                <Input
                  id="client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={
                    integration?.has_credentials.client_secret
                      ? `Salvato (${integration.credentials_preview.client_secret}) — lascia vuoto per non cambiarlo`
                      : "Incolla il Client Secret"
                  }
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground text-pretty leading-relaxed">
                  Nella console 3CX non esiste una voce chiamata &quot;Client Secret&quot;: il valore da incollare qui è
                  la <strong>API key</strong> che appare dopo aver salvato l&apos;applicazione. Viene mostrata{" "}
                  <strong>una volta sola</strong>: se la perdete, va creata una nuova applicazione.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={save} disabled={saving || loading}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Salva e verifica
                </Button>
                {integration?.last_check_at && !result && (
                  <span className="text-xs text-muted-foreground">
                    Ultima verifica: {new Date(integration.last_check_at).toLocaleString("it-IT")}
                  </span>
                )}
              </div>

              {result && (
                <div
                  role="alert"
                  className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
                    result.ok ? "border-ha-success-soft bg-ha-success-soft/40" : "border-destructive/40 bg-destructive/10"
                  }`}
                >
                  {result.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ha-success" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  )}
                  <div className="space-y-1">
                    <p className="text-pretty">{result.message}</p>
                    {result.extensions && result.extensions.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Interni disponibili: {result.extensions.slice(0, 12).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Come ottenere le credenziali</CardTitle>
              <CardDescription>Nella console di amministrazione 3CX.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {[
                  "Nella console di amministrazione 3CX apri Integrations → API, poi premi Aggiungi (Add).",
                  "Scrivi tu il Client ID: un numero libero non ancora usato da nessun interno, per esempio 900. 3CX NON te lo fornisce, lo decidi tu.",
                  "Spunta 3CX Call Control API Access e imposta il ruolo System Owner: senza la spunta l'accesso riesce ma le chiamate vengono rifiutate; con ruoli come User o Receptionist non è possibile comandare gli interni altrui.",
                  "Nell'elenco degli interni da monitorare aggiungi l'interno da cui volete chiamare (es. 100). Se non è elencato, il centralino rifiuta la chiamata per permessi anche con tutto il resto corretto.",
                  "Salva: solo adesso 3CX mostra la API key, ed è il valore che qui chiamiamo Client Secret. Appare UNA volta sola: copiala subito, perché riaprendo la pagina non è più leggibile e va creata una nuova applicazione.",
                  "Torna qui, incolla la API key nel campo Client Secret, riscrivi lo stesso Client ID che hai scelto e indica l'interno.",
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {i + 1}
                    </span>
                    <span className="text-pretty leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 rounded-md border border-border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground text-pretty leading-relaxed">
                  <strong className="text-foreground">Se la voce API non compare</strong> nel menù Integrazioni, la
                  causa è quasi sempre il <strong>ruolo dell&apos;utente</strong>: la voce è riservata al{" "}
                  <strong>Proprietario del sistema</strong> (System Owner) e resta invisibile a
                  &quot;Amministratore di sistema&quot; e ruoli inferiori, anche con licenza corretta. Controllate in
                  Utenti → il vostro utente → Ruolo.
                </p>
                <p className="mt-2 text-xs text-muted-foreground text-pretty leading-relaxed">
                  <strong className="text-foreground">Se il campo Ruolo è grigio, non è un guasto:</strong> in 3CX solo
                  un Proprietario del sistema può assegnare quel ruolo, quindi nessuno può promuovere se stesso. Va
                  chiesto a chi lo possiede già — nell&apos;elenco Utenti è la riga con ruolo Proprietario del sistema.
                  Sui centralini forniti da un partner spesso è il partner: in alternativa può creare lui
                  l&apos;applicazione API e passarvi i due valori.
                </p>
                <p className="mt-2 text-xs text-muted-foreground text-pretty leading-relaxed">
                  Solo a ruolo corretto guardate la licenza: il Call Control richiede Enterprise da almeno 8 chiamate
                  simultanee, non in eccesso di interni.
                </p>
              </div>
            </CardContent>
          </Card>

          {connected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Chiamate in arrivo: chi sta telefonando</CardTitle>
                <CardDescription className="text-pretty">
                  Incolla questi due indirizzi nel template CRM di 3CX. Il centralino cercherà il numero nel CRM e
                  registrerà le telefonate, senza bisogno di altri programmi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!urls ? (
                  <Button variant="outline" onClick={loadUrls}>
                    Mostra gli indirizzi
                  </Button>
                ) : (
                  <>
                    {[
                      { label: "Ricerca contatto", value: urls.lookup_url },
                      { label: "Registro chiamate", value: urls.journal_url },
                    ].map((item) => (
                      <div key={item.label} className="grid gap-2">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</Label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-xs">
                            {item.value}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copy(item.label, item.value)}
                            aria-label={`Copia ${item.label}`}
                          >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                        {copied === item.label && <p className="text-xs text-ha-success">Copiato.</p>}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground text-pretty">
                      Contengono una chiave di accesso: trattali come una password.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cosa funziona e cosa no</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <PhoneOutgoing className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-pretty leading-relaxed">
                  <span className="font-medium">Chiamata dal CRM.</span> Squilla prima il vostro interno: quando
                  rispondete, il centralino compone il numero del cliente. Serve il telefono o l&apos;app 3CX
                  registrata.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-pretty leading-relaxed">
                  <span className="font-medium">Riconoscimento del chiamante.</span> Funziona solo per i numeri presenti
                  in rubrica. Le telefonate da numeri sconosciuti vengono comunque registrate, senza contatto collegato.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
