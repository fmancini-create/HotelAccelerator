"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import {
  Mail,
  Inbox,
  Send,
  Search,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Users,
  User,
  CornerUpLeft,
  PenSquare,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { stageLabel, PipelineStageSelect } from "@/components/sales/pipeline-stage-select"
import { LeadTimeline } from "@/components/sales/lead-timeline"
import { MessageBody } from "@/components/sales/message-body"
import {
  RichEmailComposer,
  ComposerSendButton,
  clearComposerDraft,
  type ComposerAttachment,
} from "@/components/sales/rich-email-composer"
import {
  CallOptionPicker,
  buildCallOption,
  DEFAULT_CALL_STATE,
  type CallState,
} from "@/components/sales/call-option-picker"
import { CcBccFields } from "@/components/sales/cc-bcc-fields"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { EMAIL_TEMPLATES, type EmailTemplate } from "@/lib/sales/email-templates"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Conversation = {
  lead_id: string
  first_name: string | null
  last_name: string | null
  hotel_name: string | null
  email: string | null
  pipeline_stage: string | null
  unread_replies: number
  agent_name: string | null
  last_subject: string | null
  preview: string | null
  last_from: string | null
  last_direction: "inbound" | "outbound" | null
  last_at: string | null
  message_count: number
}

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

const FOLDERS = [
  { key: "all", label: "Tutte", icon: Mail },
  { key: "unread", label: "Da leggere", icon: Inbox },
  { key: "inbound", label: "Risposte clienti", icon: ArrowDownLeft },
  { key: "outbound", label: "Inviate", icon: Send },
] as const

/**
 * Vero su viewport desktop (>= md). Le colonne ridimensionabili (panel group)
 * hanno senso solo qui; su mobile si mostra la sola lista a tutta larghezza.
 * Default true per evitare flash di layout sui desktop (caso piu' comune).
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isDesktop
}

/**
 * Vista posta stile Gmail (3 colonne): cartelle/filtri, lista conversazioni,
 * thread aperto con riquadro di risposta.
 *
 * - `basePath`: prefisso route ("/sales" o "/superadmin/sales").
 * - `admin`: vista superadmin (mostra colonna venditore). Il thread resta
 *   comunque rispondibile (il superadmin possiede tutti i lead).
 */
export function MailClient({
  basePath = "/sales",
  admin = false,
}: {
  basePath?: string
  admin?: boolean
}) {
  const [folder, setFolder] = useState<string>("all")
  const [scope, setScope] = useState<"own" | "team">("own")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)

  // L'API filtra server-side solo "unread"; i filtri di direzione
  // ("inbound"/"outbound") sono applicati client-side sull'ultimo messaggio.
  const params = new URLSearchParams()
  params.set("folder", folder === "unread" ? "unread" : "all")
  if (scope === "team") params.set("scope", "team")
  if (q.trim()) params.set("q", q.trim())

  const { data, isLoading, mutate } = useSWR<{
    conversations: Conversation[]
    can_view_team: boolean
    counts?: { inbox: number; unread: number }
  }>(`/api/sales/conversations?${params.toString()}`, fetcher, { refreshInterval: 60_000 })

  // Identità del venditore loggato: serve per risolvere {{nome_venditore}} /
  // {{email_venditore}} nell'editor (firma visibile subito, non il segnaposto).
  const { data: meData } = useSWR<{ agentName: string; agentEmail: string }>("/api/sales/me", fetcher)
  const meName = meData?.agentName ?? ""
  const meEmail = meData?.agentEmail ?? ""

  const allConversations = data?.conversations ?? []
  const conversations = useMemo(() => {
    if (folder === "inbound") return allConversations.filter((c) => c.last_direction === "inbound")
    if (folder === "outbound") return allConversations.filter((c) => c.last_direction === "outbound")
    return allConversations
  }, [allConversations, folder])
  const canViewTeam = data?.can_view_team ?? false
  const showAgentColumn = admin || scope === "team"
  const selectedConv = useMemo(
    () => conversations.find((c) => c.lead_id === selected) ?? null,
    [conversations, selected],
  )
  const isDesktop = useIsDesktop()

  // Colonna 1: cartelle / filtri
  const navColumn = (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-r border-border bg-muted/30 p-3">
        <Button className="mb-3 justify-start" onClick={() => setComposeOpen(true)}>
          <PenSquare className="mr-2 h-4 w-4" /> Scrivi
        </Button>
        <nav className="flex flex-col gap-0.5">
          {FOLDERS.map((f) => {
            const Icon = f.icon
            const active = folder === f.key
            const count =
              f.key === "unread" ? data?.counts?.unread : f.key === "all" ? data?.counts?.inbox : undefined
            return (
              <button
                key={f.key}
                onClick={() => setFolder(f.key)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                  active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {f.label}
                </span>
                {typeof count === "number" && count > 0 ? (
                  <span className="text-xs text-muted-foreground">{count}</span>
                ) : null}
              </button>
            )
          })}
        </nav>

        {/* Toggle Io / Team per capo area */}
        {canViewTeam ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">Visualizza</p>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => setScope("own")}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  scope === "own" ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
                )}
              >
                <User className="h-4 w-4" /> Solo la mia
              </button>
              <button
                onClick={() => setScope("team")}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  scope === "team" ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
                )}
              >
                <Users className="h-4 w-4" /> Tutto il team
              </button>
            </div>
          </div>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="mt-auto justify-start text-muted-foreground"
          onClick={() => void mutate()}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Aggiorna
        </Button>
      </aside>
  )

  // Colonna 2: lista conversazioni
  const listColumn = (
      <div className="flex h-full min-h-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca nome, hotel o email..."
              className="pl-8"
            />
          </div>
          {/* Scrivi (visibile anche su mobile, dove la sidebar è nascosta) */}
          <Button size="icon" className="shrink-0 md:hidden" onClick={() => setComposeOpen(true)} aria-label="Scrivi">
            <PenSquare className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento...
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nessuna conversazione in questa cartella.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => {
                const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "Lead"
                const active = c.lead_id === selected
                const unread = c.unread_replies > 0
                return (
                  <li key={c.lead_id}>
                    <button
                      onClick={() => setSelected(c.lead_id)}
                      className={cn(
                        "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors",
                        active ? "bg-primary/10" : "hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
                          )}
                        >
                          {name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {c.last_at ? formatShort(c.last_at) : ""}
                        </span>
                      </div>
                      {c.hotel_name ? (
                        <span className="truncate text-xs text-muted-foreground">{c.hotel_name}</span>
                      ) : null}
                      <div className="flex items-center gap-1.5">
                        {c.last_direction === "inbound" ? (
                          <ArrowDownLeft className="h-3 w-3 shrink-0 text-primary" />
                        ) : c.last_direction === "outbound" ? (
                          <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : null}
                        <span className="truncate text-xs text-muted-foreground">
                          {c.preview ?? c.last_subject ?? "—"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          {stageLabel(c.pipeline_stage)}
                        </Badge>
                        {unread ? (
                          <Badge className="h-5 px-1.5 text-[10px]">{c.unread_replies} nuova</Badge>
                        ) : null}
                        {showAgentColumn && c.agent_name ? (
                          <span className="ml-auto truncate text-[10px] text-muted-foreground">
                            {c.agent_name}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
  )

  // Colonna 3: composizione inline OPPURE thread aperto
  const detailColumn = (
      <div className="flex h-full min-h-0 flex-col">
        {composeOpen ? (
          <ComposePanel
            admin={admin}
            agentName={meName}
            agentEmail={meEmail}
            onClose={() => setComposeOpen(false)}
            onSent={(leadId) => {
              void mutate()
              setComposeOpen(false)
              if (leadId) setSelected(leadId)
            }}
          />
        ) : selectedConv ? (
          <ThreadPane
            key={selectedConv.lead_id}
            basePath={basePath}
            conv={selectedConv}
            admin={admin}
            agentName={meName}
            agentEmail={meEmail}
            onChanged={() => void mutate()}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Mail className="h-10 w-10 opacity-40" />
            <p className="text-sm">Seleziona una conversazione per leggerla</p>
          </div>
        )}
      </div>
  )

  return (
    <div className="h-[calc(100vh-9rem)] overflow-hidden rounded-lg border border-border bg-card">
      {isDesktop ? (
        // Desktop: 3 colonne ridimensionabili a piacere (le dimensioni vengono
        // ricordate per-utente dal panel group via autoSaveId).
        <ResizablePanelGroup direction="horizontal" autoSaveId="sales-mail-columns" className="h-full">
          <ResizablePanel defaultSize={16} minSize={12} maxSize={28}>
            {navColumn}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            {listColumn}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={54} minSize={30}>
            {detailColumn}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        // Mobile: solo la lista a tutta larghezza (come prima).
        <div className="flex h-full flex-col">{listColumn}</div>
      )}
    </div>
  )
}

/** Pannello di lettura del thread + riquadro risposta. */
function ThreadPane({
  conv,
  basePath,
  admin = false,
  agentName,
  agentEmail,
  onChanged,
}: {
  conv: Conversation
  basePath: string
  admin?: boolean
  /** Identità del venditore loggato (fallback firma se il lead non ha owner). */
  agentName?: string
  agentEmail?: string
  onChanged?: () => void
}) {
  const { data, isLoading, mutate } = useSWR<{ messages: Message[]; lead?: { email: string | null } }>(
    `/api/sales/leads/${conv.lead_id}/messages`,
    fetcher,
    { onSuccess: () => onChanged?.() },
  )
  const messages = data?.messages ?? []
  const leadEmail = data?.lead?.email ?? conv.email ?? null
  const name = `${conv.first_name ?? ""} ${conv.last_name ?? ""}`.trim() || leadEmail || "Lead"

  const editorRef = useRef<HTMLDivElement | null>(null)
  const [empty, setEmpty] = useState(true)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Destinatari aggiuntivi opzionali (copia visibile / copia nascosta).
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  // Opzione "call" da allegare alla risposta (link Meet / form prenotazione).
  const [callState, setCallState] = useState<CallState>(DEFAULT_CALL_STATE)
  // forza il refresh della timeline dopo un cambio stadio.
  const [timelineKey, setTimelineKey] = useState(0)
  // Identita' di invio (solo super admin): "agent" = venditore del lead,
  // "superadmin" = io super admin con la mia firma + SANTADDEO.
  const [sendAs, setSendAs] = useState<"agent" | "superadmin">("agent")

  const hasCall = callState.kind !== "none"
  const canSend = !sending && (!empty || attachments.length > 0 || hasCall)

  async function sendReply() {
    const html = editorRef.current?.innerHTML ?? ""
    const hasText = (editorRef.current?.textContent ?? "").trim().length > 0
    // Costruisci/valida la call option scelta.
    const { option: callOption, error: callErr } = buildCallOption(callState)
    if (callErr) {
      setError(callErr)
      return
    }
    if ((!hasText && attachments.length === 0 && callOption.type === "none") || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/sales/leads/${conv.lead_id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: hasText ? html : "",
          attachments: attachments.map((a) => ({ url: a.url, filename: a.filename, contentType: a.contentType })),
          ...(callOption.type !== "none" ? { call_option: callOption } : {}),
          ...(admin ? { sendAs } : {}),
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
      clearComposerDraft(`reply:${conv.lead_id}`)
      setEmpty(true)
      setAttachments([])
      setCc("")
      setBcc("")
      setCallState(DEFAULT_CALL_STATE)
      await mutate()
      onChanged?.()
    } catch {
      setError("Invio non riuscito. Riprova.")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Intestazione thread */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-base font-semibold text-foreground">{name}</h3>
          <PipelineStageSelect
            leadId={conv.lead_id}
            value={conv.pipeline_stage ?? "new"}
            onChanged={() => {
              setTimelineKey((k) => k + 1)
              onChanged?.()
            }}
          />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {conv.hotel_name ? `${conv.hotel_name} · ` : ""}
          {leadEmail ?? "—"}
          {conv.agent_name ? ` · ${conv.agent_name}` : ""}
        </p>
      </div>

      <Tabs defaultValue="conversation" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4 pt-2">
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="conversation">Conversazione</TabsTrigger>
            <TabsTrigger value="timeline">Cronologia</TabsTrigger>
          </TabsList>
        </div>

        {/* Tab Conversazione: messaggi + risposta */}
        <TabsContent value="conversation" className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Caricamento conversazione...
              </div>
            ) : messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nessun messaggio. Le risposte del cliente compaiono qui appena arrivano.
              </p>
            ) : (
              messages.map((m) => {
                const inbound = m.direction === "inbound"
                return (
                  <div
                    key={m.id}
                    className={cn("rounded-lg border p-3", inbound ? "bg-muted/60" : "bg-background")}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
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
                      <span className="text-xs text-muted-foreground">{formatFull(m.received_at)}</span>
                    </div>
                    {m.subject ? <p className="text-sm font-medium leading-snug">{m.subject}</p> : null}
                    <p className="mb-2 text-xs text-muted-foreground">
                      {inbound ? `Da: ${m.from_email ?? "—"}` : `A: ${m.to_email ?? "—"}`}
                    </p>
                    <MessageBody text={m.body_text} html={m.body_html} />
                  </div>
                )
              })
            )}
          </div>

          {/* Riquadro risposta con formattazione + allegati.
              `shrink-0 max-h-[55%] overflow-y-auto`: su schermi bassi (es. sessioni
              AnyDesk) impedisce che il composer + Cc/Bcc + call picker mangino
              tutta l'altezza schiacciando l'area messaggi; il riquadro scrolla
              internamente e la conversazione resta sempre leggibile. */}
          <div className="shrink-0 max-h-[55%] overflow-y-auto border-t border-border p-3">
            {leadEmail ? (
              <>
                <RichEmailComposer
                  editorRef={editorRef}
                  placeholder={`Rispondi a ${leadEmail}...`}
                  sending={sending}
                  onChangeEmpty={setEmpty}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  draftKey={`reply:${conv.lead_id}`}
                  showTemplates
                  templateData={{
                    firstName: conv.first_name ?? undefined,
                    lastName: conv.last_name ?? undefined,
                    hotelName: conv.hotel_name ?? undefined,
                    // Firma: il venditore proprietario del lead (chi invia di
                    // default), con fallback al venditore loggato.
                    agentName: conv.agent_name ?? agentName ?? undefined,
                    agentEmail: agentEmail ?? undefined,
                  }}
                  onApplyTemplate={(tpl) => {
                    // "Fissa una demo": attiva subito la scelta dei 3 orari.
                    if (tpl.id === "fissa-demo") {
                      setCallState((s) =>
                        s.kind === "propose" ? s : { ...s, kind: "propose", proposedSlots: [] },
                      )
                    }
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
                <div className="mt-2">
                  <CallOptionPicker value={callState} onChange={setCallState} disabled={sending} />
                </div>
                {admin ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Invia come:</span>
                    <div className="inline-flex overflow-hidden rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => setSendAs("agent")}
                        className={cn(
                          "px-2.5 py-1 text-xs transition-colors",
                          sendAs === "agent"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {conv.agent_name ? `Venditore (${conv.agent_name})` : "Venditore del lead"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendAs("superadmin")}
                        className={cn(
                          "border-l border-border px-2.5 py-1 text-xs transition-colors",
                          sendAs === "superadmin"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        Io (Super Admin)
                      </button>
                    </div>
                  </div>
                ) : null}
                {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <a
                    href={`${basePath}/leads`}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Apri nei lead
                  </a>
                  <ComposerSendButton
                    onClick={() => void sendReply()}
                    sending={sending}
                    disabled={!canSend}
                    label="Invia risposta"
                    icon={<CornerUpLeft className="h-4 w-4" />}
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

        {/* Tab Cronologia: timeline note/call + composizione */}
        <TabsContent value="timeline" className="min-h-0 flex-1 overflow-y-auto p-4 data-[state=inactive]:hidden">
          <LeadTimeline key={timelineKey} leadId={conv.lead_id} onChanged={() => onChanged?.()} />
        </TabsContent>
      </Tabs>
    </>
  )
}

/**
 * Pannello di composizione "mail libera" INLINE (occupa la colonna 3 al posto
 * del thread, niente piu' popup): raccoglie i dati minimi del destinatario,
 * crea il lead al volo e invia l'email tramite `POST /api/sales/leads` (stesso
 * flusso di "Nuovo lead", con mittente alias venditore + BCC archivio +
 * registrazione nel thread). Nessuna chiusura accidentale: si esce solo con
 * "Annulla" o dopo l'invio, quindi il testo non si perde.
 */
type SalesAgentOption = {
  id: string
  display_name: string | null
  email: string | null
  sender_email: string | null
  is_active: boolean
}

function ComposePanel({
  admin,
  agentName,
  agentEmail,
  onClose,
  onSent,
}: {
  admin?: boolean
  /** Identità del venditore loggato: firma {{nome_venditore}}/{{email_venditore}}. */
  agentName?: string
  agentEmail?: string
  onClose: () => void
  onSent: (leadId?: string) => void
}) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [hotelName, setHotelName] = useState("")
  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)
  // Super admin: deve scegliere a nome di quale venditore inviare, perche' lui
  // non ha un sales_agent proprio (l'invio fallirebbe con "no_sales_agent").
  // I venditori normali inviano sempre a proprio nome -> nessun selettore.
  const [agentId, setAgentId] = useState("")
  const { data: agentsData } = useSWR<{ agents: SalesAgentOption[] }>(
    admin ? "/api/superadmin/sales/agents" : null,
    fetcher,
  )
  const activeAgents = useMemo(
    () => (agentsData?.agents ?? []).filter((a) => a.is_active),
    [agentsData],
  )
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [bodyEmpty, setBodyEmpty] = useState(true)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [callState, setCallState] = useState<CallState>(DEFAULT_CALL_STATE)
  // Destinatari aggiuntivi opzionali (copia visibile / copia nascosta).
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")

  // Applica una risposta predefinita: sostituisce i placeholder con i dati
  // del destinatario inseriti finora e mostra il testo nell'editor.
  // {{nome_venditore}}, {{email_venditore}} e {{link_*}} restano invariati:
  // vengono risolti lato server al momento dell'invio (come nei lead).
  function applyTemplate(tpl: EmailTemplate) {
    const fill = (text: string) =>
      text
        .replace(/\{\{nome_lead\}\}/g, firstName.trim() || "{{nome_lead}}")
        .replace(/\{\{cognome_lead\}\}/g, lastName.trim() || "{{cognome_lead}}")
        .replace(/\{\{nome_struttura\}\}/g, hotelName.trim() || "{{nome_struttura}}")
        // Firma del venditore loggato: mostrata subito nell'editor (e comunque
        // ri-risolta lato server all'invio).
        .replace(/\{\{nome_venditore\}\}/g, agentName?.trim() || "{{nome_venditore}}")
        .replace(/\{\{email_venditore\}\}/g, agentEmail?.trim() || "{{email_venditore}}")
    setActiveTemplate(tpl.id)
    setSubject(fill(tpl.subject))
    // Inietta il corpo (HTML del template) direttamente nell'editor rich-text.
    const html = fill(tpl.body)
    if (editorRef.current) {
      editorRef.current.innerHTML = html
      setBodyEmpty((editorRef.current.textContent ?? "").trim().length === 0)
    }
    // Il template "Fissa una demo" richiede i 3 orari: attiva subito la modalità
    // "Proponi 3 orari" così il venditore vede il selettore senza cercarlo.
    if (tpl.id === "fissa-demo") {
      setCallState((s) => (s.kind === "propose" ? s : { ...s, kind: "propose", proposedSlots: [] }))
    }
  }

  function reset() {
    setFirstName("")
    setLastName("")
    setHotelName("")
    setEmail("")
    setSubject("")
    setActiveTemplate(null)
    setError(null)
    setAttachments([])
    setCallState(DEFAULT_CALL_STATE)
    setCc("")
    setBcc("")
    if (editorRef.current) editorRef.current.innerHTML = ""
    clearComposerDraft("compose")
    setBodyEmpty(true)
  }

  async function handleSend() {
    setError(null)
    const bodyHtml = editorRef.current?.innerHTML ?? ""
    const hasBody = (editorRef.current?.textContent ?? "").trim().length > 0
    if (!firstName.trim() || !lastName.trim() || !hotelName.trim() || !email.trim()) {
      setError("Compila nome, cognome, struttura ed email.")
      return
    }
    if (!email.includes("@")) {
      setError("Indirizzo email non valido.")
      return
    }
    if (!subject.trim() || !hasBody) {
      setError("Inserisci oggetto e testo del messaggio.")
      return
    }
    if (admin && !agentId) {
      setError("Seleziona a nome di quale venditore inviare il messaggio.")
      return
    }
    const { option: callOption, error: callErr } = buildCallOption(callState)
    if (callErr) {
      setError(callErr)
      return
    }
    setSending(true)
    try {
      const res = await fetch("/api/sales/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          hotel_name: hotelName.trim(),
          email: email.trim(),
          send_email: true,
          custom_subject: subject.trim(),
          custom_body: bodyHtml,
          attachments: attachments.map((a) => ({ url: a.url, filename: a.filename, contentType: a.contentType })),
          ...(callOption.type !== "none" ? { call_option: callOption } : {}),
          ...(admin && agentId ? { agent_id: agentId } : {}),
          cc,
          bcc,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (json?.error === "duplicate_lead") {
          setError("Esiste già un lead con questa email: aprilo dalla lista per scrivergli.")
        } else if (json?.error === "missing_fields") {
          setError("Compila tutti i campi obbligatori.")
        } else if (json?.error === "invalid_email") {
          setError("Indirizzo email non valido.")
        } else if (json?.error === "no_sales_agent") {
          setError(
            admin
              ? "Il venditore selezionato non è valido. Riprova selezionandone un altro."
              : "Il tuo profilo non è collegato a un account venditore: contatta l'amministratore.",
          )
        } else if (json?.error === "agent_inactive") {
          setError("Il venditore selezionato non è attivo.")
        } else {
          setError(json?.message || json?.error || "Invio non riuscito. Riprova.")
        }
        return
      }
      if (json?.email_error) {
        setError(`Lead creato ma invio email fallito (${json.email_error}).`)
        return
      }
      const leadId = json?.lead?.id as string | undefined
      reset()
      onSent(leadId)
    } catch {
      setError("Invio non riuscito. Riprova.")
    } finally {
      setSending(false)
    }
  }

  function handleCancel() {
    if (sending) return
    reset()
    onClose()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Intestazione pannello (fissa) */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Nuovo messaggio</h3>
          <p className="text-xs text-muted-foreground">
            {admin
              ? "Scrivi a un nuovo contatto: scegli il venditore a cui assegnare il lead."
              : "Scrivi a un nuovo contatto. Verrà creato automaticamente un lead a te assegnato."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1.5 -mt-1 h-7 w-7 shrink-0 text-muted-foreground"
          onClick={handleCancel}
          disabled={sending}
          aria-label="Chiudi composizione"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid flex-1 gap-3 overflow-y-auto p-4">
          {admin ? (
            <div className="grid gap-1.5">
              <Label htmlFor="c-agent">Invia come venditore*</Label>
              <select
                id="c-agent"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                disabled={sending}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value="">Seleziona un venditore…</option>
                {activeAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.email || "Venditore"}
                    {a.sender_email ? ` · ${a.sender_email}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                L&apos;email partirà dall&apos;indirizzo del venditore e il lead gli verrà assegnato.
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="c-first">Nome*</Label>
              <Input id="c-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={sending} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-last">Cognome*</Label>
              <Input id="c-last" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={sending} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-hotel">Struttura*</Label>
            <Input id="c-hotel" value={hotelName} onChange={(e) => setHotelName(e.target.value)} disabled={sending} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-email">Email destinatario*</Label>
            <Input
              id="c-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Risposte predefinite</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMAIL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  disabled={sending}
                  onClick={() => applyTemplate(tpl)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                    activeTemplate === tpl.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-subject">Oggetto*</Label>
            <Input id="c-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sending} />
            <CcBccFields cc={cc} bcc={bcc} onCcChange={setCc} onBccChange={setBcc} disabled={sending} className="mt-1" />
          </div>
          <div className="grid gap-1.5">
            <Label>Messaggio*</Label>
            <RichEmailComposer
              editorRef={editorRef}
              placeholder="Scrivi qui il testo dell'email..."
              sending={sending}
              minHeightClass="min-h-[140px]"
              onChangeEmpty={setBodyEmpty}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              draftKey="compose"
            />
          </div>
          <CallOptionPicker value={callState} onChange={setCallState} disabled={sending} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="outline" onClick={handleCancel} disabled={sending}>
          Annulla
        </Button>
        <ComposerSendButton
          onClick={() => void handleSend()}
          sending={sending}
          disabled={sending || (bodyEmpty && attachments.length === 0)}
          label="Invia"
          icon={<Send className="h-4 w-4" />}
        />
      </div>
    </div>
  )
}

function formatShort(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
