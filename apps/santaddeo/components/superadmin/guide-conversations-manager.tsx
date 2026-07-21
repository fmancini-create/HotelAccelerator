"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Search,
  HelpCircle,
  Mail,
  User,
  Calendar,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Globe,
  Building2,
  CheckCheck,
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { it } from "date-fns/locale"

/**
 * FIX 02/05/2026: la pagina ora legge dalla nuova tabella
 * `page_guide_conversations` (popolata da /api/page-guide su ogni messaggio).
 * Prima leggeva solo da `guide_leads` (anonimi con lead capture) ignorando
 * tutte le conversazioni autenticate. Mantenuta retrocompat sulla sezione
 * "Domande Incerte" che continua a leggere `page_guide_questions`.
 */

interface ChatMessage {
  role: string
  content: string
}

interface GuideConversation {
  id: string
  user_id: string | null
  hotel_id: string | null
  visitor_name: string | null
  visitor_email: string | null
  user_name: string | null
  user_email: string | null
  hotel_name: string | null
  page_path: string
  messages: ChatMessage[]
  is_authenticated: boolean
  has_unread_for_admin: boolean
  message_count: number
  last_message_at: string
  created_at: string
}

interface GuideQuestion {
  id: string
  question: string
  page_path: string
  user_id: string | null
  created_at: string
}

export function GuideConversationsManager() {
  const [conversations, setConversations] = useState<GuideConversation[]>([])
  const [questions, setQuestions] = useState<GuideQuestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "auth" | "anon">("all")
  const [actingId, setActingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/superadmin/guide-leads")
      if (!res.ok) throw new Error("Errore caricamento")
      const data = await res.json()
      setConversations(data.conversations || [])
      setQuestions(data.questions || [])
    } catch {
      toast.error("Errore nel caricamento delle conversazioni")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const markRead = useCallback(async (conversationId: string) => {
    setActingId(conversationId)
    try {
      const res = await fetch("/api/superadmin/guide-leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: conversationId,
          target: "conversation",
          action: "mark_read",
        }),
      })
      if (!res.ok) throw new Error()
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, has_unread_for_admin: false } : c,
        ),
      )
      // Notifica il menu superadmin di aggiornare il pallino
      window.dispatchEvent(new CustomEvent("guide-unread-changed"))
    } catch {
      toast.error("Errore aggiornamento")
    } finally {
      setActingId(null)
    }
  }, [])

  const markAllRead = useCallback(async () => {
    setActingId("all")
    try {
      const res = await fetch("/api/superadmin/guide-leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      })
      if (!res.ok) throw new Error()
      setConversations((prev) => prev.map((c) => ({ ...c, has_unread_for_admin: false })))
      window.dispatchEvent(new CustomEvent("guide-unread-changed"))
      toast.success("Tutte le conversazioni segnate come lette")
    } catch {
      toast.error("Errore aggiornamento")
    } finally {
      setActingId(null)
    }
  }, [])

  // Filtri
  const filteredConversations = conversations
    .filter((c) => {
      if (filterTab === "unread") return c.has_unread_for_admin
      if (filterTab === "auth") return c.is_authenticated
      if (filterTab === "anon") return !c.is_authenticated
      return true
    })
    .filter((c) => {
      if (!searchTerm) return true
      const q = searchTerm.toLowerCase()
      return (
        (c.visitor_name || "").toLowerCase().includes(q) ||
        (c.visitor_email || "").toLowerCase().includes(q) ||
        (c.user_name || "").toLowerCase().includes(q) ||
        (c.user_email || "").toLowerCase().includes(q) ||
        (c.hotel_name || "").toLowerCase().includes(q) ||
        (c.page_path || "").toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
      )
    })

  const unreadCount = conversations.filter((c) => c.has_unread_for_admin).length
  const authCount = conversations.filter((c) => c.is_authenticated).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{conversations.length}</p>
                <p className="text-xs text-muted-foreground">Conversazioni totali</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <Mail className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unreadCount}</p>
                <p className="text-xs text-muted-foreground">Non lette</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <User className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{authCount}</p>
                <p className="text-xs text-muted-foreground">Utenti autenticati</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{questions.length}</p>
                <p className="text-xs text-muted-foreground">Domande incerte</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtri + ricerca */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={filterTab === "all" ? "default" : "outline"}
            onClick={() => setFilterTab("all")}
          >
            Tutte ({conversations.length})
          </Button>
          <Button
            size="sm"
            variant={filterTab === "unread" ? "default" : "outline"}
            onClick={() => setFilterTab("unread")}
            className={filterTab === "unread" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
          >
            Non lette ({unreadCount})
          </Button>
          <Button
            size="sm"
            variant={filterTab === "auth" ? "default" : "outline"}
            onClick={() => setFilterTab("auth")}
          >
            Autenticati ({authCount})
          </Button>
          <Button
            size="sm"
            variant={filterTab === "anon" ? "default" : "outline"}
            onClick={() => setFilterTab("anon")}
          >
            Anonimi ({conversations.length - authCount})
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={actingId === "all"}
            >
              {actingId === "all" ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <CheckCheck className="h-3 w-3 mr-1" />
              )}
              Segna tutto come letto
            </Button>
          )}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca testo, nome, hotel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Lista conversazioni */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-5 w-5 text-blue-600" />
            Conversazioni Chat Guida ({filteredConversations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredConversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {conversations.length === 0
                ? "Nessuna conversazione registrata ancora"
                : "Nessun risultato per il filtro corrente"}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredConversations.map((conv) => {
                const displayName =
                  conv.user_name ||
                  conv.visitor_name ||
                  (conv.is_authenticated ? "Utente loggato" : "Anonimo")
                const displayEmail = conv.user_email || conv.visitor_email
                const lastUserMsg = [...conv.messages]
                  .reverse()
                  .find((m) => m.role === "user")?.content || ""

                return (
                  <div
                    key={conv.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      conv.has_unread_for_admin
                        ? "border-red-200 bg-red-50/30 hover:bg-red-50/50"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {conv.has_unread_for_admin && (
                            <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" aria-label="Non letta" />
                          )}
                          <span className="font-medium text-sm">{displayName}</span>
                          {conv.is_authenticated ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                              Loggato
                            </Badge>
                          ) : conv.visitor_email ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                              Lead
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Anonimo
                            </Badge>
                          )}
                          {displayEmail && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {displayEmail}
                            </span>
                          )}
                          {conv.hotel_name && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              {conv.hotel_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Globe className="h-3 w-3" />
                            {conv.page_path}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(conv.last_message_at), "dd MMM HH:mm", { locale: it })}
                          </span>
                        </div>
                        {lastUserMsg && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">
                            &ldquo;{lastUserMsg}&rdquo;
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {conv.message_count} messaggi nella conversazione
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {conv.has_unread_for_admin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => markRead(conv.id)}
                            disabled={actingId === conv.id}
                          >
                            {actingId === conv.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCheck className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const next = expandedId === conv.id ? null : conv.id
                            setExpandedId(next)
                            // Apertura = lettura implicita
                            if (next && conv.has_unread_for_admin) markRead(conv.id)
                          }}
                        >
                          {expandedId === conv.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Trascript completa */}
                    {expandedId === conv.id && conv.messages.length > 0 && (
                      <div className="mt-4 border-t pt-4">
                        <ScrollArea className="max-h-80">
                          <div className="space-y-2">
                            {conv.messages.map((msg, idx) => (
                              <div
                                key={idx}
                                className={`flex gap-2 ${msg.role === "assistant" ? "" : "justify-end"}`}
                              >
                                <div
                                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${
                                    msg.role === "assistant"
                                      ? "bg-muted text-foreground"
                                      : "bg-blue-600 text-white"
                                  }`}
                                >
                                  <p className="font-medium text-[10px] mb-0.5 opacity-70">
                                    {msg.role === "assistant" ? "Guida AI" : "Utente"}
                                  </p>
                                  {msg.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Domande incerte */}
      {questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Domande Incerte ({questions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {questions.map((q) => (
                <div key={q.id} className="flex items-start gap-3 p-3 border rounded-lg text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground">{q.question}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {q.page_path}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(q.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spazio + clock per autorefresh hint */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Aggiornato {format(new Date(), "HH:mm", { locale: it })}
        </span>
        <Button variant="ghost" size="sm" onClick={loadData}>
          Ricarica
        </Button>
      </div>
    </div>
  )
}
