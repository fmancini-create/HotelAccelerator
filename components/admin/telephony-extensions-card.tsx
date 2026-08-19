"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertCircle, CheckCircle2, Loader2, PhoneCall } from "lucide-react"

type Row = {
  id: string
  name: string
  email: string
  role: string
  extension: string
  can_call: boolean
  is_me: boolean
}

/**
 * Assegna a ogni persona il suo interno telefonico.
 *
 * NON e' dietro il collegamento riuscito all'applicazione API: l'assegnazione
 * serve per attribuire le chiamate in ARRIVO, che funzionano gia' col solo
 * template CRM. Legarla all'API l'avrebbe resa invisibile proprio a chi non
 * puo' ancora crearla.
 */
export function TelephonyExtensionsCard() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [draft, setDraft] = useState<Record<string, { extension: string; can_call: boolean }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)
  // Errore di caricamento tenuto in uno stato PROPRIO: se mostrassi solo
  // "nessun utente" quando la lettura fallisce (per esempio con la sessione
  // scaduta), il messaggio direbbe una cosa falsa.
  const [loadError, setLoadError] = useState("")

  const load = useCallback(async () => {
    setLoadError("")
    try {
      const res = await fetch("/api/telephony/extensions")
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setLoadError(
          res.status === 401
            ? "Sessione scaduta: ricarica la pagina per rientrare."
            : data?.error || "Non è stato possibile leggere l'elenco delle persone.",
        )
        setRows([])
        return
      }
      const data = await res.json()
      const list = (data.users ?? []) as Row[]
      setRows(list)
      setDraft(
        Object.fromEntries(list.map((u) => [u.id, { extension: u.extension, can_call: u.can_call }])),
      )
    } catch {
      setLoadError("Non è stato possibile contattare il server.")
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(row: Row) {
    const value = draft[row.id]
    if (!value) return
    setSavingId(row.id)
    setFeedback(null)
    try {
      const res = await fetch("/api/telephony/extensions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: row.id, extension: value.extension, can_call: value.can_call }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFeedback({ ok: false, message: data?.error || "Salvataggio non riuscito." })
        return
      }
      setFeedback({
        ok: true,
        message: data?.removed
          ? `Interno rimosso a ${row.name}.`
          : `Interno ${data.extension} assegnato a ${row.name}.`,
      })
      await load()
    } finally {
      setSavingId(null)
    }
  }

  const isDirty = (row: Row) => {
    const d = draft[row.id]
    if (!d) return false
    return d.extension !== row.extension || d.can_call !== row.can_call
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PhoneCall className="h-5 w-5" aria-hidden="true" />
          Interno di ogni persona
        </CardTitle>
        <CardDescription className="text-pretty">
          L&apos;interno collega la persona al suo telefono: le chiamate in arrivo vengono attribuite a lei nel
          registro e, quando parte una chiamata dal gestionale, squilla il suo apparecchio e non quello di un collega.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Caricamento…
          </p>
        ) : loadError ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-pretty">{loadError}</span>
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-pretty">
            Nessuna persona in questa struttura: aggiungi prima gli utenti dalla sezione Utenti.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const d = draft[row.id] ?? { extension: "", can_call: true }
              return (
                <li key={row.id} className="flex flex-wrap items-end gap-3 py-3 first:pt-0">
                  <div className="min-w-40 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {row.name}
                      {row.is_me && (
                        <Badge variant="secondary" className="text-xs">
                          tu
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor={`ext-${row.id}`} className="text-xs text-muted-foreground">
                      Interno
                    </Label>
                    <Input
                      id={`ext-${row.id}`}
                      value={d.extension}
                      inputMode="numeric"
                      placeholder="es. 200"
                      className="w-24"
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, [row.id]: { ...d, extension: e.target.value } }))
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox
                      id={`call-${row.id}`}
                      checked={d.can_call}
                      onCheckedChange={(v) =>
                        setDraft((p) => ({ ...p, [row.id]: { ...d, can_call: v === true } }))
                      }
                    />
                    <Label htmlFor={`call-${row.id}`} className="text-xs text-muted-foreground">
                      Può chiamare
                    </Label>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!isDirty(row) || savingId === row.id}
                    onClick={() => save(row)}
                  >
                    {savingId === row.id ? "Salvataggio…" : "Salva"}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {feedback && (
          <p
            className={`flex items-start gap-2 text-sm ${feedback.ok ? "text-ha-success" : "text-destructive"}`}
            role="status"
          >
            {feedback.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="text-pretty">{feedback.message}</span>
          </p>
        )}

        <p className="text-xs text-muted-foreground text-pretty leading-relaxed">
          Lo stato &quot;disponibile&quot; non si imposta dal gestionale: 3CX lo cambia solo dall&apos;app o dal
          telefono (verificato, non è una mancanza nostra). Le chiamate in uscita richiedono inoltre
          l&apos;applicazione API, quindi il ruolo Proprietario del sistema.
        </p>
      </CardContent>
    </Card>
  )
}
