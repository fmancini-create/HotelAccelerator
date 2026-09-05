"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Loader2, Wrench } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type Operator = { id: string; full_name: string | null }
type OperatorGroup = { id: string; name: string; member_count?: number | null }
type TaskData = {
  active?: boolean
  operators?: Operator[]
  operatorGroups?: OperatorGroup[]
}
type AddonState = "loading" | "active" | "inactive" | "forbidden" | "unavailable"
type Priority = "low" | "normal" | "high" | "urgent"

type ConversationSnapshot = {
  id: string
  channel: string | null
  subject: string | null
  contactName: string | null
}

function pathFromFetch(input: RequestInfo | URL) {
  try {
    if (typeof input === "string") return new URL(input, window.location.origin).pathname
    if (input instanceof URL) return input.pathname
    return new URL(input.url, window.location.origin).pathname
  } catch {
    return ""
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase()
  return "GET"
}

function requestBody(init?: RequestInit): Record<string, unknown> | null {
  if (typeof init?.body !== "string") return null
  try {
    return JSON.parse(init.body) as Record<string, unknown>
  } catch {
    return null
  }
}

function snapshotFromDetail(id: string, data: any): ConversationSnapshot | null {
  const conversation = data?.conversation
  if (!conversation) return null
  const contact = conversation.contact || null
  return {
    id,
    channel: typeof conversation.channel === "string" ? conversation.channel : null,
    subject: typeof conversation.subject === "string" && conversation.subject.trim() ? conversation.subject.trim() : null,
    contactName:
      typeof contact?.name === "string" && contact.name.trim()
        ? contact.name.trim()
        : typeof conversation.contact_name === "string" && conversation.contact_name.trim()
          ? conversation.contact_name.trim()
          : null,
  }
}

/**
 * Azione contestuale della Inbox: una conversazione o una risposta possono
 * diventare un ticket ManuBot senza copiare/incollare il contenuto altrove.
 *
 * Se ManuBot non e' attivo NON spariamo l'azione: mostriamo il vantaggio nel
 * punto esatto in cui servirebbe e la CTA di attivazione. Errori tecnici e
 * permessi mancanti restano distinti dallo stato commerciale, cosi' un guasto
 * non diventa per errore una pubblicita'.
 */
export function InboxManubotTaskEnhancer() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [conversation, setConversation] = useState<ConversationSnapshot | null>(null)
  const conversationRef = useRef<ConversationSnapshot | null>(null)
  const [lastReply, setLastReply] = useState("")
  const [addonState, setAddonState] = useState<AddonState>("loading")
  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<Priority>("normal")
  const [responsible, setResponsible] = useState("")
  const [expectedMinutes, setExpectedMinutes] = useState("60")

  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])

  const loadTaskData = async () => {
    setAddonState("loading")
    try {
      const res = await fetch("/api/admin/manubot/task-data", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (res.status === 404 && data?.error === "module_inactive") {
        setTaskData(null)
        setAddonState("inactive")
        return
      }
      if (res.status === 403 || res.status === 401) {
        setTaskData(null)
        setAddonState("forbidden")
        return
      }
      if (!res.ok) {
        setTaskData(null)
        setAddonState("unavailable")
        return
      }
      setTaskData(data as TaskData)
      setAddonState(data?.active === true ? "active" : "inactive")
    } catch {
      setTaskData(null)
      setAddonState("unavailable")
    }
  }

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathFromFetch(input)
      const method = requestMethod(input, init)
      const detailMatch = method === "GET" ? path.match(/^\/api\/inbox\/([^/]+)$/) : null
      const sendMatch = method === "POST" ? path.match(/^\/api\/inbox\/([^/]+)\/send$/) : null
      const response = await nativeFetch(input, init)

      if (detailMatch && response.ok) {
        const id = detailMatch[1]
        void response
          .clone()
          .json()
          .then((data) => {
            const snapshot = snapshotFromDetail(id, data)
            if (!snapshot) return
            conversationRef.current = snapshot
            setConversation(snapshot)
            setLastReply("")
            setOpen(false)
            void loadTaskData()
          })
          .catch(() => undefined)
      }

      if (sendMatch && response.ok && conversationRef.current?.id === sendMatch[1]) {
        const body = requestBody(init)
        const content = typeof body?.content === "string" ? body.content.trim() : ""
        if (content) setLastReply(content)
      }

      return response
    }

    return () => {
      window.fetch = nativeFetch
    }
    // L'intercettore deve essere installato una sola volta; i dati vivi passano dai ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const locate = () => {
      const to = document.getElementById("reply-to")
      if (!to) {
        setPortalTarget(null)
        return
      }
      const header = to.closest(".border-b.border-border") as HTMLElement | null
      if (!header) return
      let target = header.querySelector<HTMLElement>("[data-manubot-reply-target]")
      if (!target) {
        target = document.createElement("div")
        target.dataset.manubotReplyTarget = "true"
        header.appendChild(target)
      }
      setPortalTarget(target)
    }

    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const operators = taskData?.operators || []
  const groups = taskData?.operatorGroups || []

  const defaultDescription = useMemo(() => {
    if (!conversation) return ""
    const rows = [
      "Origine: Inbox HotelAccelerator",
      `Conversazione: ${conversation.id}`,
      conversation.channel ? `Canale: ${conversation.channel}` : null,
      conversation.contactName ? `Contatto: ${conversation.contactName}` : null,
      conversation.subject ? `Oggetto: ${conversation.subject}` : null,
      lastReply ? `Ultima risposta inviata:\n${lastReply}` : null,
    ]
    return rows.filter(Boolean).join("\n")
  }, [conversation, lastReply])

  const openDialog = () => {
    if (!conversation) return
    setTitle(
      conversation.subject
        ? conversation.subject.slice(0, 180)
        : conversation.contactName
          ? `Richiesta da ${conversation.contactName}`
          : "Richiesta dalla Inbox",
    )
    setDescription(defaultDescription)
    setPriority("normal")
    setResponsible("")
    setExpectedMinutes("60")
    setOpen(true)
  }

  const submit = async () => {
    if (!conversation || !title.trim() || !responsible) {
      toast.error("Inserisci il titolo e scegli un responsabile")
      return
    }
    const minutes = Number(expectedMinutes)
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      toast.error("Il tempo stimato deve essere tra 5 e 1440 minuti")
      return
    }

    const assigneeIds = responsible.startsWith("operator:") ? [responsible.slice(9)] : []
    const groupIds = responsible.startsWith("group:") ? [responsible.slice(6)] : []

    setSaving(true)
    try {
      const res = await fetch("/api/admin/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || defaultDescription,
          priority,
          tags: ["manubot", "inbox"],
          send_to_manubot: true,
          manubot_assignee_ids: assigneeIds,
          manubot_group_ids: groupIds,
          manubot_expected_resolution_minutes: minutes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Creazione ticket non riuscita")
      if (data.manubot_synced !== true) throw new Error("ManuBot non ha confermato la creazione del ticket")
      toast.success("Ticket ManuBot creato dalla conversazione")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creazione ticket non riuscita")
    } finally {
      setSaving(false)
    }
  }

  if (!portalTarget || !conversation || addonState === "forbidden") return null

  const content = (
    <div className="border-t border-border px-3 py-2">
      {addonState === "loading" ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifico ManuBot…
        </div>
      ) : addonState === "inactive" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2">
          <div className="min-w-0 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Wrench className="h-3.5 w-3.5" /> Trasforma questa conversazione in un ticket operativo
            </div>
            <p className="mt-0.5 text-muted-foreground">
              Con ManuBot assegni la richiesta a tecnici o gruppi e ne segui presa in carico e chiusura.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <Link href="/admin/modules?focus=manubot">Attiva ManuBot</Link>
          </Button>
        </div>
      ) : addonState === "unavailable" ? (
        <p className="text-xs text-muted-foreground">ManuBot momentaneamente non disponibile.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {lastReply ? "Risposta inviata: puoi trasformarla subito in un ticket operativo." : "Puoi trasformare la conversazione in un ticket operativo."}
          </div>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={openDialog}>
            <Wrench className="h-3.5 w-3.5" /> Crea task ManuBot
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Crea ticket ManuBot dalla Inbox</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inbox-manubot-title">Titolo</Label>
              <Input id="inbox-manubot-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inbox-manubot-description">Descrizione</Label>
              <Textarea id="inbox-manubot-description" rows={7} value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Responsabile *</Label>
                <Select value={responsible || "none"} onValueChange={(value) => setResponsible(value === "none" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Tecnico o gruppo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Seleziona</SelectItem>
                    {operators.map((operator) => (
                      <SelectItem key={operator.id} value={`operator:${operator.id}`}>{operator.full_name || "Operatore"}</SelectItem>
                    ))}
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={`group:${group.id}`} disabled={group.member_count === 0}>
                        Gruppo · {group.name}{group.member_count === 0 ? " (senza membri)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priorità</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Bassa</SelectItem>
                    <SelectItem value="normal">Normale</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inbox-manubot-minutes">Tempo stimato di risoluzione (minuti)</Label>
              <Input id="inbox-manubot-minutes" type="number" min={5} max={1440} value={expectedMinutes} onChange={(event) => setExpectedMinutes(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
            <Button type="button" onClick={submit} disabled={saving || !responsible || !title.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
              Crea ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  return createPortal(content, portalTarget)
}
