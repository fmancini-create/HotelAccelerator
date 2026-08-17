"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { GraduationCap, Loader2, Check, X, MessageSquareQuote, RotateCcw } from "lucide-react"

/** Deve combaciare con MIN_RISPOSTA nella rotta: sotto, l'API rifiuta con 400. */
const MIN_RISPOSTA = 10

interface Gap {
  id: string
  conversation_id: string | null
  channel: string | null
  knowledge_base_id: string | null
  question: string
  ai_answer: string | null
  similarity: number | null
  threshold: number | null
  occurrences: number
  first_seen_at: string
  last_seen_at: string
  status: "aperta" | "approvata" | "ignorata"
  approved_answer: string | null
  resolved_at: string | null
  source_id: string | null
  seen_after_resolution: number
}

interface BaseOption {
  id: string
  name: string
}

const CANALI: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  chat: "Chat del sito",
  email: "Email",
  instagram: "Instagram",
  messenger: "Messenger",
}

function quandoTesto(iso: string): string {
  const giorni = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (giorni <= 0) return "oggi"
  if (giorni === 1) return "ieri"
  if (giorni < 30) return `${giorni} giorni fa`
  const mesi = Math.round(giorni / 30)
  return mesi === 1 ? "un mese fa" : `${mesi} mesi fa`
}

export function KnowledgeGaps({ bases }: { bases: BaseOption[] }) {
  const [gaps, setGaps] = useState<Gap[]>([])
  const [conteggi, setConteggi] = useState({ aperta: 0, approvata: 0, ignorata: 0 })
  const [caricamento, setCaricamento] = useState(true)
  const [risposte, setRisposte] = useState<Record<string, string>>({})
  const [basiScelte, setBasiScelte] = useState<Record<string, string>>({})
  const [inCorso, setInCorso] = useState<string | null>(null)

  const carica = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/ai/knowledge/gaps?status=aperta", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Errore nel caricamento")
      setGaps(d.gaps ?? [])
      setConteggi(d.counts ?? { aperta: 0, approvata: 0, ignorata: 0 })
    } catch (e) {
      // Un errore qui non va silenziato: senza avviso la pagina direbbe
      // "nessuna richiesta da rivedere" mentre in realta' non ha potuto leggerle.
      toast({
        title: "Impossibile caricare le richieste",
        description: e instanceof Error ? e.message : "Errore",
        variant: "destructive",
      })
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  async function decidi(gap: Gap, azione: "approva" | "ignora") {
    setInCorso(gap.id)
    try {
      const r = await fetch("/api/admin/ai/knowledge/gaps", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: gap.id,
          action: azione,
          answer: risposte[gap.id] ?? "",
          knowledgeBaseId: basiScelte[gap.id] ?? gap.knowledge_base_id ?? undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Errore")

      toast({
        title: azione === "approva" ? "Risposta aggiunta alla base" : "Richiesta archiviata",
        description:
          azione === "approva"
            ? "L'assistente la userà per rispondere. L'indicizzazione richiede qualche istante."
            : "Non comparirà più fra quelle da rivedere.",
      })
      await carica()
    } catch (e) {
      toast({
        title: azione === "approva" ? "Approvazione non riuscita" : "Operazione non riuscita",
        description: e instanceof Error ? e.message : "Errore",
        variant: "destructive",
      })
    } finally {
      setInCorso(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-ha-brand" aria-hidden />
            <div>
              <CardTitle className="text-base">Impara dall&apos;esperienza</CardTitle>
              <CardDescription className="mt-1 leading-relaxed">
                Le domande che gli ospiti hanno fatto e che le basi non coprivano. Scrivi la risposta giusta e diventa
                una fonte: dalla volta successiva l&apos;assistente saprà rispondere.
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void carica()} disabled={caricamento}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
            Aggiorna
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {caricamento ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Caricamento delle richieste…
          </div>
        ) : gaps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <MessageSquareQuote className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Nessuna richiesta da rivedere</p>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Compariranno qui le domande a cui l&apos;assistente non ha saputo rispondere con le fonti attuali.
              {conteggi.approvata > 0 && ` Finora ne hai approvate ${conteggi.approvata}.`}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {conteggi.aperta === 1 ? "1 richiesta in attesa" : `${conteggi.aperta} richieste in attesa`}
              {conteggi.approvata > 0 && ` · ${conteggi.approvata} già approvate`}
            </p>

            <ul className="flex flex-col gap-4">
              {gaps.map((gap) => {
                const risposta = risposte[gap.id] ?? ""
                const troppoCorta = risposta.trim().length < MIN_RISPOSTA
                const occupato = inCorso === gap.id
                return (
                  <li key={gap.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {gap.occurrences > 1 && (
                        <Badge
                          variant="outline"
                          className="border-ha-brand-soft bg-ha-brand-soft text-ha-brand-soft-foreground"
                        >
                          chiesta {gap.occurrences} volte
                        </Badge>
                      )}
                      {gap.channel && (
                        <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                          {CANALI[gap.channel] ?? gap.channel}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {gap.occurrences > 1
                          ? `ultima volta ${quandoTesto(gap.last_seen_at)}`
                          : quandoTesto(gap.last_seen_at)}
                      </span>
                    </div>

                    <blockquote className="mt-3 border-l-2 border-ha-brand pl-3 text-sm leading-relaxed text-pretty">
                      {gap.question}
                    </blockquote>

                    {gap.ai_answer && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Cosa ha risposto l&apos;assistente
                        </summary>
                        <p className="mt-2 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                          {gap.ai_answer}
                        </p>
                      </details>
                    )}

                    <div className="mt-4 flex flex-col gap-3">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`risposta-${gap.id}`} className="text-xs">
                          La risposta corretta, come vuoi che la dia l&apos;assistente
                        </Label>
                        <Textarea
                          id={`risposta-${gap.id}`}
                          value={risposta}
                          onChange={(e) => setRisposte((p) => ({ ...p, [gap.id]: e.target.value }))}
                          placeholder="Es. La colazione è servita dalle 7:30 alle 10:30 nella sala vista giardino."
                          rows={3}
                          disabled={occupato}
                        />
                      </div>

                      {bases.length > 1 && (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`base-${gap.id}`} className="text-xs">
                            In quale base inserirla
                          </Label>
                          <Select
                            value={basiScelte[gap.id] ?? gap.knowledge_base_id ?? ""}
                            onValueChange={(v) => setBasiScelte((p) => ({ ...p, [gap.id]: v }))}
                            disabled={occupato}
                          >
                            <SelectTrigger id={`base-${gap.id}`} className="sm:max-w-xs">
                              <SelectValue placeholder="Scegli la base" />
                            </SelectTrigger>
                            <SelectContent>
                              {bases.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => void decidi(gap, "approva")} disabled={occupato || troppoCorta}>
                          {occupato ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Check className="mr-2 h-4 w-4" aria-hidden />
                          )}
                          Aggiungi alla base
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void decidi(gap, "ignora")}
                          disabled={occupato}
                        >
                          <X className="mr-2 h-4 w-4" aria-hidden />
                          Non serve
                        </Button>
                        {troppoCorta && risposta.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Servono almeno {MIN_RISPOSTA} caratteri
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
