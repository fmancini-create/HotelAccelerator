"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Lock, Users, UserPlus, X, BriefcaseBusiness } from "lucide-react"
import { toast } from "sonner"

type Target = { kind: "conversation" | "gmail_thread"; key: string }

type Collaborator = {
  userId: string | null
  key: string
  label: string
  typing: boolean
  lastBeatAt: string | null
}

type CollaborationState = {
  target: Target
  owner: { key: string; adminUserId: string | null; label: string } | null
  collaborators: Collaborator[]
  typingLabels: string[]
  role: "free" | "holder" | "collaborator" | "viewer"
  canWrite: boolean
  canManage: boolean
}

type ShareUser = { id: string; label: string; email: string }

type CrmState = {
  source: "date_request" | "apollo_prospect" | "none"
  record: { id: string; stage: string; [key: string]: unknown } | null
  relatedCount: number
  options: Array<{ key: string; label: string; description?: string }>
  message?: string
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

function methodFromFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase()
  return "GET"
}

function targetKey(target: Target | null) {
  return target ? `${target.kind}:${target.key}` : ""
}

/**
 * Enhancement locale della grande pagina Inbox legacy.
 *
 * Non duplica la logica di invio: mostra soltanto lo stato collaborativo e il
 * selettore CRM. Il vero divieto di risposta concorrente vive nelle route server.
 */
export function InboxCollaborationEnhancer() {
  const [target, setTarget] = useState<Target | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [collaboration, setCollaboration] = useState<CollaborationState | null>(null)
  const [users, setUsers] = useState<ShareUser[]>([])
  const [selectedUser, setSelectedUser] = useState("")
  const [crm, setCrm] = useState<CrmState | null>(null)
  const [crmSaving, setCrmSaving] = useState(false)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const targetRef = useRef<Target | null>(null)
  const lastTypingAtRef = useRef(0)
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    targetRef.current = target
  }, [target])

  const refreshCollaboration = useCallback(async (current: Target) => {
    try {
      const query = new URLSearchParams({ kind: current.kind, key: current.key })
      const response = await fetch(`/api/inbox/collaboration/share?${query.toString()}`, { cache: "no-store" })
      if (!response.ok) return
      const data = await response.json()
      if (targetKey(targetRef.current) !== targetKey(current)) return
      setCollaboration(data.state ?? null)
      setUsers(Array.isArray(data.users) ? data.users : [])
    } catch {
      // Stato collaborativo accessorio: un guasto di rete non deve rompere la lettura.
    }
  }, [])

  const refreshCrm = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/inbox/${encodeURIComponent(id)}/crm-state`, { cache: "no-store" })
      if (response.status === 403) {
        setCrm(null)
        return
      }
      if (!response.ok) return
      const data = await response.json()
      if (targetRef.current?.kind !== "conversation" || targetRef.current.key !== id) return
      setCrm(data)
    } catch {
      // Il CRM non deve impedire di lavorare la conversazione.
    }
  }, [])

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathFromFetch(input)
      const method = methodFromFetch(input, init)
      const conversationMatch = method === "GET" ? path.match(/^\/api\/inbox\/([^/]+)$/) : null
      const gmailMatch = method === "GET" ? path.match(/^\/api\/gmail\/threads\/([^/]+)$/) : null
      const response = await nativeFetch(input, init)

      if (conversationMatch && response.ok) {
        const id = decodeURIComponent(conversationMatch[1])
        const nextTarget: Target = { kind: "conversation", key: id }
        targetRef.current = nextTarget
        setTarget(nextTarget)
        setConversationId(id)
        void refreshCollaboration(nextTarget)
        void refreshCrm(id)
      } else if (gmailMatch && response.ok) {
        const id = decodeURIComponent(gmailMatch[1])
        const nextTarget: Target = { kind: "gmail_thread", key: id }
        targetRef.current = nextTarget
        setTarget(nextTarget)
        setConversationId(null)
        setCrm(null)
        void refreshCollaboration(nextTarget)
      }

      return response
    }
    return () => {
      window.fetch = nativeFetch
    }
  }, [refreshCollaboration, refreshCrm])

  useEffect(() => {
    if (!target) return
    void refreshCollaboration(target)
    const timer = setInterval(() => void refreshCollaboration(target), 2_500)
    return () => clearInterval(timer)
  }, [target, refreshCollaboration])

  useEffect(() => {
    const locate = () => {
      const textarea = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea")).find((element) => {
        const placeholder = element.placeholder.toLowerCase()
        return placeholder.includes("scrivi una risposta") || placeholder.includes("aggiungi un messaggio e inoltra")
      })
      if (!textarea) {
        setPortalTarget(null)
        return
      }
      const host = textarea.parentElement
      if (!host) return
      let marker = host.querySelector<HTMLElement>("[data-inbox-collaboration-target]")
      if (!marker) {
        marker = document.createElement("div")
        marker.dataset.inboxCollaborationTarget = "true"
        host.insertBefore(marker, textarea)
      }
      setPortalTarget(marker)
    }
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  // Read-only immediato nella UI. L'enforcement vero resta server-side.
  useEffect(() => {
    const apply = () => {
      const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"))
      for (const textarea of textareas) {
        const placeholder = textarea.placeholder.toLowerCase()
        if (!placeholder.includes("scrivi una risposta") && !placeholder.includes("aggiungi un messaggio e inoltra")) continue
        textarea.readOnly = collaboration?.role === "viewer"
        if (textarea.readOnly) textarea.setAttribute("aria-describedby", "inbox-collaboration-lock-message")
        else textarea.removeAttribute("aria-describedby")
      }
    }
    apply()
    const timer = setInterval(apply, 800)
    return () => clearInterval(timer)
  }, [collaboration?.role])

  // Segnale "sta scrivendo": separato dall'heartbeat del lock. Viene aggiornato
  // solo sulle battute reali e si spegne dopo una breve pausa.
  useEffect(() => {
    const onInput = (event: Event) => {
      const textarea = event.target as HTMLTextAreaElement | null
      if (!textarea || textarea.tagName !== "TEXTAREA") return
      const placeholder = textarea.placeholder.toLowerCase()
      if (!placeholder.includes("scrivi una risposta") && !placeholder.includes("aggiungi un messaggio e inoltra")) return
      const current = targetRef.current
      if (!current || collaboration?.role === "viewer") return

      const now = Date.now()
      if (now - lastTypingAtRef.current > 650) {
        lastTypingAtRef.current = now
        fetch("/api/inbox/collaboration/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: current, typing: true }),
        }).then(() => refreshCollaboration(current)).catch(() => undefined)
      }
      if (typingStopRef.current) clearTimeout(typingStopRef.current)
      typingStopRef.current = setTimeout(() => {
        fetch("/api/inbox/collaboration/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: current, typing: false }),
        }).then(() => refreshCollaboration(current)).catch(() => undefined)
      }, 2_500)
    }

    document.addEventListener("input", onInput, true)
    return () => {
      document.removeEventListener("input", onInput, true)
      if (typingStopRef.current) clearTimeout(typingStopRef.current)
    }
  }, [collaboration?.role, refreshCollaboration])

  const availableUsers = useMemo(() => {
    const already = new Set(collaboration?.collaborators.map((c) => c.userId).filter(Boolean) ?? [])
    if (collaboration?.owner?.adminUserId) already.add(collaboration.owner.adminUserId)
    return users.filter((user) => !already.has(user.id))
  }, [users, collaboration])

  const addCollaborator = async () => {
    if (!target || !selectedUser) return
    const response = await fetch("/api/inbox/collaboration/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, userId: selectedUser }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      toast.error(data.error || "Impossibile condividere la conversazione")
      return
    }
    setSelectedUser("")
    setCollaboration(data.state ?? collaboration)
    toast.success("Collaboratore aggiunto")
    void refreshCollaboration(target)
  }

  const removeCollaborator = async (userId: string | null) => {
    if (!target || !userId) return
    const response = await fetch("/api/inbox/collaboration/share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, userId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      toast.error(data.error || "Impossibile rimuovere il collaboratore")
      return
    }
    setCollaboration(data.state ?? collaboration)
    void refreshCollaboration(target)
  }

  const updateCrmStage = async (stage: string) => {
    if (!conversationId || !crm?.record || crm.source === "none") return
    const previous = crm.record.stage
    setCrm((current) => current?.record ? { ...current, record: { ...current.record, stage } } : current)
    setCrmSaving(true)
    try {
      const response = await fetch(`/api/inbox/${encodeURIComponent(conversationId)}/crm-state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: crm.source, recordId: crm.record.id, stage }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Aggiornamento CRM non riuscito")
      toast.success("Stato CRM aggiornato")
      await refreshCrm(conversationId)
    } catch (error) {
      setCrm((current) => current?.record ? { ...current, record: { ...current.record, stage: previous } } : current)
      toast.error(error instanceof Error ? error.message : "Aggiornamento CRM non riuscito")
    } finally {
      setCrmSaving(false)
    }
  }

  if (!portalTarget || !target) return null

  const lockedByOther = collaboration?.role === "viewer"
  const typing = collaboration?.typingLabels ?? []
  const ownerLabel = collaboration?.owner?.label ?? "un collega"

  return createPortal(
    <div className="mb-2 space-y-2">
      {lockedByOther ? (
        <div
          id="inbox-collaboration-lock-message"
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <div className="font-medium">{ownerLabel} sta gestendo questa conversazione</div>
            <div className="text-xs opacity-80">Puoi leggerla, ma non puoi rispondere finche' non viene rilasciata o condivisa con te.</div>
          </div>
        </div>
      ) : collaboration?.role === "collaborator" ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>Conversazione condivisa con te da <strong>{ownerLabel}</strong>.</span>
        </div>
      ) : null}

      {typing.length > 0 ? (
        <div className="text-xs font-medium text-muted-foreground" aria-live="polite">
          {typing.length === 1 ? `${typing[0]} sta scrivendo...` : `${typing.join(", ")} stanno scrivendo...`}
        </div>
      ) : null}

      {collaboration?.collaborators.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Coassegnati:</span>
          {collaboration.collaborators.map((person) => (
            <span key={person.key} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
              {person.label}
              {collaboration.canManage ? (
                <button type="button" onClick={() => removeCollaborator(person.userId)} aria-label={`Rimuovi ${person.label}`}>
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {collaboration?.canManage && collaboration.owner ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-2">
          <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-medium">Consenti collaborazione</span>
          <select
            value={selectedUser}
            onChange={(event) => setSelectedUser(event.target.value)}
            className="h-8 min-w-44 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Scegli utente...</option>
            {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}
          </select>
          <button
            type="button"
            onClick={addCollaborator}
            disabled={!selectedUser}
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Aggiungi
          </button>
        </div>
      ) : null}

      {crm && crm.source !== "none" && crm.record ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
          <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="inbox-crm-stage" className="text-xs font-medium">Stato CRM</label>
          <select
            id="inbox-crm-stage"
            value={crm.record.stage}
            disabled={crmSaving}
            onChange={(event) => void updateCrmStage(event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {crm.options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          {crm.relatedCount > 1 ? (
            <span className="text-[11px] text-muted-foreground">Modifica la richiesta piu' recente; {crm.relatedCount} richieste collegate nel CRM.</span>
          ) : null}
        </div>
      ) : null}
    </div>,
    portalTarget,
  )
}
