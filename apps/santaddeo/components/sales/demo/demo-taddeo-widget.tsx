"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { X, Send, Loader2, Sparkles } from "lucide-react"
import { DEMO_HOTEL } from "@/lib/sales/demo/mock-api"

const TADDEO_AVATAR = "/images/taddeo-avatar.png"

/**
 * Widget "Taddeo - RevMentor" per la MODALITA' DEMO.
 *
 * BUG (06/06/2026): nella demo, in basso a destra appariva il FAB BLU della
 * guida (PageGuideButton) invece del RevMentor VERDE (Taddeo). Causa: il
 * RevMentor reale (components/dashboard/ai-chat-panel.tsx) e' agganciato a un
 * hotel reale + backend /api/ai-chat con auth/tier/streaming, quindi non e'
 * riutilizzabile nella demo mock. Soluzione: questo clone VISIVAMENTE IDENTICO
 * al RevMentor reale (FAB verde "Taddeo", pannello con header emerald) ma con
 * risposte MOCK, montato dal DemoShell. Il FAB blu viene soppresso su /demo
 * (vedi components/layout/page-guide-button.tsx).
 *
 * Nessun fetch: le risposte sono canned, coerenti con i dati della struttura
 * dimostrativa "Hotel Santaddeo".
 */

interface DemoMessage {
  role: "user" | "assistant"
  content: string
}

const QUICK_PROMPTS = [
  "Come sta andando l'occupazione questo mese?",
  "Analizza le cancellazioni",
  "Quali canali di vendita performano meglio?",
  "Cos'e il RevPAR?",
]

// Risposte mock coerenti col tono del RevMentor reale e con i dati demo.
function getDemoAnswer(question: string): string {
  const q = question.toLowerCase()
  const hotel = DEMO_HOTEL.name

  if (q.includes("occupaz")) {
    return `Su ${hotel} l'occupazione del mese e' all'82%, +6 punti rispetto allo stesso periodo dell'anno scorso. Il pickup delle ultime 7 giorni e' positivo (+34 camere). Ti consiglio di alzare leggermente la tariffa nei weekend gia' molto pieni (ven-sab oltre il 90%) e di spingere con offerte mirate i mercoledi, che restano il giorno piu' debole.`
  }
  if (q.includes("cancellaz")) {
    return `Il tasso di cancellazione e' al 14%, in linea con la media di mercato. La quota piu' alta arriva dalle OTA con tariffe completamente rimborsabili. Valuta di introdurre una tariffa non rimborsabile scontata del 10%: catturi chi e' gia' deciso e riduci le cancellazioni dell'ultimo minuto senza perdere volume.`
  }
  if (q.includes("canal")) {
    return `I canali piu' performanti su ${hotel} questo mese sono: Booking.com (41% del fatturato), sito diretto (28%), Expedia (16%) e il resto distribuito su altri canali. Il diretto ha l'ADR piu' alto e zero commissioni: ti suggerisco di rafforzarlo con un piccolo vantaggio esclusivo (early check-in o upgrade) per spostare prenotazioni dalle OTA.`
  }
  if (q.includes("revpar")) {
    return `Il RevPAR (Revenue Per Available Room) e' il ricavo medio per camera disponibile: RevPAR = ADR x Occupazione. Misura insieme prezzo e riempimento, quindi e' il KPI piu' onesto per capire come stai monetizzando l'inventario. Su ${hotel} il RevPAR del mese e' di circa 96 euro, +11% sull'anno scorso, trainato soprattutto dall'aumento dell'occupazione.`
  }
  if (q.includes("adr") || q.includes("tariff") || q.includes("prezz")) {
    return `L'ADR (tariffa media giornaliera) di ${hotel} e' a 117 euro, +5% anno su anno. C'e' margine per spingere sulle date ad alta domanda: ti consiglio di lavorare per fasce, alzando dove l'occupazione e' gia' alta e proteggendo il volume dove la domanda e' piu' debole.`
  }
  return `Ottima domanda! In questa demo ti mostro come ragiona Taddeo, il tuo RevMentor: analizza i dati di ${hotel} (occupazione, ADR, RevPAR, canali, cancellazioni) e ti propone azioni concrete sul pricing e sulla distribuzione. Con i dati reali della tua struttura le risposte sono personalizzate e sempre aggiornate al tuo P.M.S.`
}

export function DemoTaddeoWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<DemoMessage[]>([])
  const [input, setInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isThinking])

  const ask = useCallback((question: string) => {
    const q = question.trim()
    if (!q || isThinking) return
    setMessages((prev) => [...prev, { role: "user", content: q }])
    setInput("")
    setIsThinking(true)
    // Simula la "riflessione" del RevMentor reale.
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: getDemoAnswer(q) }])
      setIsThinking(false)
    }, 700)
  }, [isThinking])

  return (
    <>
      {/* FAB verde — identico al RevMentor reale (Taddeo) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-[60] group flex items-center gap-2 rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition-all hover:scale-105 hover:shadow-xl hover:shadow-emerald-600/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 pl-4 pr-5 py-3"
          aria-label="Apri Taddeo - assistente IA"
        >
          <img src={TADDEO_AVATAR || "/placeholder.svg"} alt="Taddeo" width={28} height={28} className="rounded-full" />
          <span className="text-sm font-semibold hidden sm:inline">Taddeo</span>
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500" />
          </span>
        </button>
      )}

      {/* Pannello chat */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[60] w-[420px] max-w-[calc(100vw-2rem)]">
          <Card className="flex flex-col shadow-2xl border border-emerald-200/50 overflow-hidden rounded-2xl" style={{ height: "600px" }}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-4 border-b bg-emerald-600 text-white flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 flex-shrink-0 overflow-hidden">
                  <img src={TADDEO_AVATAR || "/placeholder.svg"} alt="Taddeo" width={32} height={32} className="rounded-full" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold truncate text-white">Taddeo</CardTitle>
                  <p className="text-[10px] text-emerald-100 truncate">Il tuo RevMentor personale</p>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/30 bg-white/10 text-white/80">
                  Demo
                </Badge>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 bg-transparent text-white hover:bg-white/20 hover:text-white" onClick={() => setIsOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
                    <div className="h-20 w-20 rounded-2xl bg-emerald-50 flex items-center justify-center overflow-hidden">
                      <img src={TADDEO_AVATAR || "/placeholder.svg"} alt="Taddeo" width={80} height={80} className="rounded-2xl" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-foreground">Ciao! Sono Taddeo</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Il tuo RevMentor personale</p>
                      <p className="text-xs text-emerald-600 mt-1 font-medium">{DEMO_HOTEL.name}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 w-full max-w-[320px] mt-2">
                      {QUICK_PROMPTS.map((p) => (
                        <button
                          key={p}
                          onClick={() => ask(p)}
                          className="text-left text-xs px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user" ? "bg-emerald-600 text-white" : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {isThinking && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-muted text-foreground">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Sto pensando...
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t p-3 flex items-center gap-2 flex-shrink-0">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      ask(input)
                    }
                  }}
                  placeholder="Chiedi a Taddeo..."
                  className="flex-1"
                />
                <Button
                  size="icon"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  onClick={() => ask(input)}
                  disabled={!input.trim() || isThinking}
                  aria-label="Invia"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              <div className="px-3 pb-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-emerald-500" />
                Risposte dimostrative su dati di esempio
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
