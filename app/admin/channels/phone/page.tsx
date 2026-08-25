"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Bot, CheckCircle2, Copy, Loader2, Phone, PhoneOutgoing, Save } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { TelephonyExtensionsCard } from "@/components/admin/telephony-extensions-card"
import { VoiceIvrRoutingCard } from "@/components/admin/voice-ivr-routing-card"

type Integration = {
  base_url: string
  client_id: string
  default_extension: string
  credentials_preview: { client_secret: string }
  has_credentials: { client_secret: boolean; inbound_secret: boolean; voice_inbound_secret: boolean }
  last_check_at: string | null
  last_check_status: string | null
  last_check_error: string | null
}

type VoiceAgentLink = {
  key: string
  label: string
  fallback_extension: string
  status: "ready" | "empty"
  knowledge_base: {
    id: string
    name: string
    source_count: number
  }
  query_url: string
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
  const [apiKey, setApiKey] = useState("")
  const [voiceApiKey, setVoiceApiKey] = useState("")
  const [voiceCredentialMessage, setVoiceCredentialMessage] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [voicePreparing, setVoicePreparing] = useState(false)
  const [voiceRotating, setVoiceRotating] = useState(false)
  const [voiceAgents, setVoiceAgents] = useState<VoiceAgentLink[] | null>(null)
  const [prospectAgents, setProspectAgents] = useState<VoiceAgentLink[]>([])
  const [customerSupportAgents, setCustomerSupportAgents] = useState<VoiceAgentLink[]>([])
  const [supportMessageUrls, setSupportMessageUrls] = useState<Record<string, string>>({})
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
        // Il salvataggio delle credenziali genera anche la chiave del
        // collegamento CRM: la mostro subito, senza un secondo passaggio.
        void prepareCrmLink()
      } else {
        setResult({ ok: false, message: `Dati salvati, ma la connessione non funziona: ${data.error}` })
      }
    } catch {
      setResult({ ok: false, message: "Impossibile contattare il servizio." })
    } finally {
      setSaving(false)
    }
  }

  async function prepareCrmLink() {
    setPreparing(true)
    try {
      const res = await fetch("/api/telephony/3cx/crm-link", { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.api_key) {
        // Un errore silenzioso qui lascerebbe il pulsante fermo senza spiegazione:
        // riuso la stessa striscia di esito del resto della pagina.
        setResult({
          ok: false,
          message: data?.error || "Non è stato possibile preparare il collegamento.",
        })
        return
      }
      setApiKey(String(data.api_key))
      await load()
    } finally {
      setPreparing(false)
    }
  }

  async function loadVoiceAgents() {
    const res = await fetch("/api/telephony/3cx/inbound-urls", { cache: "no-store" })
    const data = await res.json().catch(() => null)
    if (!res.ok || !Array.isArray(data?.voice_agents)) {
      setResult({ ok: false, message: data?.error || "Non è stato possibile generare i collegamenti vocali." })
      return false
    }

    setVoiceAgents(data.voice_agents as VoiceAgentLink[])
    setProspectAgents(Array.isArray(data.prospect_agents) ? (data.prospect_agents as VoiceAgentLink[]) : [])
    setCustomerSupportAgents(
      Array.isArray(data.customer_support_agents) ? (data.customer_support_agents as VoiceAgentLink[]) : [],
    )
    setSupportMessageUrls(
      data.customer_support_message_urls && typeof data.customer_support_message_urls === "object"
        ? (data.customer_support_message_urls as Record<string, string>)
        : {},
    )
    return true
  }

  async function prepareVoiceAgents() {
    setVoicePreparing(true)
    setResult(null)
    try {
      const secretRes = await fetch("/api/telephony/3cx/voice-link", { method: "POST" })
      const secretData = await secretRes.json().catch(() => null)
      if (!secretRes.ok) {
        setResult({ ok: false, message: secretData?.error || "Non è stato possibile predisporre la credenziale vocale." })
        return
      }
      if (!(await loadVoiceAgents())) return

      if (typeof secretData?.api_key === "string" && secretData.api_key) {
        setVoiceApiKey(secretData.api_key)
        setVoiceCredentialMessage("Nuova credenziale vocale generata: copiala ora in 3CX. Non verrà mostrata di nuovo.")
      } else {
        setVoiceCredentialMessage(
          "La credenziale vocale è già configurata e non viene ristampata. Se ti serve copiarla di nuovo, ruotala esplicitamente.",
        )
      }
      await load()
    } catch {
      setResult({ ok: false, message: "Impossibile contattare il servizio." })
    } finally {
      setVoicePreparing(false)
    }
  }

  async function rotateVoiceCredential() {
    if (!window.confirm("La chiave precedente smetterà subito di funzionare. Hai modo di aggiornarla ora in 3CX?")) return

    setVoiceRotating(true)
    setResult(null)
    try {
      const res = await fetch("/api/telephony/3cx/voice-link", { method: "PUT" })
      const data = await res.json().catch(() => null)
      if (!res.ok || typeof data?.api_key !== "string" || !data.api_key) {
        setResult({ ok: false, message: data?.error || "Non è stato possibile ruotare la credenziale vocale." })
        return
      }
      setVoiceApiKey(data.api_key)
      setVoiceCredentialMessage("Credenziale vocale ruotata: aggiorna subito il parametro 3CX e conserva solo questa nuova chiave.")
      await loadVoiceAgents()
      await load()
    } catch {
      setResult({ ok: false, message: "Impossibile contattare il servizio." })
    } finally {
      setVoiceRotating(false)
    }
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

          <VoiceIvrRoutingCard />

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

          {/* NON condizionata all'accesso riuscito all'applicazione API: questa e'
              proprio la strada per chi non puo' crearla. Legarla a "Collegato"
              la rendeva raggiungibile solo a chi non ne aveva bisogno. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Chiamate in arrivo: chi sta telefonando</CardTitle>
              <CardDescription className="text-pretty">
                Funziona <strong>senza</strong> l&apos;applicazione API e senza il ruolo Proprietario del sistema: basta
                caricare un file nella pagina Integrazioni → CRM. Il centralino cercherà il numero fra i vostri contatti
                e registrerà le telefonate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!apiKey ? (
                <Button variant="outline" onClick={prepareCrmLink} disabled={preparing}>
                  {preparing ? "Preparazione…" : "Prepara il collegamento"}
                </Button>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Chiave di collegamento
                    </Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-xs">
                        {apiKey}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copy("Chiave", apiKey)}
                        aria-label="Copia la chiave di collegamento"
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    {copied === "Chiave" && <p className="text-xs text-ha-success">Copiata.</p>}
                    <p className="text-xs text-muted-foreground text-pretty">
                      Trattatela come una password. Non è scritta dentro il file: il file può essere condiviso, la
                      chiave no.
                    </p>
                  </div>

                  <Button asChild>
                    <a href="/api/telephony/3cx/template" download>
                      Scarica il file per 3CX
                    </a>
                  </Button>

                  <ol className="space-y-2 text-sm text-muted-foreground">
                    {[
                      "Nella console 3CX apri Integrazioni → CRM.",
                      "Premi Aggiungi template e carica il file appena scaricato.",
                      "Scegli HotelAccelerator nell'elenco delle soluzioni CRM.",
                      "Incolla la chiave qui sopra nel campo Chiave di collegamento, poi Salva.",
                      "Premi PROVA con un numero presente in rubrica: deve comparire il contatto.",
                    ].map((step, i) => (
                      <li key={step} className="flex gap-3 text-pretty leading-relaxed">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
              <CardHeader>
                <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ha-brand-soft">
                  <Bot className="h-5 w-5 text-ha-brand-soft-foreground" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-lg">Agenti telefonici AI</CardTitle>
                  <CardDescription className="text-pretty">
                    Crea un agente per ciascuna base di conoscenza di questo tenant. Se la risposta non è sicura, la
                    chiamata passa all&apos;interno 200.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!voiceAgents ? (
                <Button variant="outline" onClick={prepareVoiceAgents} disabled={voicePreparing}>
                  {voicePreparing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Bot className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {voicePreparing ? "Preparazione…" : "Genera gli agenti dalle basi di conoscenza"}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-ha-brand/30 bg-ha-brand-soft/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Credenziale vocale 3CX</p>
                        <p className="mt-1 text-xs text-muted-foreground text-pretty">
                          È distinta dalla chiave CRM e autorizza solo gli endpoint vocali di questo tenant.
                        </p>
                      </div>
                      <Button variant="outline" onClick={rotateVoiceCredential} disabled={voiceRotating}>
                        {voiceRotating ? "Rotazione…" : "Ruota credenziale"}
                      </Button>
                    </div>

                    {voiceApiKey ? (
                      <div className="mt-3 grid gap-2">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Chiave vocale — mostrata solo ora</Label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 overflow-x-auto rounded-md border bg-background px-3 py-2 text-xs">{voiceApiKey}</code>
                          <Button variant="outline" size="icon" onClick={() => copy("Chiave vocale", voiceApiKey)} aria-label="Copia la chiave vocale">
                            <Copy className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                        {copied === "Chiave vocale" && <p className="text-xs text-ha-success">Copiata.</p>}
                        <p className="text-xs text-muted-foreground text-pretty">
                          Copiala nel parametro 3CX <code>HOTELACCELERATOR_VOICE_KEY</code>. Non inserirla nel template CRM,
                          non salvarla nello script e non inviarla in chat o negli screenshot.
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground text-pretty">
                        {voiceCredentialMessage || "Genera gli agenti per predisporre una credenziale vocale separata."}
                      </p>
                    )}
                  </div>

                  {voiceAgents.map((agent) => {
                    const ready = agent.status === "ready"
                    const statusText = agent.status === "ready" ? "Pronto" : "Senza fonti"
                    return (
                      <div key={agent.key} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium">{agent.label}</p>
                              <p className="text-xs text-muted-foreground">
                                Base di conoscenza collegata · fallback {agent.fallback_extension}
                              </p>
                            </div>
                          </div>
                          <Badge variant={ready ? "default" : "secondary"}>{statusText}</Badge>
                        </div>

                        <p className="mt-3 text-xs text-muted-foreground">
                          Base: <strong className="text-foreground">{agent.knowledge_base.name}</strong> ·{" "}
                          {agent.knowledge_base.source_count} fonti
                        </p>

                        {!ready && (
                          <p className="mt-3 text-xs text-destructive text-pretty">
                            Aggiungi almeno una fonte alla base prima di collegarla a 3CX.
                          </p>
                        )}

                        <div className="mt-3 flex items-start gap-2">
                          <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/50 px-3 py-2 text-[11px] leading-relaxed">
                            {agent.query_url}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copy(`Voce-${agent.key}`, agent.query_url)}
                            aria-label={`Copia il collegamento di ${agent.label}`}
                          >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                        {copied === `Voce-${agent.key}` && <p className="mt-1 text-xs text-ha-success">Copiato.</p>}
                      </div>
                    )
                  })}

                  {customerSupportAgents.length > 0 && (
                    <div className="rounded-lg border border-ha-brand/30 bg-ha-brand-soft/20 p-4">
                      <p className="font-medium">1 · Assistenza tecnica clienti</p>
                      <p className="mt-1 text-xs text-muted-foreground text-pretty">
                        Prima 3CX raccoglie le sette cifre del codice cliente, poi usa l&apos;URL del prodotto scelto. Se
                        l&apos;AI non risolve, la risposta indica se trasferire il chiamante o registrare un messaggio.
                      </p>
                      <div className="mt-3 space-y-2">
                        {customerSupportAgents.map((agent) => {
                          const messageUrl = supportMessageUrls[agent.key]
                          return (
                            <div key={`support-${agent.key}`} className="grid gap-2 rounded-md bg-background/70 p-2">
                              <p className="text-xs font-medium">{agent.label}</p>
                              <div className="flex items-start gap-2">
                                <code className="min-w-0 flex-1 break-all rounded border bg-muted/50 px-2 py-1 text-[10px] leading-relaxed">
                                  {agent.query_url}
                                </code>
                                <Button variant="outline" size="icon" onClick={() => copy(`Supporto-${agent.key}`, agent.query_url)} aria-label={`Copia URL supporto ${agent.label}`}>
                                  <Copy className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </div>
                              {messageUrl && (
                                <div className="flex items-start gap-2">
                                  <code className="min-w-0 flex-1 break-all rounded border bg-muted/50 px-2 py-1 text-[10px] leading-relaxed">
                                    {messageUrl}
                                  </code>
                                  <Button variant="outline" size="icon" onClick={() => copy(`Messaggio-${agent.key}`, messageUrl)} aria-label={`Copia callback messaggio ${agent.label}`}>
                                    <Copy className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {prospectAgents.length > 0 && (
                    <div className="rounded-lg border p-4">
                      <p className="font-medium">2 · Informazioni per non clienti</p>
                      <p className="mt-1 text-xs text-muted-foreground text-pretty">
                        Risposte su funzioni, caratteristiche e prezzi dalle sole basi commerciali 4 BID: non viene
                        richiesto né usato alcun codice cliente.
                      </p>
                      <div className="mt-3 space-y-2">
                        {prospectAgents.map((agent) => (
                          <div key={`prospect-${agent.key}`} className="flex items-start gap-2 rounded-md bg-muted/30 p-2">
                            <code className="min-w-0 flex-1 break-all text-[10px] leading-relaxed">{agent.query_url}</code>
                            <Button variant="outline" size="icon" onClick={() => copy(`Prospect-${agent.key}`, agent.query_url)} aria-label={`Copia URL informazioni ${agent.label}`}>
                              <Copy className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {voiceAgents?.length === 0 && (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Non ci sono basi di conoscenza in questo tenant. Creane una in AI → Knowledge Source, poi torna qui.
                </p>
              )}

              <p className="text-xs text-muted-foreground text-pretty leading-relaxed">
                Gli URL non contengono la chiave segreta. Lo script 3CX deve inviare la chiave di collegamento mostrata
                sopra nell&apos;intestazione X-HotelAccelerator-Key. Il testo della chiamata non viene salvato nel
                database da questo collegamento; il provider AI lo elabora secondo le proprie condizioni. Il codice
                cliente identifica il tenant ma non autorizza operazioni sensibili: per modifiche a dati, contratti o
                credenziali il flow 3CX deve richiedere una verifica aggiuntiva dell&apos;identita'.
              </p>
            </CardContent>
          </Card>

          <TelephonyExtensionsCard />

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
