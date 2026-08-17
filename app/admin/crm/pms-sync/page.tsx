"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

type Conflitto = {
  id: string
  field: string
  value: string
  current_value: string | null
  source: string
  seen_count: number
  contact_id: string
}

type Passata = {
  id: string
  direction: string
  started_at: string
  status: string
  guests_seen: number
  contacts_matched: number
  fields_filled: number
  conflicts_found: number
  error_text: string | null
}

type Stato = {
  provider: {
    name: string
    fake: boolean
    connessione: { ok: boolean; detail: string }
  }
  interruttori: Record<string, boolean>
  rubrica: { contatti: number; conTelefono: number; senzaTelefono: number }
  conflitti: Conflitto[]
  passate: Passata[]
  codaScrittura: Record<string, number>
}

type Esito = {
  fake: boolean
  ospitiLetti: number
  contattiAbbinati: number
  contattiCreati: number
  campiRiempiti: number
  conflittiTrovati: number
  scrittureInAnteprima: number
  scrittureInviate: number
  avvisi: string[]
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.json() as Promise<Stato>
}

const ETICHETTE_CAMPO: Record<string, string> = {
  phone: "Telefono",
  email: "Email",
  name: "Nome",
  city: "Citta",
  country: "Paese",
  company: "Azienda",
  language: "Lingua",
}

const INTERRUTTORI: Array<{ chiave: string; titolo: string; spiegazione: string; delicato?: boolean }> = [
  {
    chiave: "write_contacts",
    titolo: "Telefono ed email",
    spiegazione: "Scrive nel PMS i contatti che la nostra rubrica ha e Scidoo no. Non sostituisce mai un dato esistente.",
  },
  {
    chiave: "write_tags",
    titolo: "Tag e segmenti",
    spiegazione: "Porta nella scheda ospite le etichette del CRM, senza toccare i dati anagrafici.",
  },
  {
    chiave: "write_notes",
    titolo: "Note e storico contatti",
    spiegazione: "Aggiunge alla scheda le interazioni avvenute fuori dal PMS: telefonate ed email.",
  },
  {
    chiave: "write_consents",
    titolo: "Consensi",
    spiegazione:
      "Scrivere un consenso e una dichiarazione formale. Una revoca documentata viene sempre propagata; un consenso mai dichiarato non viene inventato.",
    delicato: true,
  },
]

function dataOra(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

export default function PmsSyncPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/crm/pms-sync", fetcher, { revalidateOnFocus: false })
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState<Esito | null>(null)

  async function provaAVuoto() {
    setInCorso(true)
    try {
      const res = await fetch("/api/crm/pms-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dryRun: true }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `errore ${res.status}`)
      setEsito(j.esito as Esito)
      toast.success("Prova a vuoto completata: nessun dato e stato scritto")
      void mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Prova non riuscita")
    } finally {
      setInCorso(false)
    }
  }

  async function cambiaInterruttore(chiave: string, valore: boolean) {
    try {
      const res = await fetch("/api/crm/pms-sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [chiave]: valore }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `errore ${res.status}`)
      toast.success(valore ? "Scrittura attivata" : "Scrittura disattivata")
      void mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Interruttore non salvato")
    }
  }

  async function decidi(id: string, resolution: string) {
    try {
      const res = await fetch("/api/crm/pms-sync", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, resolution }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `errore ${res.status}`)
      toast.success("Decisione registrata")
      void mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decisione non registrata")
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <XCircle className="h-4 w-4 text-destructive" />
              Stato non leggibile
            </CardTitle>
            <CardDescription>{error instanceof Error ? error.message : "Errore sconosciuto"}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const { provider, interruttori, rubrica, conflitti, passate } = data
  const coperturaTelefono = rubrica.contatti > 0 ? Math.round((rubrica.conTelefono / rubrica.contatti) * 100) : 0

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/admin/crm"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna al CRM
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Anagrafiche e PMS</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Unisce la rubrica del CRM con le schede ospite di Scidoo. Un campo vuoto viene riempito dall&apos;altro
              sistema; due valori diversi non vengono toccati e finiscono qui sotto, da rivedere.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void mutate()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Aggiorna
          </Button>
        </div>
      </header>

      {provider.fake ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Nessuna credenziale Scidoo: fornitore di prova
            </CardTitle>
            <CardDescription className="leading-relaxed">
              I dati mostrati vengono da un fornitore finto, utile solo a collaudare le regole. La scrittura in rubrica e
              verso il PMS resta impedita finche non arriva il codice autorizzativo rilasciato da Scidoo dopo
              l&apos;approvazione della struttura.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Perche questa pagina esiste</CardTitle>
          <CardDescription>Misurato adesso sulla rubrica di questa struttura.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-semibold tabular-nums">{rubrica.contatti}</span>
              <span className="text-sm text-muted-foreground">contatti in rubrica</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-semibold tabular-nums">{rubrica.conTelefono}</span>
              <span className="text-sm text-muted-foreground">con un numero di telefono</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-semibold tabular-nums text-destructive">{rubrica.senzaTelefono}</span>
              <span className="text-sm text-muted-foreground">senza telefono: non richiamabili</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(coperturaTelefono, 1)}%` }} />
            </div>
            <span className="text-sm font-medium tabular-nums">{coperturaTelefono}%</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Finche questa copertura resta vicina a zero, chi chiama continua a comparire come numero sconosciuto: il
            collegamento tra telefonate e rubrica funziona gia, manca il dato.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connessione</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{provider.name}</span>
            {provider.fake ? <Badge variant="outline">di prova</Badge> : <Badge variant="secondary">Scidoo</Badge>}
            {provider.connessione.ok ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                raggiungibile
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                non raggiungibile
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{provider.connessione.detail}</p>
          <Separator />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void provaAVuoto()} disabled={inCorso} className="gap-2">
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Prova a vuoto
            </Button>
            <span className="text-sm text-muted-foreground">
              Legge, confronta e dice cosa farebbe. Non scrive nulla, da nessuna parte.
            </span>
          </div>
        </CardContent>
      </Card>

      {esito ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cosa sarebbe accaduto</CardTitle>
            <CardDescription>Esito dell&apos;ultima prova a vuoto.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { etichetta: "Ospiti letti dal PMS", valore: esito.ospitiLetti },
                { etichetta: "Abbinati a un contatto", valore: esito.contattiAbbinati },
                { etichetta: "Campi che verrebbero riempiti", valore: esito.campiRiempiti },
                { etichetta: "Valori diversi da rivedere", valore: esito.conflittiTrovati },
              ].map((v) => (
                <div key={v.etichetta} className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xl font-semibold tabular-nums">{v.valore}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{v.etichetta}</span>
                </div>
              ))}
            </div>
            {esito.avvisi.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {esito.avvisi.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm leading-relaxed">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cosa scriviamo dentro Scidoo</CardTitle>
          <CardDescription>
            Tutti spenti all&apos;inizio, deliberatamente: prima si misura quanti ospiti si abbinano davvero, poi si
            accende una voce alla volta.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {INTERRUTTORI.map((i) => {
            const attivo = interruttori?.[i.chiave] === true
            return (
              <div key={i.chiave} className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={i.chiave} className="flex items-center gap-2 text-sm font-medium">
                    {i.titolo}
                    {i.delicato ? (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <ShieldAlert className="h-3 w-3" />
                        delicato
                      </Badge>
                    ) : null}
                  </Label>
                  <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{i.spiegazione}</p>
                </div>
                <Switch
                  id={i.chiave}
                  checked={attivo}
                  onCheckedChange={(v) => void cambiaInterruttore(i.chiave, v)}
                  aria-label={i.titolo}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Valori diversi da rivedere</CardTitle>
          <CardDescription>
            Nessuno di questi ha sovrascritto il dato in rubrica. Sono affiancati in attesa di una decisione.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conflitti.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleSlash className="h-4 w-4" />
              Nessun valore in conflitto.
            </div>
          ) : (
            <ul className="flex flex-col divide-y">
              {conflitti.map((c) => (
                <li key={c.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{ETICHETTE_CAMPO[c.field] ?? c.field}</Badge>
                    {c.seen_count > 1 ? (
                      <span className="text-xs text-muted-foreground">visto {c.seen_count} volte</span>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1 rounded-lg border p-3">
                      <span className="text-xs text-muted-foreground">In rubrica (conservato)</span>
                      <span className="text-sm font-medium">{c.current_value ?? "(vuoto)"}</span>
                    </div>
                    <div className="flex flex-col gap-1 rounded-lg border border-dashed p-3">
                      <span className="text-xs text-muted-foreground">Dal PMS</span>
                      <span className="text-sm font-medium">{c.value}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void decidi(c.id, "kept_current")}>
                      Tengo il nostro
                    </Button>
                    <Button size="sm" onClick={() => void decidi(c.id, "promoted_alternate")}>
                      Vale quello del PMS
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void decidi(c.id, "both_valid")}>
                      Validi entrambi
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Passate recenti</CardTitle>
        </CardHeader>
        <CardContent>
          {passate.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna passata registrata.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {passate.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{dataOra(p.started_at)}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.guests_seen} ospiti letti, {p.contacts_matched} abbinati, {p.fields_filled} campi riempiti,{" "}
                      {p.conflicts_found} conflitti
                    </span>
                    {p.error_text ? <span className="text-xs text-destructive">{p.error_text}</span> : null}
                  </div>
                  <Badge variant={p.status === "ok" ? "secondary" : "destructive"}>
                    {p.status === "ok" ? "completata" : p.status === "running" ? "in corso" : "errore"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
