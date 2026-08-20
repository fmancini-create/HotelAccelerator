"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldAlert, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

type Fornitore = { slug: string; etichetta: string; baseUrlPredefinito: string | null }

type Config = {
  pmsType: string | null
  nome: string | null
  apiUrl: string | null
  propertyCode: string | null
  webUrl: string | null
  isActive: boolean
  segretoPresente: boolean
  segretoCifrato: boolean | null
  ultimaPassata: string | null
  ultimoEsito: string | null
  ultimoErrore: string | null
}

type Stato = { configurata: boolean; config: Config | null; fornitori: Fornitore[] }

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.json() as Promise<Stato>
}

export default function PmsConfigPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/crm/pms-config", fetcher, { revalidateOnFocus: false })

  const [apiUrl, setApiUrl] = useState("")
  const [authCode, setAuthCode] = useState("")
  const [propertyCode, setPropertyCode] = useState("")
  const [webUrl, setWebUrl] = useState("")
  const [isActive, setIsActive] = useState(false)
  const [mostraCodice, setMostraCodice] = useState(false)
  const [salvataggio, setSalvataggio] = useState(false)
  const [precompilato, setPrecompilato] = useState(false)

  const fornitore = data?.fornitori?.[0] ?? null

  // I campi si precompilano UNA volta sola, quando arrivano i dati: rifarlo a
  // ogni rivalidazione cancellerebbe quello che si sta scrivendo.
  useEffect(() => {
    if (!data || precompilato) return
    setApiUrl(data.config?.apiUrl ?? fornitore?.baseUrlPredefinito ?? "")
    setPropertyCode(data.config?.propertyCode ?? "")
    // Nessun valore suggerito: l'indirizzo del gestionale cambia da struttura a
    // struttura e non lo conosciamo. Un predefinito "plausibile" aprirebbe la
    // cornice sul sito sbagliato.
    setWebUrl(data.config?.webUrl ?? "")
    setIsActive(data.config?.isActive ?? true)
    setPrecompilato(true)
  }, [data, precompilato, fornitore])

  async function salva() {
    if (!fornitore) return
    setSalvataggio(true)
    try {
      const res = await fetch("/api/crm/pms-config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pmsType: fornitore.slug,
          apiUrl,
          // Vuoto = non lo sto cambiando. La rotta conserva quello già salvato.
          authCode,
          propertyCode,
          webUrl,
          isActive,
        }),
      })
      const corpo = (await res.json()) as { ok?: boolean; error?: string; segretoAggiornato?: boolean }
      if (!res.ok || !corpo.ok) {
        toast.error(corpo.error ?? `Salvataggio non riuscito (HTTP ${res.status})`)
        return
      }
      setAuthCode("")
      toast.success(
        corpo.segretoAggiornato
          ? "Configurazione e codice salvati. Ora prova la connessione."
          : "Configurazione salvata. Il codice già presente non è stato modificato.",
      )
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito")
    } finally {
      setSalvataggio(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
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
            <CardDescription className="leading-relaxed">
              {error instanceof Error ? error.message : "Errore sconosciuto"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="mt-1 shrink-0">
          <Link href="/admin/crm/pms-sync" aria-label="Torna a Anagrafiche e PMS">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Collegamento al PMS</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Le credenziali del gestionale servono a leggere le anagrafiche degli ospiti e completare la rubrica del CRM.
            Il codice autorizzativo viene cifrato prima di essere salvato e non viene più restituito a questa pagina.
          </p>
        </div>
      </div>

      {!fornitore ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Nessun connettore disponibile</CardTitle>
            <CardDescription className="leading-relaxed">
              Il registro dei connettori è vuoto: non c&apos;è nessun PMS che questo sistema sappia interrogare.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Credenziali</CardTitle>
                {data.configurata ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Già configurato
                  </Badge>
                ) : (
                  <Badge variant="outline">Mai configurato</Badge>
                )}
              </div>
              <CardDescription className="leading-relaxed">
                Fornitore: <span className="font-medium text-foreground">{fornitore.etichetta}</span>. È l&apos;unico
                gestionale per cui esiste un connettore, quindi non c&apos;è una scelta da fare.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="apiUrl">Indirizzo API</Label>
                <Input
                  id="apiUrl"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder={fornitore.baseUrlPredefinito ?? "https://…"}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Se lo lasci vuoto viene usato l&apos;indirizzo standard del fornitore. Deve essere https: il codice
                  autorizzativo viaggia a ogni chiamata e su http sarebbe leggibile in rete.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="authCode">Codice autorizzativo (Api-Key)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="authCode"
                    type={mostraCodice ? "text" : "password"}
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder={
                      data.config?.segretoPresente ? "Già salvato — lascia vuoto per non cambiarlo" : "Incolla qui il codice"
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setMostraCodice((v) => !v)}
                    aria-label={mostraCodice ? "Nascondi il codice" : "Mostra il codice"}
                  >
                    {mostraCodice ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {data.config?.segretoPresente
                    ? "Un codice è già salvato. Questo campo resta vuoto di proposito: il codice non viene rimandato al browser. Scrivine uno nuovo solo per sostituirlo."
                    : "Lo rilascia il fornitore del gestionale. Viene cifrato prima del salvataggio."}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="propertyCode">Codice struttura presso il fornitore (facoltativo)</Label>
                <Input
                  id="propertyCode"
                  value={propertyCode}
                  onChange={(e) => setPropertyCode(e.target.value)}
                  placeholder="Solo se il fornitore lo richiede"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="webUrl">Indirizzo web del gestionale (facoltativo)</Label>
                <Input
                  id="webUrl"
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  placeholder="https://..."
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="webUrl-aiuto"
                />
                <p id="webUrl-aiuto" className="text-xs leading-relaxed text-muted-foreground">
                  {
                    "L'indirizzo che apri nel browser per lavorare nel gestionale, non quello dell'API qui sopra. Serve solo per aprire il gestionale dentro HotelAccelerator: se lo lasci vuoto, quella schermata resta spenta e lo dichiara."
                  }
                </p>
              </div>

              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="isActive">Collegamento attivo</Label>
                  <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                    Se spento, la sincronizzazione torna al fornitore di prova e la pagina delle anagrafiche mostra dati
                    finti, dichiarandolo.
                  </p>
                </div>
                <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
              </div>

              {data.config?.segretoCifrato === false ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-xs leading-relaxed">
                    Il codice salvato non risulta cifrato: è un dato vecchio, scritto prima che la cifratura esistesse.
                    Reinseriscilo qui sopra per salvarlo cifrato.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={salva} disabled={salvataggio}>
                  {salvataggio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Salva
                </Button>
                <Button asChild variant="outline">
                  <Link href="/admin/crm/pms-sync">Vai a provare la connessione</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4" />
                Cosa aspettarsi
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                Salvare le credenziali non muove ancora nessun dato. Dalla pagina delle anagrafiche puoi fare una{" "}
                <span className="font-medium text-foreground">prova a vuoto</span>: legge dal gestionale, confronta con la
                rubrica e dice cosa farebbe, senza scrivere niente.
              </p>
              <p>
                Il connettore {fornitore.etichetta} sa soltanto{" "}
                <span className="font-medium text-foreground">leggere</span>. Nessun dato del CRM viene scritto dentro il
                gestionale: gli interruttori di scrittura restano bloccati, con il motivo spiegato nella pagina delle
                anagrafiche.
              </p>
              {data.config?.ultimoErrore ? (
                <p className="text-destructive">Ultimo errore registrato: {data.config.ultimoErrore}</p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  )
}
