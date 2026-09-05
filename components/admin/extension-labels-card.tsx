"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Check, PhoneMissed } from "lucide-react"

type Riga = {
  extension: string
  calls: number
  missed: number
  last_call_at: string | null
  label: string | null
  kind: string | null
  no_answer_seconds: number | null
  group_id: string | null
  person: string | null
}

type Gruppo = { id: string; name: string }

const TIPI: Array<{ value: string; label: string }> = [
  { value: "shared", label: "Telefono condiviso" },
  { value: "group", label: "Gruppo di squillo" },
  { value: "service", label: "Servizio automatico" },
  { value: "other", label: "Altro" },
]

function bozzaIniziale(r: Riga) {
  return {
    label: r.label ?? "",
    kind: r.kind ?? "other",
    secondi: r.no_answer_seconds === null ? "" : String(r.no_answer_seconds),
    groupId: r.group_id ?? "",
  }
}

type Bozza = ReturnType<typeof bozzaIniziale>

export function ExtensionLabelsCard({ onSaved }: { onSaved?: () => void }) {
  const [righe, setRighe] = useState<Riga[]>([])
  const [gruppi, setGruppi] = useState<Gruppo[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [bozza, setBozza] = useState<Record<string, Bozza>>({})
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
      const j = (await res.json()) as { extensions?: Riga[]; groups?: Gruppo[] }
      setRighe(j.extensions ?? [])
      setGruppi(j.groups ?? [])
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
          no_answer_seconds: corrente.kind === "group" ? corrente.secondi : null,
          group_id: corrente.kind === "group" && corrente.groupId ? corrente.groupId : null,
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
        Gli interni sono ricavati dalle telefonate registrate. Per un gruppo di squillo puoi collegare anche il gruppo utenti HotelAccelerator: questa associazione viene usata per la visibilità delle chiamate.
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
                      onChange={(e) =>
                        setBozza((b) => ({
                          ...b,
                          [r.extension]: {
                            ...corrente,
                            kind: e.target.value,
                            groupId: e.target.value === "group" ? corrente.groupId : "",
                          },
                        }))
                      }
                      aria-label={`Tipo dell'interno ${r.extension}`}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    >
                      {TIPI.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    {corrente.kind === "group" && (
                      <>
                        <select
                          value={corrente.groupId}
                          onChange={(e) =>
                            setBozza((b) => ({ ...b, [r.extension]: { ...corrente, groupId: e.target.value } }))
                          }
                          aria-label={`Gruppo utenti associato all'interno ${r.extension}`}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                        >
                          <option value="">Nessun gruppo utenti</option>
                          {gruppi.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="whitespace-nowrap">Squilla per</span>
                          <Input
                            value={corrente.secondi}
                            onChange={(e) =>
                              setBozza((b) => ({
                                ...b,
                                [r.extension]: {
                                  ...corrente,
                                  secondi: e.target.value.replace(/\D/g, "").slice(0, 3),
                                },
                              }))
                            }
                            inputMode="numeric"
                            placeholder="75"
                            aria-label={`Secondi di squillo del gruppo ${r.extension}`}
                            className="h-9 w-16 text-center"
                          />
                          <span className="whitespace-nowrap">secondi, poi cade</span>
                        </label>
                      </>
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
        Svuotare il nome rimuove l'etichetta. Gli interni personali si assegnano invece in Canali › Telefono.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Per un gruppo di squillo, l'associazione al gruppo utenti permette a «Le chiamate dei miei gruppi» di includere anche le chiamate arrivate al gruppo prima che siano attribuite a una singola persona.
      </p>
    </div>
  )
}
