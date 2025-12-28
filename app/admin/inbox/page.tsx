"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAdminAuth } from "@/lib/admin-hooks"
import { createClient } from "@/lib/supabase/client"
import {
  MessageCircle,
  Mail,
  Phone,
  Search,
  Send,
  Star,
  Archive,
  Trash2,
  RefreshCw,
  Tag,
  Inbox,
  Users,
  Loader2,
  MoreVertical,
  Paperclip,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DemandCalendar } from "@/components/admin/demand-calendar"
import { AdminHeader } from "@/components/admin/admin-header"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"

interface Contact {
  id: string
  name: string
  email: string
  phone: string
  whatsapp?: string
}

interface Conversation {
  id: string
  channel: "chat" | "whatsapp" | "email" | "telegram"
  status: "open" | "pending" | "resolved" | "spam"
  subject: string | null
  last_message_at: string
  unread_count: number
  is_starred: boolean
  contact: Contact | null
  lastMessage: {
    content: string
    sender_type: string
    created_at: string
  } | null
}

interface Message {
  id: string
  content: string
  sender_type: "customer" | "agent" | "system"
  sender_id: string | null
  content_type: string
  created_at: string
  attachments: any[]
  channel?: string
}

const channelConfig = {
  chat: { icon: MessageCircle, color: "text-green-600 bg-green-100", name: "Chat" },
  whatsapp: { icon: Phone, color: "text-emerald-600 bg-emerald-100", name: "WhatsApp" },
  email: { icon: Mail, color: "text-blue-600 bg-blue-100", name: "Email" },
  telegram: { icon: Send, color: "text-sky-600 bg-sky-100", name: "Telegram" },
}

const statusConfig = {
  open: { label: "Aperto", color: "bg-amber-100 text-amber-700" },
  pending: { label: "In attesa", color: "bg-orange-100 text-orange-700" },
  resolved: { label: "Risolto", color: "bg-green-100 text-green-700" },
  spam: { label: "Spam", color: "bg-red-100 text-red-700" },
}

export default function InboxPage() {
  const router = useRouter()
  const { adminUser, isLoading: authLoading } = useAdminAuth()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [replyText, setReplyText] = useState("")
  const [replyChannel, setReplyChannel] = useState<string>("email")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("open")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateLimitError, setRateLimitError] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const realtimeChannelRef = useRef<any>(null)

  const isPausedRef = useRef(false)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const msgPollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const selectedConversationIdRef = useRef<string | null>(null)
  const hasScrolledRef = useRef(false)

  const scrollToBottom = (force = false) => {
    if (messagesEndRef.current && (force || !hasScrolledRef.current)) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
      hasScrolledRef.current = true
    }
  }

  const loadConversations = useCallback(async () => {
    if (isPausedRef.current) return

    try {
      const queryParams = new URLSearchParams()
      if (statusFilter) queryParams.set("status", statusFilter)
      if (searchQuery) queryParams.set("search", searchQuery)

      const res = await fetch(`/api/inbox/conversations?${queryParams}`)

      if (res.status === 429) {
        setRateLimitError(true)
        isPausedRef.current = true
        setTimeout(() => {
          setRateLimitError(false)
          isPausedRef.current = false
        }, 30000)
        return
      }

      if (res.status === 401) {
        setError("Non autenticato. Effettua il login per continuare.")
        return
      }

      if (!res.ok) {
        console.error("[v0] Error loading conversations:", res.status)
        return
      }

      const data = await res.json()
      setConversations(data.conversations || [])
      setError(null)
      setRateLimitError(false)
    } catch (error) {
      console.error("Error loading conversations:", error)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, searchQuery])

  const loadMessages = async (conversationId: string, isInitialLoad = false) => {
    if (isPausedRef.current) return

    try {
      const res = await fetch(`/api/inbox/${conversationId}`)

      if (res.status === 429) {
        setRateLimitError(true)
        isPausedRef.current = true
        setTimeout(() => {
          setRateLimitError(false)
          isPausedRef.current = false
        }, 30000)
        return
      }

      if (!res.ok) {
        console.error("[v0] Error loading messages:", res.status)
        return
      }

      const data = await res.json()

      if (data.messages) {
        setMessages(data.messages)
        setRateLimitError(false)
        if (isInitialLoad) {
          setTimeout(() => scrollToBottom(true), 100)
        }
      }
      if (data.conversation && isInitialLoad) {
        setSelectedConversation(data.conversation)
        setReplyChannel(data.conversation.channel)
      }
    } catch (error) {
      console.error("Error loading messages:", error)
    }
  }

  useEffect(() => {
    if (!authLoading && adminUser) {
      loadConversations()

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      pollIntervalRef.current = setInterval(loadConversations, 30000)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [authLoading, adminUser, loadConversations])

  useEffect(() => {
    if (msgPollIntervalRef.current) {
      clearInterval(msgPollIntervalRef.current)
      msgPollIntervalRef.current = null
    }

    if (selectedConversationId) {
      hasScrolledRef.current = false

      loadMessages(selectedConversationId, true)

      const currentId = selectedConversationId
      msgPollIntervalRef.current = setInterval(() => {
        if (selectedConversationIdRef.current === currentId) {
          loadMessages(currentId, false)
        }
      }, 20000)
    }

    return () => {
      if (msgPollIntervalRef.current) {
        clearInterval(msgPollIntervalRef.current)
        msgPollIntervalRef.current = null
      }
    }
  }, [selectedConversationId])

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setSelectedConversation(conv)
    setSelectedConversationId(conv.id)
    setMessages([])
    hasScrolledRef.current = false
  }, [])

  const handleToggleStar = async (conv: Conversation, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await fetch(`/api/inbox/${conv.id}/toggle-star`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_starred: !conv.is_starred }),
      })

      setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, is_starred: !c.is_starred } : c)))
      if (selectedConversation?.id === conv.id) {
        setSelectedConversation({ ...selectedConversation, is_starred: !conv.is_starred })
      }
    } catch (error) {
      console.error("Error toggling star:", error)
    }
  }

  const handleArchive = async (convId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await fetch(`/api/inbox/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      })

      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (selectedConversation?.id === convId) {
        setSelectedConversation(null)
        setSelectedConversationId(null)
        setMessages([])
      }
    } catch (error) {
      console.error("Error archiving:", error)
    }
  }

  const handleMarkAsSpam = async (convId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await fetch(`/api/inbox/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "spam" }),
      })

      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (selectedConversation?.id === convId) {
        setSelectedConversation(null)
        setSelectedConversationId(null)
        setMessages([])
      }
    } catch (error) {
      console.error("Error marking as spam:", error)
    }
  }

  const handleSendReply = async () => {
    console.log("[v0] handleSendReply called", {
      replyText,
      replyTextLength: replyText?.length,
      selectedConversation: selectedConversation?.id,
      selectedConversationId,
    })

    if (!replyText.trim() || !selectedConversation) {
      console.log("[v0] Send blocked - missing text or conversation", {
        hasText: !!replyText.trim(),
        textValue: replyText,
        hasConversation: !!selectedConversation,
        conversationId: selectedConversation?.id,
      })
      return
    }

    setIsSending(true)
    try {
      const url = `/api/inbox/${selectedConversation.id}/send`
      console.log("[v0] Sending reply to:", url)
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyText,
          channel: replyChannel === "same" ? selectedConversation.channel : replyChannel,
          attachments: attachments.map((file) => file.name),
        }),
      })

      console.log("[v0] Send response status:", res.status)
      const responseData = await res.json().catch(() => ({}))
      console.log("[v0] Send response data:", responseData)

      if (res.ok) {
        setReplyText("")
        setAttachments([])
        await loadMessages(selectedConversation.id, false)
        setTimeout(() => scrollToBottom(true), 100)
      } else {
        console.error("[v0] Send failed:", responseData)
        alert(`Errore invio: ${responseData.error || "Errore sconosciuto"}`)
      }
    } catch (error) {
      console.error("[v0] Error sending reply:", error)
      alert(`Errore invio: ${error}`)
    } finally {
      setIsSending(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files))
    }
  }

  const filteredConversations = conversations.filter((conv) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchName = conv.contact?.name?.toLowerCase().includes(query)
      const matchEmail = conv.contact?.email?.toLowerCase().includes(query)
      const matchSubject = conv.subject?.toLowerCase().includes(query)
      if (!matchName && !matchEmail && !matchSubject) return false
    }
    return true
  })

  const renderEmailContent = (content: string) => {
    const isHtml = /<[a-z][\s\S]*>/i.test(content)

    if (isHtml) {
      return (
        <div className="email-content prose prose-sm max-w-none overflow-x-auto">
          <iframe
            srcDoc={`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    line-height: 1.5;
                    color: #333;
                    margin: 0;
                    padding: 16px;
                    background: white;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                  }
                  img {
                    max-width: 100%;
                    height: auto;
                  }
                  a {
                    color: #0066cc;
                    word-break: break-all;
                  }
                  table {
                    max-width: 100% !important;
                    width: 100% !important;
                    table-layout: fixed;
                  }
                  td, th {
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                  }
                  blockquote {
                    border-left: 3px solid #ccc;
                    margin: 0;
                    padding-left: 12px;
                    color: #666;
                  }
                  * {
                    max-width: 100%;
                    box-sizing: border-box;
                  }
                  a[style*="display"], div[style*="display"] {
                    max-width: 100% !important;
                    word-break: break-word;
                  }
                </style>
              </head>
              <body>${content}</body>
              </html>
            `}
            className="w-full border-0 bg-white"
            style={{ minHeight: "200px", height: "auto" }}
            onLoad={(e) => {
              const iframe = e.target as HTMLIFrameElement
              if (iframe.contentWindow?.document.body) {
                iframe.style.height = iframe.contentWindow.document.body.scrollHeight + 32 + "px"
              }
            }}
            sandbox="allow-same-origin"
          />
        </div>
      )
    }

    return <div className="whitespace-pre-wrap break-words text-sm">{content}</div>
  }

  useEffect(() => {
    if (!adminUser) return

    const supabase = createClient()

    // Subscribe to new messages and conversation updates
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          console.log("[v0] Realtime: New message received", payload)
          // Reload conversations to update last message and unread count
          loadConversations()
          // If this message is for the selected conversation, reload messages
          if (payload.new && payload.new.conversation_id === selectedConversationIdRef.current) {
            loadMessages(selectedConversationIdRef.current, false)
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        (payload) => {
          console.log("[v0] Realtime: Conversation updated", payload)
          loadConversations()
        },
      )
      .subscribe((status) => {
        console.log("[v0] Realtime subscription status:", status)
      })

    realtimeChannelRef.current = channel

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current)
        realtimeChannelRef.current = null
      }
    }
  }, [adminUser, loadConversations])

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!adminUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Accesso richiesto</h2>
          <p className="text-muted-foreground mb-4">Devi effettuare il login per accedere all'inbox.</p>
          <Button onClick={() => router.push("/admin/login")}>Vai al login</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <AdminHeader title="Inbox" subtitle="Gestisci le conversazioni" />

      {rateLimitError && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
          Troppe richieste. Riprovo tra qualche secondo...
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null)
              loadConversations()
            }}
          >
            Riprova
          </Button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation List */}
        <div className="w-80 border-r flex flex-col bg-card overflow-hidden">
          <div className="p-4 border-b space-y-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                Inbox Operativa
              </h2>
              <Button variant="ghost" size="icon" onClick={loadConversations} disabled={rateLimitError}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca conversazioni..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex gap-1">
              <Button
                variant={statusFilter === "open" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("open")}
                className="flex-1"
              >
                <MessageCircle className="h-3 w-3 mr-1" />
                Tutte
              </Button>
              <Button
                variant={statusFilter === "pending" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("pending")}
                className="flex-1"
              >
                <Tag className="h-3 w-3 mr-1" />
                Da fare
              </Button>
              <Button
                variant={statusFilter === "starred" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("starred")}
                className="flex-1"
              >
                <Star className="h-3 w-3 mr-1" />
                Urgenti
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nessuna conversazione</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`p-3 border-b cursor-pointer hover:bg-accent transition-colors ${
                    selectedConversation?.id === conv.id ? "bg-accent" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox checked={false} onCheckedChange={() => {}} onClick={(e) => e.stopPropagation()} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate">
                          {conv.contact?.name || conv.contact?.email || "Sconosciuto"}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatDistanceToNow(new Date(conv.last_message_at), {
                            addSuffix: true,
                            locale: it,
                          })}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground truncate">
                        {conv.subject || conv.lastMessage?.content || "Nessun messaggio"}
                      </p>

                      <div className="flex items-center gap-1 mt-1">
                        {(() => {
                          const config = channelConfig[conv.channel]
                          const Icon = config?.icon || MessageCircle
                          return <Icon className={`h-3 w-3 ${config?.color.split(" ")[0] || "text-gray-600"}`} />
                        })()}

                        {conv.unread_count > 0 && (
                          <Badge variant="default" className="h-4 px-1 text-xs">
                            {conv.unread_count}
                          </Badge>
                        )}

                        <div className="flex-1" />

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => handleToggleStar(conv, e)}
                        >
                          <Star
                            className={`h-3 w-3 ${conv.is_starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                          />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Message Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className="flex-shrink-0 p-4 border-b bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {selectedConversation.contact?.name || selectedConversation.contact?.email || "Sconosciuto"}
                      </h3>
                      <p className="text-sm text-muted-foreground">{selectedConversation.contact?.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className={statusConfig[selectedConversation.status]?.color}>
                      {statusConfig[selectedConversation.status]?.label}
                    </Badge>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleStar(selectedConversation)}>
                          <Star className="mr-2 h-4 w-4" />
                          {selectedConversation.is_starred ? "Rimuovi stella" : "Aggiungi stella"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleArchive(selectedConversation.id)}>
                          <Archive className="mr-2 h-4 w-4" />
                          Archivia
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleMarkAsSpam(selectedConversation.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Segna come spam
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {selectedConversation.subject && (
                  <div className="mt-2 text-sm font-medium">Oggetto: {selectedConversation.subject}</div>
                )}
              </div>

              <div ref={messagesEndRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender_type === "agent" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`rounded-lg ${
                        message.sender_type === "agent"
                          ? "max-w-[80%] bg-primary text-primary-foreground p-3"
                          : "max-w-[95%] bg-muted p-0"
                      }`}
                    >
                      {message.sender_type === "agent" ? (
                        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                      ) : (
                        <div className="bg-white rounded-lg overflow-hidden">{renderEmailContent(message.content)}</div>
                      )}
                      <div
                        className={`text-xs mt-1 ${
                          message.sender_type === "agent"
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground px-3 pb-2"
                        }`}
                      >
                        {new Date(message.created_at).toLocaleString("it-IT")}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Box */}
              <div className="flex-shrink-0 p-4 border-t bg-card">
                <div className="flex gap-2 mb-2">
                  <Select value={replyChannel} onValueChange={setReplyChannel}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">Stesso canale</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Textarea
                    placeholder="Scrivi una risposta..."
                    value={replyText}
                    onChange={(e) => {
                      console.log("[v0] replyText changed:", e.target.value)
                      setReplyText(e.target.value)
                    }}
                    className="min-h-[80px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        console.log("[v0] Ctrl+Enter pressed")
                        handleSendReply()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      console.log("[v0] Send button clicked directly")
                      handleSendReply()
                    }}
                    disabled={!replyText.trim() || isSending}
                    className="self-end"
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="flex gap-2 mt-2">
                  <Input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="h-4 w-4 mr-2" />
                    Allega file
                  </Button>
                  {attachments.length > 0 && (
                    <div className="flex gap-2 items-center">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-sm">{file.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Seleziona una conversazione</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Demand Calendar */}
        <div className="w-80 border-l bg-card overflow-y-auto flex-shrink-0">
          <DemandCalendar />
        </div>
      </div>
    </div>
  )
}
