"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Monitor, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"

type Stato = {
  configurata: boolean
  config: { name: string; webUrl: string; isActive: boolean; updatedAt: string } | null
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: "include" })
  const body = (await response.json().catch(() => null)) as (Stato & { error?: string }) | null
  if (!response.ok || !body) throw new Error(body?.error ?? `GET ${url} -> ${response.status}`)
  return body
}

export default function PmsBrowserConfigPage() {
  const { data, error, isLoading, mutate } = useSWR<Stato>("/api/crm/pms-browser-config", fetcher, {
    revalidateOnFocus: false,
  })
  const [name, setName] = useState("")
  const [webUrl, setWebUrl] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data || initialized) return
    setName(data.config?.name ?? "")
    setWebUrl(data.config?.webUrl ?? "")
    setIsActive(data.config?.isActive ?? true)
    setInitialized(true)
  }, [data, initialized])

  async function salva() {
    setSaving(true)
    try {
      const response = await fetch("/api/crm/pms-browser-config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, webUrl, isActive }),
      })
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!response.ok || !body?.ok) {
        toast.error(body?.error ?? `Salvataggio non riuscito (HTTP ${response.status})`)
        return
      }
      toast.success("Accesso browser al gestionale salvato")
      await mutate()
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Salvataggio non riuscito")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Carico la configurazione…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Configurazione non leggibile</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : "Errore sconosciuto"}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="mt-1 shrink-0">
          <Link href="/admin/crm/pms-sync/gestionale" aria-label="Torna al gestionale">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Accesso browser al PMS</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Indica quale pagina deve aprire la macchina remota. HotelAccelerator non deve conoscere il fornitore e non
            richiede credenziali o API key del gestionale.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="size-4" aria-hidden="true" />
              Gestionale da aprire
            </CardTitle>
            {data.configurata && data.config?.isActive ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Configurato
              </Badge>
            ) : (
              <Badge variant="outline">Da configurare</Badge>
            )}
          </div>
          <CardDescription>
            Nessun valore viene scelto automaticamente: nome e indirizzo appartengono alla singola struttura.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pms-name">Nome del gestionale</Label>
            <Input
              id="pms-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome visualizzato alla struttura"
              maxLength={100}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pms-web-url">Indirizzo della pagina di accesso</Label>
            <Input
              id="pms-web-url"
              type="url"
              value={webUrl}
              onChange={(event) => setWebUrl(event.target.value)}
              placeholder="https://…"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="pms-web-url-help"
            />
            <p id="pms-web-url-help" className="text-xs leading-relaxed text-muted-foreground">
              Copia l’indirizzo della pagina che normalmente apri per entrare nel PMS. Username e password verranno
              digitati direttamente nel gestionale, dentro il browser remoto.
            </p>
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="pms-browser-active">Accesso browser attivo</Label>
              <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                Se disattivato, HotelAccelerator non avvia la macchina remota per questa struttura.
              </p>
            </div>
            <Switch id="pms-browser-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void salva()} disabled={saving || !name.trim() || !webUrl.trim()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              Salva
            </Button>
            {data.configurata ? (
              <Button asChild variant="outline">
                <Link href="/admin/crm/pms-sync/gestionale">
                  Apri il gestionale
                  <ExternalLink className="ml-2 size-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Credenziali separate
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          HotelAccelerator salva soltanto nome e indirizzo della pagina. L’accesso al PMS resta nel profilo browser
          riservato alla struttura. Un eventuale connettore API è indipendente e non è necessario per usare il
          gestionale incorporato.
        </CardContent>
      </Card>
    </main>
  )
}
