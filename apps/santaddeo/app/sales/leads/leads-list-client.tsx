"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Mail, Loader2, Check, Pencil, Trash2, MessageSquare } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { EmailTemplateSelector, type CallOption, type ExtraRecipients } from "@/components/sales/email-template-selector"
import { LeadConversationDialog } from "@/components/sales/lead-conversation-dialog"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Lead = {
  id: string
  first_name: string
  last_name: string
  hotel_name: string
  email: string
  phone: string | null
  status: string
  email_sent_at: string | null
  email_sent_count: number
  registered_at: string | null
  hotel_id: string | null
  created_at: string
  notes: string | null
  last_email_subject: string | null
  last_email_body: string | null
  unread_replies?: number
  last_reply_at?: string | null
}

export function LeadsListClient({ agentName, agentEmail }: { agentName?: string; agentEmail?: string }) {
  const { data, isLoading, error, mutate } = useSWR<{ leads: Lead[] }>("/api/sales/leads", fetcher)
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [convLead, setConvLead] = useState<Lead | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSend(
    subject: string,
    body: string,
    callOption?: CallOption,
    recipients?: ExtraRecipients,
  ) {
    if (!activeLead) return
    const res = await fetch(`/api/sales/leads/${activeLead.id}/send-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        custom_subject: subject,
        custom_body: body,
        call_option: callOption,
        cc: recipients?.cc,
        bcc: recipients?.bcc,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(json.message || json.error || `HTTP ${res.status}`)
    }
    setActiveLead(null)
    setFeedback(`Email inviata a ${activeLead.first_name} ${activeLead.last_name}.`)
    mutate()
    setTimeout(() => setFeedback(null), 4000)
  }

  async function handleDelete(lead: Lead) {
    if (!confirm(`Eliminare il lead ${lead.first_name} ${lead.last_name}?`)) return
    const res = await fetch(`/api/sales/leads/${lead.id}`, { method: "DELETE" })
    if (res.ok) {
      setFeedback(`Lead ${lead.first_name} ${lead.last_name} eliminato.`)
      mutate()
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground">Caricamento...</div>
  }
  if (error || !data) {
    return <div className="text-destructive">Errore caricamento lead.</div>
  }
  if (data.leads.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground">
        <p>Nessun lead inserito ancora.</p>
      </Card>
    )
  }

  return (
    <>
      {feedback ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <Check className="h-4 w-4" /> {feedback}
        </div>
      ) : null}

      <Card className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Struttura</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Inviata il</TableHead>
                <TableHead>Registrato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.leads.map((l) => {
                const alreadySent = !!l.email_sent_at
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      {l.first_name} {l.last_name}
                      {l.phone ? (
                        <div className="text-xs text-muted-foreground">{l.phone}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{l.hotel_name}</TableCell>
                    <TableCell className="text-sm">{l.email}</TableCell>
                    <TableCell>
                      <LeadStatusBadge status={l.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.email_sent_at
                        ? new Date(l.email_sent_at).toLocaleDateString("it-IT")
                        : "—"}
                      {l.email_sent_count > 1 ? (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ({l.email_sent_count}x)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.registered_at
                        ? new Date(l.registered_at).toLocaleDateString("it-IT")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="relative"
                          onClick={() => setConvLead(l)}
                          title="Vedi conversazione"
                        >
                          <MessageSquare className="h-4 w-4 mr-1.5 opacity-70" />
                          Conversazione
                          {l.unread_replies && l.unread_replies > 0 ? (
                            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
                              {l.unread_replies}
                            </span>
                          ) : null}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditLead(l)}
                        >
                          <Pencil className="h-4 w-4 mr-1.5 opacity-70" />
                          Modifica
                        </Button>
                        <Button
                          variant={alreadySent ? "ghost" : "outline"}
                          size="sm"
                          onClick={() => setActiveLead(l)}
                        >
                          <Mail className="h-4 w-4 mr-1.5 opacity-70" />
                          {alreadySent ? "Re-invia" : "Invia email"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(l)}
                          title="Elimina lead"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Card list (mobile) */}
      <div className="md:hidden space-y-3">
        {data.leads.map((l) => {
          const alreadySent = !!l.email_sent_at
          return (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">
                    {l.first_name} {l.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">{l.hotel_name}</p>
                </div>
                <LeadStatusBadge status={l.status} />
              </div>

              <div className="mt-2 space-y-1 text-sm">
                <a href={`mailto:${l.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{l.email}</span>
                </a>
                {l.phone ? (
                  <a href={`tel:${l.phone}`} className="block text-muted-foreground">
                    {l.phone}
                  </a>
                ) : null}
                {l.email_sent_at ? (
                  <p className="text-xs text-muted-foreground">
                    Inviata il {new Date(l.email_sent_at).toLocaleDateString("it-IT")}
                    {l.email_sent_count > 1 ? ` (${l.email_sent_count}x)` : ""}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 mt-3">
                <Button
                  variant={alreadySent ? "secondary" : "default"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setActiveLead(l)}
                >
                  <Mail className="h-4 w-4 mr-1.5" />
                  {alreadySent ? "Re-invia" : "Invia email"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditLead(l)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative"
                  onClick={() => setConvLead(l)}
                  title="Conversazione"
                >
                  <MessageSquare className="h-4 w-4" />
                  {l.unread_replies && l.unread_replies > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                      {l.unread_replies}
                    </span>
                  ) : null}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(l)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Dialog invio email a un lead esistente */}
      <Dialog open={!!activeLead} onOpenChange={(open) => !open && setActiveLead(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Invia email a {activeLead?.first_name} {activeLead?.last_name}
            </DialogTitle>
            <DialogDescription>
              Struttura: <strong>{activeLead?.hotel_name}</strong> — {activeLead?.email}
            </DialogDescription>
          </DialogHeader>
          {activeLead ? (
            <EmailTemplateSelector
              leadData={{
                first_name: activeLead.first_name,
                last_name: activeLead.last_name,
                hotel_name: activeLead.hotel_name,
                email: activeLead.email,
              }}
              agentName={agentName}
              agentEmail={agentEmail}
              initialSubject={activeLead.email_sent_at ? activeLead.last_email_subject : null}
              initialBody={activeLead.email_sent_at ? activeLead.last_email_body : null}
              onSend={handleSend}
              onCancel={() => setActiveLead(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Dialog conversazione (thread email + risposte) */}
      <LeadConversationDialog
        leadId={convLead?.id ?? null}
        leadName={convLead ? `${convLead.first_name} ${convLead.last_name}` : undefined}
        open={!!convLead}
        onClose={() => setConvLead(null)}
        onRead={() => mutate()}
      />

      {/* Dialog modifica lead */}
      <EditLeadDialog
        lead={editLead}
        onClose={() => setEditLead(null)}
        onSaved={(msg) => {
          setEditLead(null)
          setFeedback(msg)
          mutate()
          setTimeout(() => setFeedback(null), 4000)
        }}
      />
    </>
  )
}

function EditLeadDialog({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [hotelName, setHotelName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Sincronizza i campi quando cambia il lead selezionato.
  const [loadedId, setLoadedId] = useState<string | null>(null)
  if (lead && lead.id !== loadedId) {
    setLoadedId(lead.id)
    setFirstName(lead.first_name)
    setLastName(lead.last_name)
    setHotelName(lead.hotel_name)
    setEmail(lead.email)
    setPhone(lead.phone ?? "")
    setNotes(lead.notes ?? "")
    setErr(null)
  }

  async function handleSave() {
    if (!lead) return
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/sales/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          hotel_name: hotelName,
          email,
          phone,
          notes,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.message || json.error || `HTTP ${res.status}`)
      }
      onSaved(`Lead ${firstName} ${lastName} aggiornato.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore salvataggio")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifica lead</DialogTitle>
          <DialogDescription>Aggiorna i dati del potenziale cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-first">Nome</Label>
              <Input id="edit-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-last">Cognome</Label>
              <Input id="edit-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-hotel">Struttura</Label>
            <Input id="edit-hotel" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">Telefono</Label>
            <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Note</Label>
            <Textarea id="edit-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
            Salva
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LeadStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    draft: { label: "Bozza", variant: "outline" },
    invited: { label: "Email inviata", variant: "secondary" },
    opened: { label: "Email aperta", variant: "secondary" },
    clicked: { label: "Click", variant: "secondary" },
    registered: { label: "Registrato", variant: "default" },
    converted: { label: "Convertito", variant: "default" },
    rejected: { label: "Rifiutato", variant: "outline" },
  }
  const cfg = map[status] ?? { label: status, variant: "outline" as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}
