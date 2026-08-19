"use client"

import { useState } from "react"
import { AlertCircle, Phone, PhoneCall } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Chiamata in uscita — VERA, tramite `/api/telephony/click-to-call`.
 *
 * PRIMA era una simulazione: `startMockCall` portava lo stato a "dialing",
 * "ringing" e "connected" con due `setTimeout`, e faceva scorrere un
 * cronometro. Nessuna richiesta partiva. Il badge dichiarava anche "3CX non
 * configurato", che era FALSO: il centralino risulta collegato e attivo
 * (`telephony_integrations`, provider 3cx, `is_active` vero, con credenziali e
 * interno predefinito), ed e' lo stesso che ha registrato le telefonate del
 * registro.
 *
 * L'API esisteva gia' e fa tutto il lavoro delicato: deduce l'interno dalla
 * SESSIONE (non lo accetta dal browser, altrimenti si potrebbe far partire una
 * telefonata dal telefono di un collega), verifica il contatto nella struttura
 * autenticata, e registra in `phone_calls` anche i tentativi falliti.
 *
 * PERCHE' NON C'E' PIU' IL CRONOMETRO, NE' "Mute" E "Nota": il browser non
 * viene informato di quando la chiamata viene risposta o chiusa — non esiste
 * nessun canale dal centralino verso questa pagina. Il cronometro contava
 * quindi un tempo inventato, e quei pulsanti non erano collegati a niente. Al
 * loro posto si mostra l'unica cosa che sappiamo per certo: che il centralino ha
 * accettato la richiesta, e in quale ordine squillano i telefoni.
 */
export function CrmCallPanel() {
  const [numero, setNumero] = useState("")
  const [invio, setInvio] = useState(false)
  const [esito, setEsito] = useState("")
  const [errore, setErrore] = useState("")

  const chiama = async () => {
    const destination = numero.trim()
    if (destination === "") return
    setInvio(true)
    setEsito("")
    setErrore("")
    try {
      const res = await fetch("/api/telephony/click-to-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        // I messaggi dell'API sono già scritti per chi legge (centralino non
        // configurato, interno non assegnato, interno di sola ricezione): si
        // mostrano come sono, invece di appiattirli su un "errore generico"
        // che non direbbe cosa fare.
        setErrore(body?.error || "Non è stato possibile avviare la chiamata.")
        return
      }
      setEsito(body?.message || "Chiamata avviata.")
      setNumero("")
    } catch {
      setErrore("Non è stato possibile contattare il server.")
    } finally {
      setInvio(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4" aria-hidden="true" /> Chiama un numero
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            void chiama()
          }}
        >
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="numero-da-chiamare" className="text-xs text-muted-foreground">
              Numero da chiamare
            </Label>
            <Input
              id="numero-da-chiamare"
              value={numero}
              inputMode="tel"
              placeholder="es. +39 055 123456"
              onChange={(e) => setNumero(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={numero.trim() === "" || invio}>
            <PhoneCall className="mr-2 h-4 w-4" aria-hidden="true" />
            {invio ? "Avvio…" : "Chiama"}
          </Button>
        </form>

        {esito && (
          <p
            className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground text-pretty"
            role="status"
          >
            {esito}
          </p>
        )}

        {errore && (
          <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-pretty">{errore}</span>
          </p>
        )}

        <p className="text-xs text-muted-foreground text-pretty leading-relaxed">
          Squilla prima il tuo interno: quando rispondi, il centralino compone il numero. L&apos;esito della telefonata
          compare nel registro quando il centralino lo comunica, non qui.
        </p>
      </CardContent>
    </Card>
  )
}
