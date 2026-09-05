"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { usePathname } from "next/navigation"
import { Bug, HelpCircle, Lightbulb, Loader2, Send, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type ReportType = "suggestion" | "bug"
interface GuideMessage { role: "user" | "assistant"; content: string }

export function InternalSupportAssistant() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<GuideMessage[]>([])
  const [asking, setAsking] = useState(false)
  const [reportType, setReportType] = useState<ReportType | null>(null)
  const [reportTitle, setReportTitle] = useState("")
  const [reportDescription, setReportDescription] = useState("")
  const [sendingReport, setSendingReport] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, asking])

  async function askGuide(event: FormEvent) {
    event.preventDefault()
    const value = question.trim()
    if (!value || asking) return
    setQuestion("")
    setNotice(null)
    setMessages((current) => [...current, { role: "user", content: value }])
    setAsking(true)
    try {
      const response = await fetch("/api/admin/internal-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask", question: value, current_path: pathname }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; answer?: string }
      if (!response.ok) throw new Error(payload.error || "Guida non disponibile")
      setMessages((current) => [...current, { role: "assistant", content: payload.answer || "Nessuna risposta disponibile." }])
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: error instanceof Error ? error.message : "Guida temporaneamente non disponibile." }])
    } finally { setAsking(false) }
  }

  function openReport(type: ReportType) {
    setReportType(type)
    setReportTitle("")
    setReportDescription("")
    setNotice(null)
  }

  async function sendReport(event: FormEvent) {
    event.preventDefault()
    if (!reportType || !reportTitle.trim() || !reportDescription.trim() || sendingReport) return
    setSendingReport(true)
    setNotice(null)
    try {
      const response = await fetch("/api/admin/internal-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "report", type: reportType, title: reportTitle.trim(), description: reportDescription.trim(), current_path: pathname }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "Invio non riuscito")
      setNotice(reportType === "bug" ? "Errore segnalato al supporto 4BID." : "Miglioria inviata al team 4BID.")
      setReportType(null)
      setReportTitle("")
      setReportDescription("")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Invio non riuscito")
    } finally { setSendingReport(false) }
  }

  return <>
    {!open && <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[70] flex h-12 items-center gap-2 rounded-full border bg-background px-4 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-6 sm:right-6" aria-label="Apri guida e assistenza HotelAccelerator">
      <HelpCircle className="h-5 w-5 text-ha-brand" /><span className="hidden sm:inline">Guida e assistenza</span>
    </button>}

    {open && <section className="fixed inset-x-3 bottom-3 z-[70] flex max-h-[82vh] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[620px] sm:w-[420px]" aria-label="Guida e assistenza HotelAccelerator">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ha-brand-soft text-ha-brand-soft-foreground"><Sparkles className="h-4 w-4" /></span><div className="min-w-0"><div className="font-semibold">Guida HotelAccelerator</div><div className="truncate text-xs text-muted-foreground">Assistenza contestuale sulla pagina corrente</div></div></div>
        <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Chiudi assistenza"><X className="h-4 w-4" /></Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {reportType ? <form onSubmit={sendReport} className="space-y-4">
          <div><div className="flex items-center gap-2 font-semibold">{reportType === "bug" ? <Bug className="h-4 w-4 text-destructive" /> : <Lightbulb className="h-4 w-4 text-amber-600" />}{reportType === "bug" ? "Segnala errore" : "Segnala miglioria"}</div><p className="mt-1 text-xs text-muted-foreground">La segnalazione entra nella Inbox del supporto 4BID con tenant e pagina corrente già associati.</p></div>
          <Input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} placeholder={reportType === "bug" ? "Titolo del problema" : "Titolo della proposta"} maxLength={160} required />
          <Textarea value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} placeholder={reportType === "bug" ? "Cosa è successo? Cosa ti aspettavi?" : "Cosa vorresti migliorare e perché?"} rows={8} maxLength={10000} required />
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setReportType(null)} disabled={sendingReport}>Indietro</Button><Button type="submit" className="flex-1" disabled={sendingReport || !reportTitle.trim() || !reportDescription.trim()}>{sendingReport && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Invia</Button></div>
        </form> : <div className="space-y-4">
          {messages.length === 0 && <div className="rounded-xl border bg-muted/30 p-4 text-sm"><p className="font-medium">Come posso aiutarti?</p><p className="mt-1 text-muted-foreground">Chiedimi come usare la pagina, dove trovare una funzione o come completare un'operazione. Rispondo usando la documentazione interna sincronizzata.</p></div>}
          <div className="space-y-3" aria-live="polite">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[92%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "border bg-muted/40"}`}>{message.content}</div>)}{asking && <div className="flex w-fit items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cerco nella guida interna…</div>}<div ref={endRef} /></div>
        </div>}
      </div>

      {!reportType && <footer className="border-t p-3">{notice && <div className="mb-2 rounded-md bg-muted px-3 py-2 text-xs" role="status">{notice}</div>}<form onSubmit={askGuide} className="flex gap-2"><Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Chiedi come fare…" disabled={asking} aria-label="Domanda alla guida" /><Button type="submit" size="icon" disabled={!question.trim() || asking} aria-label="Invia domanda"><Send className="h-4 w-4" /></Button></form><div className="mt-2 grid grid-cols-2 gap-2"><Button type="button" variant="outline" size="sm" onClick={() => openReport("suggestion")}><Lightbulb className="mr-1.5 h-4 w-4" /> Segnala miglioria</Button><Button type="button" variant="outline" size="sm" onClick={() => openReport("bug")}><Bug className="mr-1.5 h-4 w-4" /> Segnala errore</Button></div></footer>}
    </section>}
  </>
}
