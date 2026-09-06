"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, CalendarRange, Check, Globe, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { FASI, type FaseKey } from "@/lib/crm/date-requests"

/**
 * Pipeline — le richieste di date VERE, lette da `contact_date_requests`.
 *
 * COSA C'ERA PRIMA: sei trattative inventate ("Grand Hotel Roma € 7.200"...) e
 * poi, dopo la prima correzione, un avviso che diceva «nessuna tabella dove
 * registrare un'opportunità». QUELL'AVVISO ERA SBAGLIATO: la tabella
 * `contact_date_requests` esisteva già, con le colonne esatte di una richiesta
 * alberghiera. Non l'avevo trovata perché cercavo "deal", "opportunity" e
 * "pipeline" — parole da CRM generico — invece di "date_request". Un elenco di
 * tabelle letto per intero l'avrebbe mostrata subito.
 *
 * DUE BLOCCHI, MAI SOMMATI: le prenotazioni arrivate dal sito (notifiche del
 * gestionale) stanno in un blocco separato e non entrano nei conteggi per fase.
 * Se fossero mescolate, la pagina direbbe che il lavoro commerciale ha chiuso
 * 181 richieste su 200, mentre quelle scritte da persone sono 27.
 *
 * Nessuna colonna "valore" precompilata: le estrazioni non contengono prezzi
 * (verificato su tutti i 1.333 payload), quindi la tariffa si scrive a mano.
 *
 * LA FASE NON È PIÙ DEDOTTA DALL'ESITO, e la pagina non lo dice più. Prima
 * questa intestazione prometteva «la fase dedotta dall'esito»: era vero e
 * sbagliato insieme. Misurando, gli esiti letti dall'IA sulle righe di persone
 * erano {aperta: 14, confermata: 4}, ma dentro quei numeri convivono lead veri e
 * fornitori: "Chiusura TUS114A" di Topcruises compariva in **Confermata** e il
 * caseificio in **Richiesta aperta**. La pagina raccontava vendite che nessuno
 * ha fatto. Ora tutto nasce in "Da qualificare" e solo una persona sposta le
 * righe; l'esito dell'IA resta visibile come nota.
 */

interface Richiesta {
  id: string
  conversation_id: string | null
  requested_check_in: string | null
  requested_check_out: string | null
  nights: number | null
  guests_adults: number | null
  outcome: string | null
  source: string | null
  quoted_rate_cents: number | null
  stage: string | null
  stage_set_at: string | null
  fase: FaseKey
  chi: string | null
  canale: string | null
  oggetto: string | null
  /** Cosa ha letto l'IA. Si mostra come nota, non colloca la riga. */
  nota_ia: string | null
}

interface Risposta {
  richieste: Richiesta[]
  acquisite: Richiesta[]
  riepilogo: {
    totale: number
    richieste: number
    acquisite: number
    per_fase: Record<FaseKey, number>
    senza_data: number
    escluse: { interne: number; prove: number }
    conferme_da_oggetto: number
    troncato: boolean
  }
}

function euro(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
}

function dataBreve(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })
}

const COLORE_FASE: Record<FaseKey, string> = {
  da_qualificare: "bg-muted text-muted-foreground",
  aperta: "bg-primary/10 text-primary",
  preventivo_inviato: "bg-primary/20 text-primary",
  confermata: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  persa: "bg-destructive/10 text-destructive",
}

/** Campo tariffa: si apre solo sulla riga che si sta modificando. */
function CellaTariffa({
  riga,
  onSalvato,
}: {
  riga: Richiesta
  onSalvato: (id: string, aggiornamenti: Partial<Richiesta>) => void
}) {
  const [aperto, setAperto] = useState(false)
  const [valore, setValore] = useState("")
  const [salvataggio, setSalvataggio] = useState(false)
  const [errore, setErrore] = useState("")

  const apri = () => {
    setValore(riga.quoted_rate_cents !== null ? String(Math.round(riga.quoted_rate_cents / 100)) : "")
    setErrore("")
    setAperto(true)
  }

  const salva = async () => {
    const testo = valore.trim().replace(",", ".")
    // Campo vuoto = cancella la tariffa. Un importo con i centesimi viene
    // arrotondato, non rifiutato: l'operatore scrive "120,50" e funziona.
    let cents: number | null = null
    if (testo !== "") {
      const n = Number(testo)
      if (!Number.isFinite(n) || n < 0) {
        setErrore("Importo non valido")
        return
      }
      cents = Math.round(n * 100)
    }
    setSalvataggio(true)
    setErrore("")
    try {
      const res = await fetch("/api/admin/crm/pipeline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: riga.id, tariffa_cents: cents }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setErrore(body?.error || "Salvataggio non riuscito")
        return
      }
      // La fase arriva DAL SERVER: calcolarla qui creerebbe una seconda regola,
      // e le due potrebbero divergere facendo saltare la riga in un'altra fase
      // al primo ricarico.
      onSalvato(riga.id, { quoted_rate_cents: body.quoted_rate_cents ?? null, fase: body.fase as FaseKey })
      setAperto(false)
    } catch {
      setErrore("Server non raggiungibile")
    } finally {
      setSalvataggio(false)
    }
  }

  if (!aperto) {
    return (
      <button
        type="button"
        onClick={apri}
        className="rounded px-2 py-1 text-left tabular-nums underline decoration-dotted underline-offset-2 hover:bg-muted/40"
        aria-label={
          riga.quoted_rate_cents !== null
            ? `Modifica la tariffa preventivata, attualmente ${euro(riga.quoted_rate_cents)}`
            : "Inserisci la tariffa preventivata"
        }
      >
        {riga.quoted_rate_cents !== null ? (
          euro(riga.quoted_rate_cents)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          value={valore}
          onChange={(e) => setValore(e.target.value)}
          onKeyDown={(e) => {
            // `isComposing` protegge gli IME: Invio può confermare la
            // composizione invece di inviare il valore.
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) void salva()
            if (e.key === "Escape") setAperto(false)
          }}
          inputMode="decimal"
          placeholder="euro"
          aria-label="Tariffa preventivata in euro"
          className="h-8 w-24"
          autoFocus
          disabled={salvataggio}
        />
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => void salva()} disabled={salvataggio}>
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Salva tariffa</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={() => setAperto(false)}
          disabled={salvataggio}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Annulla</span>
        </Button>
      </div>
      {errore ? (
        <span className="text-xs text-destructive" role="alert">
          {errore}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Selettore di fase: è l'azione che rende "Da qualificare" un punto di partenza
 * invece di un vicolo cieco.
 *
 * Un `select` nativo e non un menu costruito a mano: funziona da tastiera, con
 * i lettori di schermo e sul telefono senza che io debba rifare tre
 * comportamenti che il browser già dà giusti.
 */
function CellaFase({
  riga,
  onSalvato,
}: {
  riga: Richiesta
  onSalvato: (id: string, aggiornamenti: Partial<Richiesta>) => void
}) {
  const [salvataggio, setSalvataggio] = useState(false)
  const [errore, setErrore] = useState("")

  const cambia = async (valore: string) => {
    setSalvataggio(true)
    setErrore("")
    try {
      const res = await fetch("/api/admin/crm/pipeline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Stringa vuota = "riportala fra le non decise", che nel database è
        // `stage` nullo insieme ad autore e istante.
        body: JSON.stringify({ id: riga.id, fase: valore === "" ? null : valore }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setErrore(body?.error || "Salvataggio non riuscito")
        return
      }
      onSalvato(riga.id, { fase: body.fase as FaseKey, stage: body.stage ?? null, stage_set_at: body.stage_set_at ?? null })
    } catch {
      setErrore("Server non raggiungibile")
    } finally {
      setSalvataggio(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={riga.stage ?? ""}
        onChange={(e) => void cambia(e.target.value)}
        disabled={salvataggio}
        aria-label={`Fase della richiesta di ${riga.chi ?? "contatto senza nome"}`}
        className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${COLORE_FASE[riga.fase]} disabled:opacity-50`}
      >
        <option value="">Da qualificare</option>
        {FASI.filter((f) => f.key !== "da_qualificare").map((f) => (
          <option key={f.key} value={f.key}>
            {f.etichetta}
          </option>
        ))}
      </select>
      {/* La nota dell'IA sta SOTTO la fase e dice chi l'ha detta: senza
          l'attribuzione sembrerebbe un dato certo invece di una lettura. */}
      {riga.nota_ia ? <span className="text-[11px] text-muted-foreground">{riga.nota_ia}</span> : null}
      {errore ? (
        <span className="text-xs text-destructive" role="alert">
          {errore}
        </span>
      ) : null}
    </div>
  )
}

export default function CrmPipelinePage() {
  const [dati, setDati] = useState<Risposta | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState("")
  const [filtro, setFiltro] = useState<FaseKey | null>(null)

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore("")
    try {
      const res = await fetch("/api/admin/crm/pipeline")
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        // Un errore di lettura non deve diventare "nessuna richiesta": sono due
        // cose diverse, e confonderle farebbe credere che non ci sia lavoro da
        // fare quando invece non è stato possibile leggerlo.
        setErrore(
          res.status === 401
            ? "Sessione scaduta: ricarica la pagina per rientrare."
            : res.status === 403
              ? "Non hai il permesso per l'area CRM."
              : body?.error || "Non è stato possibile leggere la pipeline.",
        )
        setDati(null)
        return
      }
      setDati((await res.json()) as Risposta)
    } catch {
      setErrore("Non è stato possibile contattare il server.")
      setDati(null)
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const aggiornaRiga = useCallback((id: string, aggiornamenti: Partial<Richiesta>) => {
    setDati((prec) => {
      if (!prec) return prec
      const richieste = prec.richieste.map((r) => (r.id === id ? { ...r, ...aggiornamenti } : r))
      // I conteggi per fase si RICALCOLANO dalle righe, e l'elenco delle fasi
      // viene da FASI: scriverle a mano qui significherebbe dimenticarne una
      // alla prossima aggiunta, e quella colonna resterebbe a zero per sempre.
      const per_fase = Object.fromEntries(FASI.map((f) => [f.key, 0])) as Record<FaseKey, number>
      for (const r of richieste) per_fase[r.fase] += 1
      return { ...prec, richieste, riepilogo: { ...prec.riepilogo, per_fase } }
    })
  }, [])

  const r = dati?.riepilogo
  const visibili = useMemo(() => {
    const tutte = dati?.richieste ?? []
    return filtro ? tutte.filter((x) => x.fase === filtro) : tutte
  }, [dati, filtro])

  // Tutte le fasi si mostrano sempre. Prima "Persa" compariva solo se piena,
  // perché nessuna estrazione produceva quell'esito e una colonna eternamente
  // vuota suggeriva un dato inesistente. Ora la fase la decide una persona:
  // ogni colonna è raggiungibile, e nasconderne una nasconderebbe un'azione
  // possibile invece di un dato mancante.
  const fasiDaMostrare = FASI

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground text-pretty">
            Le richieste di date lette nelle conversazioni. Nascono tutte da qualificare: la fase la decidi tu.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void carica()} disabled={caricamento}>
          <RefreshCw className={`mr-2 h-4 w-4 ${caricamento ? "animate-spin" : ""}`} aria-hidden="true" />
          Aggiorna
        </Button>
      </div>

      {caricamento && !dati ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : errore ? (
        <Card>
          <CardContent className="p-6">
            <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-pretty">{errore}</span>
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Conteggi per fase: calcolati SOLO sulle richieste lavorabili. */}
          <div className="flex flex-wrap gap-2">
            {fasiDaMostrare.map((f) => {
              const n = r?.per_fase[f.key] ?? 0
              const attivo = filtro === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFiltro(attivo ? null : f.key)}
                  title={f.descrizione}
                  aria-pressed={attivo}
                  className={`min-w-28 rounded-lg border px-3 py-2 text-left transition-colors ${
                    attivo ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                  }`}
                >
                  <span className="block text-xs text-muted-foreground">{f.etichetta}</span>
                  <span className="block text-lg font-semibold tabular-nums">{n}</span>
                </button>
              )
            })}
          </div>

          {visibili.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CalendarRange className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  {filtro ? "Nessuna richiesta in questa fase" : "Nessuna richiesta da lavorare"}
                </p>
                <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground text-pretty leading-relaxed">
                  {filtro ? (
                    <>
                      Le altre fasi contengono{" "}
                      <span className="tabular-nums text-foreground">{r?.richieste ?? 0}</span> richieste in tutto.
                    </>
                  ) : (
                    <>
                      Questo elenco raccoglie le richieste di date scritte da persone, estratte dalle conversazioni. Le
                      prenotazioni che arrivano dal sito sono nel blocco più sotto.
                    </>
                  )}
                </p>
                {filtro ? (
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setFiltro(null)}>
                    Mostra tutte
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <caption className="sr-only">
                      Richieste di date estratte dalle conversazioni, con fase, soggiorno e tariffa preventivata
                    </caption>
                    <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Fase
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Chi
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Arrivo
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Partenza
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Notti
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Ospiti
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Tariffa preventivata
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibili.map((x) => {
                        return (
                          <tr key={x.id} className="hover:bg-muted/20">
                            <td className="px-4 py-3 align-top">
                              <CellaFase riga={x} onSalvato={aggiornaRiga} />
                            </td>
                            <td className="px-4 py-3 align-top font-medium">
                              {x.conversation_id ? (
                                <Link
                                  href={`/admin/inbox?conversation=${x.conversation_id}`}
                                  className="hover:underline"
                                >
                                  {x.chi ?? "Senza nome"}
                                </Link>
                              ) : (
                                (x.chi ?? "Senza nome")
                              )}
                              {x.canale ? <span className="ml-2 text-xs text-muted-foreground">{x.canale}</span> : null}
                              {/* L'oggetto è ciò che permette di capire in un
                                  colpo d'occhio se è un cliente o un fornitore:
                                  senza di esso "Da qualificare" sarebbe un
                                  elenco di nomi da aprire uno per uno. */}
                              {x.oggetto ? (
                                <span className="mt-0.5 block max-w-[22rem] truncate text-xs text-muted-foreground">
                                  {x.oggetto}
                                </span>
                              ) : null}
                            </td>
                            {/* "Date non estratte" è diverso da una data vuota:
                                alcune richieste hanno un esito ma nessuna data,
                                e dirlo indica che vanno lette a mano. */}
                            <td className="px-4 py-3 tabular-nums">
                              {x.requested_check_in ? (
                                dataBreve(x.requested_check_in)
                              ) : (
                                <span className="text-xs text-muted-foreground">date non estratte</span>
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-muted-foreground">
                              {dataBreve(x.requested_check_out)}
                            </td>
                            <td className="px-4 py-3 tabular-nums">{x.nights ?? "—"}</td>
                            <td className="px-4 py-3 tabular-nums">{x.guests_adults ?? "—"}</td>
                            <td className="px-4 py-3">
                              <CellaTariffa riga={x} onSalvato={aggiornaRiga} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t px-4 py-3 text-xs text-muted-foreground text-pretty leading-relaxed">
                  <span className="tabular-nums text-foreground">{r?.richieste ?? 0}</span> richieste scritte da persone,
                  di cui <span className="tabular-nums text-foreground">{r?.senza_data ?? 0}</span> senza date estratte.
                  Nessuna fase è dedotta automaticamente: l&apos;esito letto dall&apos;IA è mostrato come nota perché
                  fra queste righe convivono clienti veri e fornitori, e nessun segnale li distingue. La tariffa si
                  inserisce a mano perché le conversazioni non contengono prezzi.
                  {/* Le esclusioni si DICHIARANO. Un elenco che nasconde righe
                      senza dirlo è indistinguibile da un elenco incompleto. */}
                  {(r?.escluse.interne ?? 0) + (r?.escluse.prove ?? 0) > 0 ? (
                    <>
                      {" "}
                      Escluse <span className="tabular-nums text-foreground">{r?.escluse.interne ?? 0}</span> pratiche
                      interne e <span className="tabular-nums text-foreground">{r?.escluse.prove ?? 0}</span>{" "}
                      conversazioni di prova.
                    </>
                  ) : null}
                  {(r?.conferme_da_oggetto ?? 0) > 0 ? (
                    <>
                      {" "}
                      <span className="tabular-nums text-foreground">{r?.conferme_da_oggetto ?? 0}</span> conferme del
                      gestionale riconosciute dall&apos;oggetto sono nel blocco delle acquisite.
                    </>
                  ) : null}
                  {r?.troncato ? " Elenco parziale: lette le prime 5.000 richieste." : ""}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Secondo blocco: dichiarato, separato, non sommato al primo. */}
          {(r?.acquisite ?? 0) > 0 ? (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      <span className="tabular-nums">{r?.acquisite ?? 0}</span> prenotazioni acquisite dal sito
                    </p>
                    <p className="max-w-2xl text-sm text-muted-foreground text-pretty leading-relaxed">
                      Arrivano dalle notifiche del gestionale: sono prenotazioni già chiuse dal motore, non trattative
                      lavorate da un operatore. Restano fuori dai conteggi per fase qui sopra, perché sommarle direbbe
                      che il lavoro commerciale ha portato{" "}
                      {/* La somma si CALCOLA dai due blocchi. Qui c'era `totale`,
                          cioè tutte le righe lette (200): includeva anche le 8
                          escluse, che non compaiono in nessuno dei due blocchi.
                          Il numero avrebbe sostenuto l'argomento giusto con una
                          cifra che non corrisponde a niente sullo schermo. */}
                      <span className="tabular-nums text-foreground">
                        {(r?.richieste ?? 0) + (r?.acquisite ?? 0)}
                      </span>{" "}
                      richieste invece di{" "}
                      <span className="tabular-nums text-foreground">{r?.richieste ?? 0}</span>.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      La loro distribuzione per data è nel{" "}
                      <Link href="/admin/tracking/demand" className="underline">
                        Calendario della domanda
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
