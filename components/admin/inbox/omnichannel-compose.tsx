"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Mail, MessageCircle, Search, Send, Loader2, CheckCircle2, Clock3 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface ContactSuggestion {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  whatsapp_id: string | null
}

type ComposeChannel = "email" | "whatsapp"

export function OmnichannelCompose() {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<ComposeChannel>("email")
  const [recipient, setRecipient] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [selectedContact, setSelectedContact] = useState<ContactSuggestion | null>(null)
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const [queued, setQueued] = useState(false)
  const searchSeq = useRef(0)

  const reset = () => {
    setChannel("email")
    setRecipient("")
    setSubject("")
    setBody("")
    setSelectedContact(null)
    setSuggestions([])
    setQueued(false)
  }

  useEffect(() => {
    if (!open || selectedContact || recipient.trim().length < 2) {
      setSuggestions([])
      return
    }

    const seq = ++searchSeq.current
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/inbox/compose/contacts?q=${encodeURIComponent(recipient.trim())}`)
        const data = await res.json().catch(() => ({}))
        if (seq !== searchSeq.current) return
        setSuggestions(res.ok ? data.contacts ?? [] : [])
      } catch {
        if (seq === searchSeq.current) setSuggestions([])
      } finally {
        if (seq === searchSeq.current) setSearching(false)
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [open, recipient, selectedContact])

  useEffect(() => {
    if (!selectedContact) return
    const value = channel === "email"
      ? selectedContact.email || ""
      : selectedContact.whatsapp_id || selectedContact.phone || ""
    setRecipient(value)
  }, [channel, selectedContact])

  const recipientHint = useMemo(() => {
    if (channel === "email") return "Email del destinatario"
    return "Numero WhatsApp con prefisso internazionale, es. +393331234567"
  }, [channel])

  const chooseContact = (contact: ContactSuggestion) => {
    setSelectedContact(contact)
    setSuggestions([])
    const value = channel === "email"
      ? contact.email || ""
      : contact.whatsapp_id || contact.phone || ""
    setRecipient(value)
  }

  const changeRecipient = (value: string) => {
    setRecipient(value)
    if (selectedContact) setSelectedContact(null)
  }

  const send = async () => {
    if (!recipient.trim() || !body.trim()) return
    setSending(true)
    setQueued(false)

    try {
      if (channel === "email") {
        const res = await fetch("/api/gmail/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: recipient.trim(), subject: subject.trim(), body: body.trim() }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Invio email non riuscito")
        toast.success("Email inviata")
        reset()
        setOpen(false)
        return
      }

      const res = await fetch("/api/inbox/compose/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient.trim(),
          body: body.trim(),
          contactId: selectedContact?.id,
          contactName: selectedContact?.name,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Invio WhatsApp non riuscito")

      if (data.mode === "queued") {
        setQueued(true)
        setBody("")
        setSuggestions([])
        toast.success("Richiesta di apertura WhatsApp inviata")
      } else {
        toast.success("Messaggio WhatsApp inviato")
        reset()
        setOpen(false)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invio non riuscito")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 gap-2 whitespace-nowrap"
        aria-label="Crea un nuovo messaggio"
      >
        <Send className="h-4 w-4" />
        Nuovo messaggio
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuovo messaggio</DialogTitle>
            <DialogDescription>
              Scegli il canale. HotelAccelerator applica automaticamente le regole di invio del provider.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Canale</legend>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setChannel("email")}
                  className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                    channel === "email" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"
                  }`}
                >
                  <Mail className="h-5 w-5" />
                  <span>
                    <span className="block text-sm font-medium">Email</span>
                    <span className="block text-xs text-muted-foreground">Invio immediato</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setChannel("whatsapp")}
                  className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                    channel === "whatsapp" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"
                  }`}
                >
                  <MessageCircle className="h-5 w-5" />
                  <span>
                    <span className="block text-sm font-medium">WhatsApp</span>
                    <span className="block text-xs text-muted-foreground">Controllo finestra 24h</span>
                  </span>
                </button>
              </div>
            </fieldset>

            <div className="relative space-y-1.5">
              <Label htmlFor="omni-recipient">Destinatario</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="omni-recipient"
                  value={recipient}
                  onChange={(event) => changeRecipient(event.target.value)}
                  placeholder={recipientHint}
                  className="pl-9"
                  autoComplete="off"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
              {selectedContact && (
                <p className="text-xs text-muted-foreground">
                  Contatto CRM: <span className="font-medium text-foreground">{selectedContact.name || selectedContact.email || selectedContact.phone}</span>
                </p>
              )}
              {suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
                  {suggestions.map((contact) => {
                    const destination = channel === "email"
                      ? contact.email
                      : contact.whatsapp_id || contact.phone
                    const disabled = !destination
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => chooseContact(contact)}
                        className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{contact.name || "Senza nome"}</span>
                          <span className="block truncate text-xs text-muted-foreground">{destination || `Nessun ${channel === "email" ? "indirizzo email" : "numero WhatsApp"}`}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {channel === "email" && (
              <div className="space-y-1.5">
                <Label htmlFor="omni-subject">Oggetto</Label>
                <Input id="omni-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Oggetto del messaggio" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="omni-body">Messaggio</Label>
              <Textarea
                id="omni-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Scrivi il messaggio…"
                className="min-h-40 resize-y"
              />
            </div>

            {channel === "whatsapp" && !queued && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex gap-2">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p>
                    Se il cliente ha scritto nelle ultime 24 ore il messaggio parte subito. Se la finestra è chiusa,
                    il testo viene conservato e parte prima il template di apertura.
                  </p>
                </div>
              </div>
            )}

            {queued && (
              <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">Comunicazione in attesa</p>
                    <p className="mt-1 text-sm">
                      Il cliente ha ricevuto la richiesta di apertura. Quando sceglie “Apri comunicazione”,
                      HotelAccelerator invierà automaticamente il messaggio che hai preparato.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {queued ? "Chiudi" : "Annulla"}
            </Button>
            {!queued && (
              <Button onClick={send} disabled={!recipient.trim() || !body.trim() || sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {channel === "whatsapp" ? "Invia / richiedi apertura" : "Invia email"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
