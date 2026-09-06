"use client"

import Link from "next/link"
import useSWR from "swr"
import { CheckCircle2, CircleHelp, Database, ExternalLink, Loader2, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Capability = { key: string; label: string; state: "ready" | "available_not_mapped" | "not_available" | "unknown"; explanation: string }
type Action = { key: string; label: string; state: "ready" | "not_available" | "unknown"; explanation: string }
type Payload = {
  status: "ready" | "not_linked"
  provider: { name: string; code: string; connectionStatus: string } | null
  data: Capability[]
  actions: Action[]
  endpoints: Array<{ endpoint_path: string; entity: string | null; is_available: boolean }>
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: "include", cache: "no-store" })
  const body = (await response.json().catch(() => null)) as (Payload & { error?: string }) | null
  if (!response.ok || !body) throw new Error(body?.error ?? `HTTP ${response.status}`)
  return body
}

function StateBadge({ state }: { state: Capability["state"] }) {
  if (state === "ready") return <Badge className="gap-1"><CheckCircle2 className="size-3" />Sincronizzabile</Badge>
  if (state === "available_not_mapped") return <Badge variant="secondary">API disponibile, da mappare</Badge>
  if (state === "not_available") return <Badge variant="outline" className="gap-1"><XCircle className="size-3" />Non disponibile</Badge>
  return <Badge variant="outline" className="gap-1"><CircleHelp className="size-3" />Da verificare</Badge>
}

export default function PmsDataPage() {
  const { data, error, isLoading } = useSWR<Payload>("/api/crm/pms-capabilities", fetcher, { revalidateOnFocus: false })

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dati PMS</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Qui vedi solo ciò che il PMS della struttura può davvero scambiare con HotelAccelerator. I connettori e la normalizzazione sono gestiti da Santaddeo, senza duplicare integrazioni.</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/crm/pms-sync/gestionale">Apri il gestionale <ExternalLink className="ml-2 size-4" /></Link></Button>
      </header>

      {isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Controllo il PMS collegato…</div> : null}
      {error ? <Card><CardContent className="p-5 text-sm text-destructive">Impossibile leggere le capacità PMS: {error instanceof Error ? error.message : "errore sconosciuto"}</CardContent></Card> : null}

      {data?.status === "not_linked" ? (
        <Card><CardHeader><CardTitle className="text-base">PMS dati non collegato</CardTitle><CardDescription>La struttura non è ancora collegata al proprio tenant Santaddeo. Il browser PMS può continuare a funzionare indipendentemente.</CardDescription></CardHeader></Card>
      ) : null}

      {data?.status === "ready" && data.provider ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Database className="size-4" />{data.provider.name}</CardTitle>
              <CardDescription>{data.endpoints.filter((endpoint) => endpoint.is_available).length} endpoint verificati disponibili. Le funzioni sotto dipendono dall’adapter reale, non dal nome del PMS.</CardDescription>
            </CardHeader>
          </Card>

          <section className="space-y-3">
            <div><h2 className="text-lg font-semibold">Dati che possiamo usare</h2><p className="text-sm text-muted-foreground">Prenotazioni, cancellazioni, ospiti, contatti e gli altri dati compaiono solo quando realmente disponibili.</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              {data.data.map((item) => (
                <Card key={item.key}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{item.label}</CardTitle><StateBadge state={item.state} /></div></CardHeader><CardContent className="text-sm text-muted-foreground">{item.explanation}</CardContent></Card>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div><h2 className="text-lg font-semibold">Cosa possiamo inviare al PMS</h2><p className="text-sm text-muted-foreground">Preventivi, prenotazioni, servizi e modifiche vengono abilitate solo quando il connettore le implementa davvero.</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              {data.actions.map((item) => (
                <Card key={item.key}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{item.label}</CardTitle><StateBadge state={item.state} /></div></CardHeader><CardContent className="text-sm text-muted-foreground">{item.explanation}</CardContent></Card>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
