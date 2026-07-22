"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Loader2, ArrowDownLeft, ArrowUpRight, Send, StickyNote, Phone, GitBranch, Mail } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PipelineStageSelect } from "@/components/sales/pipeline-stage-select"
import { MessageBody } from "@/components/sales/message-body"
import {
  RichEmailComposer,
  ComposerSendButton,
  type ComposerAttachment,
} from "@/components/sales/rich-email-composer"
import { CcBccFields } from "@/components/sales/cc-bcc-fields"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Message = {
  id: string
  direction: "outbound" | "inbound"
  from_email: string | null
  to_email: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  received_at: string
}

type Activity = {
  id: string
  activity_type: "note" | "call" | "email_sent" | "email_received" | "stage_change" | "task"
  content: string | null
  metadata: Record<string, unknown>
  due_at: string | null
  completed_at: string | null
  created_at: string
}

/**
 * Dialog che mostra il thread di conversazione di un lead: email inviate dal
 * venditore (outbound) e risposte del cliente (inbound). Usato sia nell'area
 * venditore sia nella supervisione super admin.
 */
export function LeadConversationDialog({
  leadId,
  leadName,
  initialStage,
  open,
  onClose,
  onRead,
}: {
  leadId: string | null
  leadName?: string
  initialStage?: string | null
  open: boolean
  onClose: () => void
  /** Chiamato quando il thread viene aperto (per azzerare il badge non letti). */
  onRead?: () => void
}) {
  const { data, isLoading, mutate } = useSWR<{ messages: Message[]; lead?: { email: string | null } }>(
    open && leadId ? `/api/sales/leads/${leadId}/messages` : null,
    fetcher,
    { onSuccess: () => onRead?.() },
  )

  const messages = data?.messages ?? []
  const leadEmail = data?.lead?.email ?? null

  const editorRef = useRef<HTMLDivElement | null>(null)
  const [empty, setEmpty] = useState(true)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Destinatari aggiuntivi opzionali (copia visibile / copia nascosta).
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  // Funzione di refresh della timeline, registrata dal tab Cronologia.
  const [mutateActivities, setMutateActivities] = useState<() => void>(() => () => {})

  const canSend = !sending && (!empty || attachments.length > 0)

  async function sendReply() {
    const html = editorRef.current?.innerHTML ?? ""
    const hasText = (editorRef.current?.textContent ?? "").trim().length > 0
    if (!leadId || (!hasText && attachments.length === 0) || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: hasText ? html : "",
          attachments: attachments.map((a) => ({ url: a.url, filename: a.filename, contentType: a.contentType })),
          cc,
          bcc,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.message || "Invio non riuscito. Riprova.")
        return
      }
      if (editorRef.current) editorRef.current.innerHTML = ""
      setEmpty(true)
      setAttachments([])
      setCc("")
      setBcc("")
      await mutate()
    } catch {
      setError("Invio non riuscito. Riprova.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conversazione {leadName ? `— ${leadName}` : ""}</DialogTitle>
          <DialogDescription>
            Email, risposte del cliente e cronologia attività del lead.
          </DialogDescription>
        </DialogHeader>

        {/* Stadio pipeline: modificabile direttamente dalla scheda lead. */}
        {leadId ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium text-muted-foreground">Stadio trattativa</span>
            <PipelineStageSelect
              leadId={leadId}
              value={initialStage ?? "new"}
              onChanged={() => {
                void mutateActivities()
                onRead?.()
              }}
            />
          </div>
        ) : null}

        <Tabs defaultValue="conversation" className="mt-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="conversation">Conversazione</TabsTrigger>
            <TabsTrigger value="timeline">Cronologia</TabsTrigger>
          </TabsList>

          <TabsContent value="conversation" className="mt-3">
            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Caricamento conversazione...
              </div>
            ) : messages.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Nessun messaggio ancora. Le risposte del cliente compaiono qui appena arrivano
                (sincronizzazione automatica ogni pochi minuti).
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const inbound = m.direction === "inbound"
                  return (
                    <div
                      key={m.id}
                      className={`rounded-lg border p-3 ${
                        inbound ? "bg-muted/60 border-border" : "bg-background border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <Badge variant={inbound ? "default" : "secondary"} className="gap-1">
                          {inbound ? (
                            <>
                              <ArrowDownLeft className="h-3 w-3" /> Risposta cliente
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="h-3 w-3" /> Inviata
                            </>
                          )}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(m.received_at).toLocaleString("it-IT", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {m.subject ? (
                        <p className="text-sm font-medium leading-snug">{m.subject}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mb-2">
                        {inbound ? `Da: ${m.from_email ?? "—"}` : `A: ${m.to_email ?? "—"}`}
                      </p>
                      <MessageBody text={m.body_text} html={m.body_html} />
                    </div>
                  )
                })}
              </div>
            )}

            {/* Compositore risposta: il venditore risponde al lead da qui. */}
            <div className="border-t pt-3 mt-3">
              {leadEmail ? (
                <>
                  <RichEmailComposer
                    editorRef={editorRef}
                    placeholder={`Scrivi una risposta a ${leadEmail}...`}
                    sending={sending}
                    onChangeEmpty={setEmpty}
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                    showTemplates
                    templateData={{
                      firstName: leadName?.trim().split(/\s+/)[0],
                      lastName: leadName?.trim().split(/\s+/).slice(1).join(" "),
                    }}
                  />
                  <CcBccFields
                    cc={cc}
                    bcc={bcc}
                    onCcChange={setCc}
                    onBccChange={setBcc}
                    disabled={sending}
                    className="mt-2"
                  />
                  {error ? <p className="text-xs text-destructive mt-1.5">{error}</p> : null}
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">
                      La risposta viene inviata via email al cliente.
                    </span>
                    <ComposerSendButton
                      onClick={() => void sendReply()}
                      sending={sending}
                      disabled={!canSend}
                      label="Invia risposta"
                      icon={<Send className="h-4 w-4" />}
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Questo lead non ha un indirizzo email: non è possibile rispondere.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-3">
            <LeadTimeline leadId={leadId} open={open} registerMutate={setMutateActivities} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Tab cronologia: timeline attivita' del lead + composizione note/call.
 */
function LeadTimeline({
  leadId,
  open,
  registerMutate,
}: {
  leadId: string | null
  open: boolean
  registerMutate: (fn: () => void) => void
}) {
  const { data, isLoading, mutate } = useSWR<{ activities: Activity[] }>(
    open && leadId ? `/api/sales/leads/${leadId}/activities` : null,
    fetcher,
  )
  // Espone la mutate al genitore (per refresh dopo cambio stadio).
  useEffect(() => {
    registerMutate(() => void mutate())
  }, [registerMutate, mutate])

  const [note, setNote] = useState("")
  const [type, setType] = useState<"note" | "call">("note")
  const [saving, setSaving] = useState(false)
  const activities = data?.activities ?? []

  async function addNote() {
    if (!leadId || !note.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content: note.trim() }),
      })
      if (res.ok) {
        setNote("")
        await mutate()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Composizione nota / call */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={type === "note" ? "default" : "outline"}
            onClick={() => setType("note")}
          >
            <StickyNote className="h-3.5 w-3.5 mr-1" /> Nota
          </Button>
          <Button
            type="button"
            size="sm"
            variant={type === "call" ? "default" : "outline"}
            onClick={() => setType("call")}
          >
            <Phone className="h-3.5 w-3.5 mr-1" /> Chiamata
          </Button>
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={type === "note" ? "Aggiungi una nota interna..." : "Esito della chiamata..."}
          rows={2}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void addNote()} disabled={saving || !note.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento cronologia...
        </div>
      ) : activities.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nessuna attività registrata.
        </p>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {activities.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[1.42rem] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ActivityIcon type={a.activity_type} />
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground/80">
                  {ACTIVITY_LABEL[a.activity_type] ?? a.activity_type}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {a.content ? (
                <p className="text-sm whitespace-pre-wrap text-foreground/90">{a.content}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const ACTIVITY_LABEL: Record<string, string> = {
  note: "Nota",
  call: "Chiamata",
  email_sent: "Email inviata",
  email_received: "Risposta cliente",
  stage_change: "Cambio stadio",
  task: "Promemoria",
}

function ActivityIcon({ type }: { type: string }) {
  const cls = "h-3 w-3"
  if (type === "note") return <StickyNote className={cls} />
  if (type === "call") return <Phone className={cls} />
  if (type === "stage_change") return <GitBranch className={cls} />
  if (type === "email_received") return <ArrowDownLeft className={cls} />
  return <Mail className={cls} />
}
