"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Mail,
  MessageCircle,
  Search,
  Send,
  Loader2,
  CheckCircle2,
  Clock3,
  Paperclip,
  X,
  Instagram,
  Facebook,
  Bot,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ContactSuggestion {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  whatsapp_id: string | null
}

type ComposeChannel = "email" | "whatsapp" | "telegram" | "messenger" | "instagram"
type Subchannel = { id: string; channel: ComposeChannel; label: string; detail: string | null }

const channelMeta: Record<ComposeChannel, { label: string; icon: typeof Mail }> = {
  email: { label: "Email", icon: Mail },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  telegram: { label: "Telegram", icon: Bot },
  messenger: { label: "Facebook", icon: Facebook },
  instagram: { label: "Instagram", icon: Instagram },
}

export function OmnichannelCompose() {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<ComposeChannel>("email")
  const [subchannels, setSubchannels] = useState<Subchannel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState("")
  const [recipient, setRecipient] = useState("")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactSuggestion | null>(null)
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const [queued, setQueued] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchSeq = useRef(0)

  const availableTypes = useMemo(() => {
    const types = new Set(subchannels.map((item) => item.channel))
    return (["email", "whatsapp", "telegram", "messenger", "instagram"] as ComposeChannel[]).filter((type) => types.has(type))
  }, [subchannels])

  const channelsForType = useMemo(() => subchannels.filter((item) => item.channel === channel), [subchannels, channel])

  const reset = () => {
    setChannel("email")
    setSelectedChannelId("")
    setRecipient("")
    setCc("")
    setBcc("")
    setShowCc(false)
    setShowBcc(false)
    setSubject("")
    setBody("")
    setAttachments([])
    setSelectedContact(null)
    setSuggestions([])
    setQueued(false)
  }

  useEffect(() => {
    if (!open) return
    fetch("/api/inbox/subchannels", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const rows: Subchannel[] = data.subchannels ?? []
        setSubchannels(rows)
        const firstEmail = rows.find((row) => row.channel === "email")
        const first = firstEmail || rows[0]
        if (first) {
          setChannel(first.channel)
          setSelectedChannelId(first.id)
        }
      })
      .catch(() => setSubchannels([]))
  }, [open])

  useEffect(() => {
    const first = channelsForType[0]
    if (first && !channelsForType.some((item) => item.id === selectedChannelId)) setSelectedChannelId(first.id)
  }, [channel, channelsForType, selectedChannelId])

  useEffect(() => {
    if (!open || selectedContact || recipient.trim().length < 2 || channel === "telegram" || channel === "messenger" || channel === "instagram") {
      setSuggestions([])
      return
    }
    const seq = ++searchSeq.current
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/inbox/compose/contacts?q=${encodeURIComponent(recipient.trim())}`)
        const data = await res.json().catch(() => ({}))
        if (seq === searchSeq.current) setSuggestions(res.ok ? data.contacts ?? [] : [])
      } finally {
        if (seq === searchSeq.current) setSearching(false)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [open, recipient, selectedContact, channel])

  const chooseContact = (contact: ContactSuggestion) => {
    setSelectedContact(contact)
    setSuggestions([])
    setRecipient(channel === "email" ? contact.email || "" : contact.whatsapp_id || contact.phone || "")
  }

  const recipientHint = channel === "email"
    ? "Destinatari"
    : channel === "whatsapp"
      ? "+39..."
      : channel === "telegram"
        ? "ID chat Telegram"
        : "Seleziona una conversazione esistente"

  const send = async () => {
    if (!recipient.trim() || !body.trim()) return
    if (channel === "messenger" || channel === "instagram") {
      toast.error("Per Facebook e Instagram l'avvio di un nuovo DM è consentito solo verso conversazioni già aperte dal cliente. Usa la conversazione esistente in Inbox.")
      return
    }

    setSending(true)
    setQueued(false)
    try {
      if (channel === "email") {
        const form = new FormData()
        form.append("to", recipient.trim())
        form.append("cc", cc.trim())
        form.append("bcc", bcc.trim())
        form.append("subject", subject.trim())
        form.append("body", body.trim())
        if (selectedChannelId) form.append("channelId", selectedChannelId)
        attachments.forEach((file) => form.append("attachments", file))
        const res = await fetch("/api/gmail/compose", { method: "POST", body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Invio email non riuscito")
        toast.success("Email inviata")
        reset()
        setOpen(false)
        return
      }

      const endpoint = channel === "telegram" ? "/api/inbox/compose/telegram" : "/api/inbox/compose/whatsapp"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient.trim(),
          body: body.trim(),
          channelId: selectedChannelId || undefined,
          contactId: selectedContact?.id,
          contactName: selectedContact?.name,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Invio non riuscito")
      if (channel === "whatsapp" && data.mode === "queued") {
        setQueued(true)
        setBody("")
        toast.success("Richiesta di apertura WhatsApp inviata")
      } else {
        toast.success(channel === "telegram" ? "Messaggio Telegram inviato" : "Messaggio WhatsApp inviato")
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
      <Button type="button" onClick={() => setOpen(true)} className="h-12 gap-3 rounded-2xl px-5 shadow-sm" aria-label="Crea un nuovo messaggio">
        <Send className="h-5 w-5" />
        Nuovo messaggio
      </Button>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Nuovo messaggio</DialogTitle>
          </DialogHeader>

          <div className="px-5 pt-3">
            <div className="flex flex-wrap gap-2 border-b pb-3">
              {availableTypes.map((type) => {
                const Icon = channelMeta[type].icon
                return (
                  <button key={type} type="button" onClick={() => { setChannel(type); setRecipient(""); setSelectedContact(null) }}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${channel === type ? "border-foreground bg-muted font-medium" : "hover:bg-muted/60"}`}>
                    <Icon className="h-4 w-4" />{channelMeta[type].label}
                  </button>
                )
              })}
            </div>

            {channelsForType.length > 0 && (
              <div className="flex items-center gap-3 border-b py-2 text-sm">
                <span className="w-10 shrink-0 text-muted-foreground">Da</span>
                <Select value={selectedChannelId || channelsForType[0]?.id} onValueChange={setSelectedChannelId}>
                  <SelectTrigger className="h-8 flex-1 border-0 px-0 shadow-none focus:ring-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {channelsForType.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}{item.detail ? ` · ${item.detail}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="relative flex items-center gap-3 border-b py-2">
              <span className="w-10 shrink-0 text-sm text-muted-foreground">A</span>
              <div className="relative flex-1">
                <Input value={recipient} onChange={(e) => { setRecipient(e.target.value); setSelectedContact(null) }} placeholder={recipientHint}
                  className="h-8 border-0 px-0 shadow-none focus-visible:ring-0" autoComplete="off" />
                {searching && <Loader2 className="absolute right-1 top-2 h-4 w-4 animate-spin text-muted-foreground" />}
                {suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-9 z-30 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
                    {suggestions.map((contact) => (
                      <button key={contact.id} type="button" onClick={() => chooseContact(contact)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent">
                        <span className="block font-medium">{contact.name || "Senza nome"}</span>
                        <span className="text-xs text-muted-foreground">{channel === "email" ? contact.email : contact.whatsapp_id || contact.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {channel === "email" && (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <button type="button" onClick={() => setShowCc(true)}>Cc</button>
                  <button type="button" onClick={() => setShowBcc(true)}>Ccn</button>
                </div>
              )}
            </div>

            {channel === "email" && showCc && (
              <div className="flex items-center gap-3 border-b py-2"><span className="w-10 text-sm text-muted-foreground">Cc</span><Input value={cc} onChange={(e) => setCc(e.target.value)} className="h-8 border-0 px-0 shadow-none focus-visible:ring-0" /></div>
            )}
            {channel === "email" && showBcc && (
              <div className="flex items-center gap-3 border-b py-2"><span className="w-10 text-sm text-muted-foreground">Ccn</span><Input value={bcc} onChange={(e) => setBcc(e.target.value)} className="h-8 border-0 px-0 shadow-none focus-visible:ring-0" /></div>
            )}
            {channel === "email" && (
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Oggetto" className="h-11 rounded-none border-0 border-b px-0 shadow-none focus-visible:ring-0" />
            )}

            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Scrivi il messaggio..." className="min-h-72 resize-y rounded-none border-0 px-0 py-4 shadow-none focus-visible:ring-0" />

            {channel === "email" && attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t py-3">
                {attachments.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
                    {file.name}<button type="button" onClick={() => setAttachments((files) => files.filter((_, i) => i !== index))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}

            {channel === "whatsapp" && !queued && (
              <div className="mb-3 flex gap-2 rounded-lg bg-muted/50 p-3 text-sm"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />Se la finestra 24h è chiusa, HotelAccelerator usa automaticamente il template di apertura.</div>
            )}
            {(channel === "messenger" || channel === "instagram") && (
              <div className="mb-3 rounded-lg bg-muted/50 p-3 text-sm">Per questo canale Meta consente l'invio solo all'interno di una conversazione già avviata dal cliente. Le risposte restano disponibili direttamente dalla conversazione in Inbox.</div>
            )}
            {queued && (
              <div className="mb-3 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5" />Comunicazione in attesa: il messaggio partirà dopo “Apri comunicazione”.</div>
            )}
          </div>

          <DialogFooter className="flex-row items-center justify-between border-t px-5 py-3 sm:justify-between">
            <div>
              {channel === "email" && (
                <>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setAttachments((files) => [...files, ...Array.from(e.target.files || [])])} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title="Allega file"><Paperclip className="h-5 w-5" /></Button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>{queued ? "Chiudi" : "Annulla"}</Button>
              {!queued && (
                <Button onClick={send} disabled={!recipient.trim() || !body.trim() || sending || channel === "messenger" || channel === "instagram"}>
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Invia
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
