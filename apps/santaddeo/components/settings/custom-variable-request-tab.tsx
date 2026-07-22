"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Lightbulb, Send, CheckCircle2, Clock, XCircle, MessageCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

/**
 * FASE 7 - Tenant tab for submitting custom K-variable proposals.
 *
 * UX pattern: simple form + history list. The form intentionally does NOT
 * activate the variable; submission just creates a request that the
 * superadmin will review. This enforces the architectural rule "no AUTO
 * variable without a validated pipeline".
 */

interface PricingVariableRequest {
  id: string
  proposed_name: string
  description: string
  datasource: string
  frequency: string | null
  format: string | null
  rationale: string | null
  status: "pending" | "approved" | "rejected" | "needs_info"
  review_notes: string | null
  reviewed_at: string | null
  created_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function StatusBadge({ status }: { status: PricingVariableRequest["status"] }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
          <Clock className="h-3 w-3 mr-1" /> In revisione
        </Badge>
      )
    case "approved":
      return (
        <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Approvata
        </Badge>
      )
    case "rejected":
      return (
        <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">
          <XCircle className="h-3 w-3 mr-1" /> Non accolta
        </Badge>
      )
    case "needs_info":
      return (
        <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
          <MessageCircle className="h-3 w-3 mr-1" /> Servono dettagli
        </Badge>
      )
  }
}

export function CustomVariableRequestTab({ hotelId }: { hotelId: string }) {
  const { toast } = useToast()
  const { data, mutate, isLoading } = useSWR<{ requests: PricingVariableRequest[] }>(
    hotelId ? `/api/pricing-variable-requests?hotelId=${hotelId}` : null,
    fetcher,
  )

  const [proposedName, setProposedName] = useState("")
  const [description, setDescription] = useState("")
  const [datasource, setDatasource] = useState("")
  const [frequency, setFrequency] = useState("")
  const [format, setFormat] = useState("")
  const [rationale, setRationale] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setProposedName("")
    setDescription("")
    setDatasource("")
    setFrequency("")
    setFormat("")
    setRationale("")
  }

  const onSubmit = async () => {
    if (!proposedName.trim() || !description.trim() || !datasource.trim()) {
      toast({
        title: "Campi obbligatori",
        description: "Nome, descrizione e fonte dati sono richiesti.",
        variant: "destructive",
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/pricing-variable-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          proposedName: proposedName.trim(),
          description: description.trim(),
          datasource: datasource.trim(),
          frequency: frequency.trim() || undefined,
          format: format.trim() || undefined,
          rationale: rationale.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Errore invio richiesta")
      }
      toast({
        title: "Richiesta inviata",
        description:
          "Il team Santaddeo valutera' la richiesta. Riceverai una risposta in pochi giorni.",
      })
      reset()
      mutate()
    } catch (err: any) {
      toast({
        title: "Errore",
        description: err?.message || "Impossibile inviare la richiesta",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const requests = data?.requests ?? []
  const pendingCount = requests.filter((r) => r.status === "pending").length

  return (
    <div className="space-y-4">
      <Alert>
        <Lightbulb className="h-4 w-4" />
        <AlertTitle>Come funziona</AlertTitle>
        <AlertDescription className="text-sm leading-relaxed">
          Le variabili K aggiuntive (es. eventi locali, traffico web, recensioni)
          devono essere alimentate da una pipeline validata di dati. Compila
          questa richiesta e il team Santaddeo valutera' se e come integrarla nel
          tuo motore di pricing. Le variabili NON vengono attivate
          automaticamente: occorre approvazione manuale.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proponi una nuova variabile</CardTitle>
          <CardDescription>
            Spiega quale dato vorresti far entrare nel motore di pricing e
            indicaci la fonte ufficiale da cui leggerlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="proposedName">Nome variabile *</Label>
              <Input
                id="proposedName"
                value={proposedName}
                onChange={(e) => setProposedName(e.target.value)}
                placeholder="es. Eventi locali, Visite sito web"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="datasource">Fonte dati *</Label>
              <Input
                id="datasource"
                value={datasource}
                onChange={(e) => setDatasource(e.target.value)}
                placeholder="es. TicketOne API, Google Analytics, file Excel mensile"
                maxLength={200}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrizione *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cosa misura questa variabile e perche' dovrebbe influenzare il prezzo?"
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequenza aggiornamento</Label>
              <Input
                id="frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="es. giornaliera, settimanale, mensile"
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="format">Formato</Label>
              <Input
                id="format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="es. API REST, CSV, Excel"
                maxLength={80}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rationale">Note operative (facoltativo)</Label>
            <Textarea
              id="rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Hai gia' un accesso? Un dataset di prova? Aggiungi qui informazioni utili al team."
              rows={2}
              maxLength={1500}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={onSubmit} disabled={submitting}>
            <Send className="h-4 w-4 mr-2" />
            {submitting ? "Invio..." : "Invia richiesta"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Le tue richieste</CardTitle>
          <CardDescription>
            {isLoading
              ? "Caricamento..."
              : requests.length === 0
              ? "Nessuna richiesta inviata."
              : `${requests.length} richieste totali, ${pendingCount} in attesa.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.map((r) => (
            <div
              key={r.id}
              className="rounded-md border bg-card p-3 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-medium text-sm">{r.proposed_name}</div>
                  <div className="text-xs text-muted-foreground">
                    Fonte: {r.datasource}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {r.description}
              </p>
              {r.review_notes && (
                <div className="text-xs bg-muted rounded px-2 py-1.5 border">
                  <span className="font-medium">Risposta team:</span>{" "}
                  {r.review_notes}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground">
                Inviata il {new Date(r.created_at).toLocaleDateString("it-IT")}
                {r.reviewed_at && (
                  <>
                    {" "}- Valutata il{" "}
                    {new Date(r.reviewed_at).toLocaleDateString("it-IT")}
                  </>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
