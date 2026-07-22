"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Bot, Send, X, MessageSquare, History, Trash2, Plus, ArrowUpRight, AlertTriangle, ChevronDown, Lightbulb, Bug, CheckCircle2, Loader2, Sparkles } from "lucide-react"

const TADDEO_AVATAR = "/images/taddeo-avatar.png"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ChatTier = "free" | "standard" | "advanced"

interface ChatSession {
  id: string
  title: string
  tier: string
  status: string
  created_at: string
  updated_at: string
}

const TIER_CONFIG = {
  free: {
    label: "Free",
    color: "bg-zinc-100 text-zinc-700 border-zinc-200",
    description: "Consigli generali sulla piattaforma",
  },
  standard: {
    label: "Standard",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    description: "Analisi personalizzate con i dati della struttura",
  },
  advanced: {
    label: "Advanced",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    description: "Analisi completa + inoltro a esperto RM",
  },
}

function getMessageText(message: { role: string; parts?: Array<{ type: string; text?: string }>; content?: string }): string {
  if (message.parts && Array.isArray(message.parts)) {
    return message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("")
  }
  return message.content || ""
}

export function AiChatPanel({ hotelId, hotelName }: { hotelId: string; hotelName: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [activeTier, setActiveTier] = useState<ChatTier>("free")
  const [allowedTier, setAllowedTier] = useState<ChatTier>("free")
  const [inputValue, setInputValue] = useState("")
  const [isForwarded, setIsForwarded] = useState(false)
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)
  const [feedbackType, setFeedbackType] = useState<"suggestion" | "problem">("suggestion")
  const [feedbackMessage, setFeedbackMessage] = useState("")
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Use refs for values that change frequently to avoid recreating transport
  const sessionIdRef = useRef<string | null>(null)
  const activeTierRef = useRef<ChatTier>("free")
  sessionIdRef.current = currentSessionId
  activeTierRef.current = activeTier

  // Create transport - only depends on hotelId (stable) to avoid resetting useChat
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai-chat",
        credentials: "include",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages,
            hotelId,
            sessionId: sessionIdRef.current,
            tier: activeTierRef.current,
          },
        }),
      }),
    [hotelId]
  )

  const { messages, status, sendMessage, setMessages, error } = useChat({
    transport,
  })

  // Reset chat when hotel changes
  useEffect(() => {
    setMessages([])
    setCurrentSessionId(null)
    setIsForwarded(false)
  }, [hotelId, setMessages])

  // Fetch allowed tier for this hotel
  useEffect(() => {
    async function fetchTier() {
      try {
        const res = await fetch(`/api/ai-chat/tier-config?hotelId=${hotelId}`, {
          credentials: "include",
        })
        const data = await res.json()
        const tier = (data.tier || "free") as ChatTier
        setAllowedTier(tier)
        setActiveTier(tier)
      } catch {
        setAllowedTier("free")
        setActiveTier("free")
      }
    }
    if (hotelId) fetchTier()
  }, [hotelId])

  // Fetch sessions history
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai-chat/sessions?hotelId=${hotelId}`, {
        credentials: "include",
      })
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch {
      // ignore
    }
  }, [hotelId])

  useEffect(() => {
    if (isOpen && showHistory) fetchSessions()
  }, [isOpen, showHistory, fetchSessions])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Extract sessionId: after first AI response, fetch the latest session to get the ID
  useEffect(() => {
    if (messages.length >= 2 && !currentSessionId) {
      fetchSessions().then(() => {
        setSessions((prev) => {
          if (prev.length > 0) {
            // The most recently updated session is the current one
            const sorted = [...prev].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            setCurrentSessionId(sorted[0].id)
          }
          return prev
        })
      })
    }
  }, [messages.length, currentSessionId, fetchSessions])

  const handleSend = () => {
    if (!inputValue.trim() || status === "streaming" || isForwarded) return
    sendMessage({ text: inputValue })
    setInputValue("")
  }

  const handleNewChat = () => {
    setMessages([])
    setCurrentSessionId(null)
    setIsForwarded(false)
    setShowHistory(false)
  }

  const handleLoadSession = async (session: ChatSession) => {
    try {
      const res = await fetch(`/api/ai-chat/sessions/${session.id}`, {
        credentials: "include",
      })
      const data = await res.json()

      if (data.messages) {
        // Convert DB messages to UIMessage format
        const uiMessages = data.messages
          .filter((m: { role: string }) => m.role !== "system")
          .map((m: { id: string; role: string; content: string; metadata?: Record<string, unknown> }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: [{ type: "text" as const, text: m.metadata?.from_superadmin ? `[Risposta del team Santaddeo]\n${m.content}` : m.content }],
          }))

        setMessages(uiMessages)
        setCurrentSessionId(session.id)
        setActiveTier(session.tier as ChatTier)
        setIsForwarded(session.status === "forwarded")
        setShowHistory(false)
      }
    } catch {
      // ignore
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await fetch("/api/ai-chat/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      })
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (currentSessionId === sessionId) {
        handleNewChat()
      }
    } catch {
      // ignore
    }
  }

  const [isForwarding, setIsForwarding] = useState(false)

  const handleForwardToExpert = async () => {
    if (!currentSessionId) {
      // Try fetching sessions one more time to get the ID
      const res = await fetch(`/api/ai-chat/sessions?hotelId=${hotelId}`, { credentials: "include" })
      const data = await res.json()
      const sorted = (data.sessions || []).sort((a: ChatSession, b: ChatSession) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      if (sorted.length > 0) {
        setCurrentSessionId(sorted[0].id)
        // Retry with the now-known session ID
        setIsForwarding(true)
        try {
          await fetch(`/api/ai-chat/sessions/${sorted[0].id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: "forward" }),
          })
          setIsForwarded(true)
        } catch {
          // ignore
        } finally {
          setIsForwarding(false)
        }
        return
      }
      return
    }
    setIsForwarding(true)
    try {
      const res = await fetch(`/api/ai-chat/sessions/${currentSessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "forward" }),
      })
      if (res.ok) {
        setIsForwarded(true)
      }
    } catch {
      // ignore
    } finally {
      setIsForwarding(false)
    }
  }

  const openFeedbackDialog = (type: "suggestion" | "problem") => {
    setFeedbackType(type)
    setFeedbackMessage("")
    setFeedbackSent(false)
    setFeedbackError(null)
    setFeedbackDialogOpen(true)
  }

  const handleSendFeedback = async () => {
    if (!feedbackMessage.trim()) return
    setFeedbackSending(true)
    setFeedbackError(null)
    try {
      const res = await fetch("/api/user-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: feedbackType,
          message: feedbackMessage.trim(),
          hotelId,
        }),
      })
      if (!res.ok) {
        // Estrai il motivo reale dal server cosi' l'errore non resta silenzioso
        // (causa per cui segnalazioni dei tenant andavano perse senza traccia).
        let detail = `Errore ${res.status}`
        try {
          const j = await res.json()
          if (j?.error) detail = j.error
        } catch {
          /* risposta non JSON */
        }
        throw new Error(detail)
      }
      setFeedbackSent(true)
    } catch (err) {
      setFeedbackError(
        err instanceof Error && err.message
          ? err.message
          : "Errore di connessione. Riprova tra qualche secondo.",
      )
    } finally {
      setFeedbackSending(false)
    }
  }

  // Check if last AI message suggests forwarding
  const lastAiMessage = [...messages].reverse().find((m) => m.role === "assistant")
  const lastAiText = lastAiMessage ? getMessageText(lastAiMessage) : ""
  const suggestsForward = activeTier === "advanced" && lastAiText.includes("[FORWARD_TO_EXPERT]")

  const tierConfig = TIER_CONFIG[activeTier]

  return (
    <>
      {/* Floating chat button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 group flex items-center gap-2 rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition-all hover:scale-105 hover:shadow-xl hover:shadow-emerald-600/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 pl-4 pr-5 py-3"
          aria-label="Apri Taddeo - assistente IA"
        >
          <img src={TADDEO_AVATAR} alt="Taddeo" width={28} height={28} className="rounded-full" />
          <span className="text-sm font-semibold hidden sm:inline">Taddeo</span>
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500" />
          </span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)]">
          <Card className="flex flex-col shadow-2xl border border-emerald-200/50 overflow-hidden rounded-2xl" style={{ height: "600px" }}>
            {/* Header */}
            <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-4 border-b bg-emerald-600 text-white flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 flex-shrink-0 overflow-hidden">
                  <img src={TADDEO_AVATAR} alt="Taddeo" width={32} height={32} className="rounded-full" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold truncate text-white">
                    Taddeo
                  </CardTitle>
                  <p className="text-[10px] text-emerald-100 truncate">Il tuo RevMentor personale</p>
                </div>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-white/30 ${
                  activeTier === "advanced" ? "bg-amber-500/20 text-amber-100" :
                  activeTier === "standard" ? "bg-blue-500/20 text-blue-100" :
                  "bg-white/10 text-white/80"
                }`}>
                  {tierConfig.label}
                </Badge>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-transparent text-white hover:bg-white/20 hover:text-white" onClick={() => { setShowHistory(!showHistory) }}>
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-transparent text-white hover:bg-white/20 hover:text-white" onClick={handleNewChat}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-transparent text-white hover:bg-white/20 hover:text-white" onClick={() => setIsOpen(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              {showHistory ? (
                /* History panel */
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="px-4 py-2 border-b bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground">Storico conversazioni</p>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {sessions.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">Nessuna conversazione</p>
                      )}
                      {sessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer group"
                          onClick={() => handleLoadSession(session)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleLoadSession(session) }}
                          role="button"
                          tabIndex={0}
                        >
                          <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{session.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(session.updated_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              {session.status === "forwarded" && " - Inoltrata"}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${TIER_CONFIG[session.tier as ChatTier]?.color || ""}`}>
                            {session.tier}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 bg-transparent"
                            onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id) }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                /* Chat messages */
                <>
                  <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
                        <div className="h-20 w-20 rounded-2xl bg-emerald-50 flex items-center justify-center overflow-hidden">
                          <img src={TADDEO_AVATAR} alt="Taddeo" width={80} height={80} className="rounded-2xl" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-foreground">Ciao! Sono Taddeo</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Il tuo RevMentor personale</p>
                          <p className="text-xs text-emerald-600 mt-1 font-medium">{hotelName}</p>
                        </div>
                        {/* Quick prompt suggestions */}
                        <div className="grid grid-cols-1 gap-2 w-full max-w-[320px] mt-2">
                          {activeTier !== "free" ? (
                            <>
                              <button
                                onClick={() => { setInputValue("Come sta andando l'occupazione questo mese?"); }}
                                className="text-left text-xs px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              >
                                {"Come sta andando l'occupazione?"}
                              </button>
                              <button
                                onClick={() => { setInputValue("Analizza il tasso di cancellazione e suggerisci azioni"); }}
                                className="text-left text-xs px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              >
                                {"Analizza le cancellazioni"}
                              </button>
                              <button
                                onClick={() => { setInputValue("Quali canali di vendita stanno performando meglio?"); }}
                                className="text-left text-xs px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              >
                                {"Migliori canali di vendita"}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => { setInputValue("Cos'e il RevPAR e come posso migliorarlo?"); }}
                                className="text-left text-xs px-3 py-2.5 rounded-xl border bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                              >
                                {"Cos'e il RevPAR?"}
                              </button>
                              <button
                                onClick={() => { setInputValue("Quali strategie di pricing consigli per una struttura ricettiva?"); }}
                                className="text-left text-xs px-3 py-2.5 rounded-xl border bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                              >
                                {"Strategie di pricing"}
                              </button>
                            </>
                          )}
                        </div>
                        {activeTier === "free" && allowedTier === "free" && (
                          <div className="flex flex-col gap-3 max-w-[340px]">
                            {/* Box 1: Accelerator */}
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-2xl p-4 shadow-sm">
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                                  <Sparkles className="h-4 w-4 text-blue-600" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-blue-800 mb-1">Accelerator</p>
                                  <p className="text-xs text-blue-700 leading-relaxed mb-2">
                                    Analisi personalizzate basate sui dati della tua struttura per ottimizzare prezzi e occupazione.
                                  </p>
                                  <a 
                                    href="/upgrade/hotel-accelerator" 
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
                                  >
                                    Attiva Accelerator
                                    <ArrowUpRight className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>
                            </div>
                            {/* Box 2: Premium Expert */}
                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 rounded-2xl p-4 shadow-sm">
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-emerald-800 mb-1">Premium Expert</p>
                                  <p className="text-xs text-emerald-700 leading-relaxed mb-2">
                                    Inoltra domande e risposte AI a un consulente esperto di Revenue Management per feedback personalizzati.
                                  </p>
                                  <a 
                                    href="/upgrade/premium-expert" 
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors"
                                  >
                                    Attiva Premium Expert
                                    <ArrowUpRight className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {activeTier === "standard" && (
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-4 max-w-[320px] shadow-sm">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                <Sparkles className="h-5 w-5 text-blue-600" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-blue-800 mb-1">Piano Accelerator</p>
                                <p className="text-xs text-blue-700 leading-relaxed mb-3">
                                  Posso analizzare i dati della tua struttura. Vuoi anche il supporto di un esperto Revenue Manager?
                                </p>
                                <a 
                                  href="/upgrade/premium-expert" 
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  Scopri Premium Expert
                                  <ArrowUpRight className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                        {activeTier === "advanced" && (
                          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3 max-w-[300px]">
                            <p className="text-xs text-emerald-700 leading-relaxed">
                              <span className="font-semibold">Piano Premium attivo.</span> Analisi completa + puoi inoltrare le conversazioni al tuo consulente Revenue Management.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {messages.map((message) => {
                      const text = getMessageText(message)
                      const cleanText = text.replace("[FORWARD_TO_EXPERT]", "").trim()
                      if (!cleanText) return null

                      const isUser = message.role === "user"
                      return (
                        <div
                          key={message.id}
                          className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                        >
                          {!isUser && (
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 overflow-hidden">
<img src={TADDEO_AVATAR} alt="Taddeo" width={28} height={28} className="rounded-full" />
                            </div>
                          )}
                          <div
                            className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                              isUser
                                ? "bg-emerald-600 text-white rounded-br-sm"
                                : "bg-muted/80 border border-border/50 rounded-bl-sm"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{cleanText}</p>
                          </div>
                        </div>
                      )
                    })}

                    {status === "streaming" && (
                      <div className="flex items-end gap-2 justify-start">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 overflow-hidden">
                          <img src={TADDEO_AVATAR} alt="Taddeo" width={28} height={28} className="rounded-full" />
                        </div>
                        <div className="bg-muted/80 border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3">
                          <div className="flex gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500/60 animate-bounce [animation-delay:0ms]" />
                            <span className="h-2 w-2 rounded-full bg-emerald-500/60 animate-bounce [animation-delay:150ms]" />
                            <span className="h-2 w-2 rounded-full bg-emerald-500/60 animate-bounce [animation-delay:300ms]" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Forward suggestion */}
                    {suggestsForward && !isForwarded && (
                      <div className="flex justify-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                          onClick={handleForwardToExpert}
                          disabled={isForwarding}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          {isForwarding ? "Inoltro in corso..." : "Inoltra a esperto Revenue Management"}
                        </Button>
                      </div>
                    )}

                    {/* Forwarded notice */}
                    {isForwarded && (
                      <div className="flex justify-center">
                        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-xs text-center">
                          <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                          Conversazione inoltrata a un esperto RM. Riceverai una risposta via email.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input area */}
                  <div className="border-t bg-muted/20 p-3 flex-shrink-0">
                    {/* Tier selector (if allowed tier > free) */}
                    {allowedTier !== "free" && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-muted-foreground">Piano:</span>
                        <div className={`px-2 py-0.5 rounded text-[10px] font-medium border ${TIER_CONFIG[allowedTier].color}`}>
                          {TIER_CONFIG[allowedTier].label}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder={isForwarded ? "Chat inoltrata a esperto..." : "Chiedi a Taddeo..."}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                        disabled={status === "streaming" || isForwarded}
                        className="text-sm rounded-xl bg-background border-border/60"
                      />
                      <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={!inputValue.trim() || status === "streaming" || isForwarded}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex-shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Feedback buttons */}
                    <div className="flex items-center justify-center gap-3 mt-3">
                      <button
                        onClick={() => openFeedbackDialog("suggestion")}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-emerald-700 transition-colors px-3 py-1.5 rounded-md hover:bg-emerald-50 border border-transparent hover:border-emerald-200"
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                        <span>Suggerisci miglioria</span>
                      </button>
                      <span className="text-muted-foreground/30">|</span>
                      <button
                        onClick={() => openFeedbackDialog("problem")}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-red-600 transition-colors px-3 py-1.5 rounded-md hover:bg-red-50 border border-transparent hover:border-red-200"
                      >
                        <Bug className="h-3.5 w-3.5" />
                        <span>Segnala un problema</span>
                      </button>
                    </div>
  {error && (
    <div className="mx-3 mb-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
      <p className="text-xs text-destructive">
        {"Errore di connessione. Riprova tra qualche secondo."}
      </p>
      <p className="text-[10px] text-destructive/60 mt-1 break-all">
        {error.message || "Errore sconosciuto"}
      </p>
    </div>
  )}
  <p className="text-[9px] text-muted-foreground/60 text-center mt-1">
  {"Taddeo puo' commettere errori. Verifica le informazioni importanti."}
  </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Feedback Dialog */}
      <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {feedbackType === "suggestion" ? (
                <>
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  Suggerisci una miglioria / nuova funzione
                </>
              ) : (
                <>
                  <Bug className="h-5 w-5 text-red-500" />
                  Segnala un problema
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {feedbackType === "suggestion"
                ? "Hai un'idea per migliorare Taddeo o la piattaforma? Descrivicela!"
                : "Hai riscontrato un problema? Descrivilo nel dettaglio cosi potremo risolverlo."
              }
            </DialogDescription>
          </DialogHeader>

          {feedbackSent ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <p className="text-center font-medium">
                {feedbackType === "suggestion" ? "Suggerimento inviato!" : "Segnalazione inviata!"}
              </p>
              <p className="text-center text-sm text-muted-foreground">
                Il team SANTADDEO valutera il tuo messaggio e ti rispondera al piu presto.
              </p>
              <Button type="button" variant="outline" onClick={() => setFeedbackDialogOpen(false)}>
                Chiudi
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <Textarea
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder={feedbackType === "suggestion"
                    ? "Descrivi la tua idea o il miglioramento che vorresti..."
                    : "Descrivi il problema riscontrato..."
                  }
                  rows={5}
                  className="resize-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  Struttura: <span className="font-medium">{hotelName}</span>
                </p>
                {feedbackError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2.5">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-destructive">Invio non riuscito</p>
                      <p className="text-[11px] text-destructive/80 mt-0.5 break-words">
                        {feedbackError} — il messaggio non e&apos; stato salvato. Riprova.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFeedbackDialogOpen(false)}
                >
                  Annulla
                </Button>
                <Button
                  type="button"
                  onClick={handleSendFeedback}
                  disabled={feedbackSending || !feedbackMessage.trim()}
                  className={feedbackType === "suggestion"
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                  }
                >
                  {feedbackSending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Invio...
                    </>
                  ) : (
                    "Invia"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
