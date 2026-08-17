"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Check, PhoneMissed } from "lucide-react"

/**
 * Dare un nome agli interni che compaiono nel registro.
 *
 * L'elenco NON e' digitato a mano: arriva dalle telefonate realmente registrate.
 * E' cosi' che si scopre un interno che nessuno riconosce — per esempio un
 * gruppo di squillo che risponde al posto della reception — invece di doverlo
 * indovinare.
 *
 * Gli interni gia' assegnati a una persona restano in sola lettura: la persona
 * si imposta in Canali, e permettere due nomi per lo stesso interno creerebbe
 * due verita' in disaccordo.
 */

type Riga = {
  extension: string
  calls: number
  missed: number
  last_call_at: string | null
  label: string | null
  kind: string | null
  /**
   * Secondi di squillo dopo i quali un gruppo lascia cadere la chiamata.
   * NULL = non dichiarato: il registro non deduce nulla e si fida solo di cio'
   * che dice il centralino.
   */
  no_answer_seconds: number | null
  person: string | null
}

const TIPI: Array<{ value: string; label: string }> = [
  { value: "shared", label: "Telefono condiviso" },
  { value: "group", label: "Gruppo di squillo" },
  { value: "service", label: "Servizio automatico" },
  { value: "other", label: "Altro" },
]

/** Il valore di partenza dei campi: quello SALVATO, non un valore inventato. */
function bozzaIniziale(r: Riga) {
  return {
    label: r.label ?? "",
    kind: r.kind ?? "other",
    secondi: r.no_answer_seconds === null ? "" : String(r.no_answer_seconds),
  }
}

export function ExtensionLabelsCard({ onSaved }: { onSaved?: () => void }) {
  const [righe, setRighe] = useState<Riga[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  // I secondi si tengono come TESTO, non come numero: durante la digitazione il
  // campo passa per stati intermedi (vuoto, "7") che un numero non saprebbe
  // rappresentare senza riscrivere sotto le dita di chi scrive.
  const [bozza, setBozza] = useState<Record<string, { label: string; kind: string; secondi: string }>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [salvato, setSalvato] = useState<string | null>(null)

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore(null)
    try {
      const res = await fetch("/api/telephony/extension-labels", { cache: "no-store" })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || "Non è stato possibile leggere gli interni.")
      }
      const j = (await res.json()) as { extensions?: Riga[] }
      setRighe(j.extensions ?? [])
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore inatteso.")
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const salva = async (r: Riga) => {
    const corrente = bozza[r.extension] ?? bozzaIniziale(r)
    setSalvando(r.extension)
    setErrore(null)
    try {
      const res = await fetch("/api/telephony/extension-labels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extension: r.extension,
          label: corrente.label,
          kind: corrente.kind,
          // I secondi si mandano SOLO per un gruppo di squillo. Cambiando tipo
          // da gruppo a telefono condiviso il valore va via con il tipo,
          // altrimenti resterebbe a dedurre chiamate perse su un interno che
          // gruppo non e' piu'.
          no_answer_seconds: corrente.kind === "group" ? corrente.secondi : null,
        }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || "Salvataggio non riuscito.")
      }
      setSalvato(r.extension)
      setTimeout(() => setSalvato(null), 2000)
      await carica()
      onSaved?.()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore inatteso.")
    } finally {
      setSalvando(null)
    }
  }

  if (caricamento) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Lettura degli interni…
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        {"Gli interni sono ricavati dalle telefonate registrate. Un interno che non riconosci è spesso un gruppo di squillo o un servizio automatico del centralino, non una persona."}
      </p>

      {errore && (
        <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errore}
        </p>
      )}

      {righe.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nessun interno ancora comparso nelle telefonate.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {righe.map((r) => {
            const corrente = bozza[r.extension] ?? bozzaIniziale(r)
            const bloccato = Boolean(r.person)
            return (
              <li key={r.extension} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-2 sm:w-56">
                  <span className="font-mono text-sm font-semibold text-foreground">{r.extension}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.calls} {r.calls === 1 ? "chiamata" : "chiamate"}
                  </span>
                  {r.missed > 0 && (
                    <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                      <PhoneMissed className="h-3 w-3" aria-hidden="true" />
                      {r.missed}
                    </Badge>
                  )}
                </div>

                {bloccato ? (
                  <p className="flex-1 text-sm text-muted-foreground">
                    Assegnato a <span className="font-medium text-foreground">{r.person}</span>. Si modifica in Canali
                    {" › "}Telefono.
                  </p>
                ) : (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Input
                      value={corrente.label}
                      onChange={(e) =>
                        setBozza((b) => ({ ...b, [r.extension]: { ...corrente, label: e.target.value } }))
                      }
                      placeholder="Nome, es. Reception"
                      aria-label={`Nome per l'interno ${r.extension}`}
                      className="sm:flex-1"
                    />
                    <select
                      value={corrente.kind}
                      onChange={(e) => setBozza((b) => ({ ...b, [r.extension]: { ...corrente, kind: e.target.value } }))}
                      aria-label={`Tipo dell'interno ${r.extension}`}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    >
                      {TIPI.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    {/* Compare solo per un gruppo di squillo, perche' solo lì il
                        numero ha un senso: su un telefono personale la durata è
                        tempo di conversazione, e dedurne chiamate perse sarebbe
                        sbagliato. Senza questo campo la regola resterebbe spenta
                        per sempre e le chiamate cadute tornerebbero invisibili. */}
                    {corrente.kind === "group" && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="whitespace-nowrap">Squilla per</span>
                        <Input
                          value={corrente.secondi}
                          onChange={(e) =>
                            setBozza((b) => ({
                              ...b,
                              [r.extension]: { ...corrente, secondi: e.target.value.replace(/\D/g, "").slice(0, 3) },
                            }))
                          }
                          inputMode="numeric"
                          placeholder="75"
                          aria-label={`Secondi di squillo del gruppo ${r.extension}`}
                          className="h-9 w-16 text-center"
                        />
                        <span className="whitespace-nowrap">secondi, poi cade</span>
                      </label>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void salva(r)}
                      disabled={salvando === r.extension}
                      className="gap-1"
                    >
                      {salvando === r.extension ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : salvato === r.extension ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : null}
                      Salva
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {"Svuotare il nome rimuove l'etichetta. Per attribuire le telefonate a una persona serve invece l'assegnazione dell'interno in Canali › Telefono."}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {"Sui gruppi di squillo il centralino non dice se nessuno ha risposto: dichiarando i secondi di squillo, le chiamate durate esattamente quel tempo compaiono nel registro come «Caduta al centralino» invece di sembrare gestite."}
      </p>
    </div>
  )
}
