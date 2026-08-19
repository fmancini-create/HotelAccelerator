"use client"

import { useEffect, useState } from "react"
import { Clock3, Mic, Phone, PhoneOff, StickyNote, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type CallState = "idle" | "dialing" | "ringing" | "connected" | "ended"

export function CrmCallPanel() {
  const [state, setState] = useState<CallState>("idle")
  const [number, setNumber] = useState("")
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (state !== "connected") return
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [state])

  const startMockCall = () => {
    if (!number.trim()) return
    setSeconds(0)
    setState("dialing")
    window.setTimeout(() => setState("ringing"), 700)
    window.setTimeout(() => setState("connected"), 1500)
  }

  const endCall = () => setState("ended")
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`

  return (
    <Card className="border-ha-module-crm/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4" /> Telefono</CardTitle>
          <Badge variant="outline">3CX non configurato</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={number} onChange={(event) => setNumber(event.target.value)} placeholder="Numero o contatto" aria-label="Numero o contatto" />
          <Button onClick={startMockCall} disabled={!number.trim() || state === "connected" || state === "dialing" || state === "ringing"}>
            <Phone className="mr-2 h-4 w-4" /> Chiama
          </Button>
        </div>

        {state !== "idle" && (
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{state}</p>
                <p className="mt-1 font-semibold">{number}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" /> {duration}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={state !== "connected"}><Mic className="mr-2 h-4 w-4" /> Mute</Button>
              <Button variant="outline" size="sm" disabled={state !== "connected"}><StickyNote className="mr-2 h-4 w-4" /> Nota</Button>
              <Button variant="outline" size="sm"><UserRound className="mr-2 h-4 w-4" /> Scheda</Button>
              <Button variant="destructive" size="sm" onClick={endCall} disabled={state === "ended"}><PhoneOff className="mr-2 h-4 w-4" /> Termina</Button>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">UI dimostrativa: nessuna chiamata reale viene avviata e nessuna credenziale 3CX è esposta al browser.</p>
      </CardContent>
    </Card>
  )
}
