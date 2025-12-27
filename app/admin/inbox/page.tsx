"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAdminAuth } from "@/lib/admin-hooks"
import {
  MessageCircle,
  Mail,
  Phone,
  Search,
  Send,
  Star,
  Archive,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  Tag,
  Inbox,
  Users,
  Loader2,
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
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set())
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterChannel, setFilterChannel] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("open")
  const [replyText, setReplyText] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [showDemandCalendar, setShowDemandCalendar] = useState(true)
  const [replyChannel, setReplyChannel] = useState<string>("same")
  const [rateLimitError, setRateLimitError] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadConversations = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus !== "all") params.set("status", filterStatus)
      if (filterChannel !== "all") params.set("channel", filterChannel)

      const res = await fetch(`/api/inbox/conversations?${params}`)

      if (res.status === 429) {
        setRateLimitError(true)
        setTimeout(() => setRateLimitError(false), 5000)
        return
      }

      const data = await res.json()

      if (data.conversations) {
        setConversations(data.conversations)
        setRateLimitError(false)
      }
    } catch (error) {
      console.error("Error loading conversations:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/inbox/${conversationId}`)

      if (res.status === 429) {
        setRateLimitError(true)
        setTimeout(() => setRateLimitError(false), 5000)
        return
      }

      const data = await res.json()

      if (data.messages) {
        setMessages(data.messages)
        setRateLimitError(false)
      }
      if (data.conversation) {
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
      pollIntervalRef.current = setInterval(loadConversations, 15000)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [authLoading, adminUser, filterChannel, filterStatus])

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id)

      const msgPoll = setInterval(() => {
        loadMessages(selectedConversation.id)
      }, 10000)

      return () => clearInterval(msgPoll)
    }
  }, [selectedConversation])

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

  const handleArchive = async (convId: string) => {
    try {
      await fetch(`/api/inbox/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      })
      loadConversations()
    } catch (error) {
      console.error("Error archiving:", error)
    }
  }

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConversation || !adminUser) return

    setIsSending(true)
    try {
      const res = await fetch(`/api/inbox/${selectedConversation.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyText,
          sender_type: "agent",
          sender_id: adminUser.id,
          channel: replyChannel !== "same" ? replyChannel : selectedConversation.channel,
        }),
      })

      if (res.ok) {
        setReplyText("")
        loadMessages(selectedConversation.id)
      }
    } catch (error) {
      console.error("Error sending reply:", error)
    } finally {
      setIsSending(false)
    }
  }

  const handleStatusChange = async (status: string) => {
    if (!selectedConversation) return

    try {
      await fetch(`/api/inbox/${selectedConversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })

      setSelectedConversation((prev) => (prev ? { ...prev, status: status as any } : null))
      loadConversations()
    } catch (error) {
      console.error("Error updating status:", error)
    }
  }

  const handleBulkAction = async (action: "archive" | "star" | "delete") => {
    if (selectedConversations.size === 0) return

    for (const convId of selectedConversations) {
      if (action === "archive") {
        await handleArchive(convId)
      } else if (action === "star") {
        const conv = conversations.find((c) => c.id === convId)
        if (conv) await handleToggleStar(conv)
      }
    }
    setSelectedConversations(new Set())
    loadConversations()
  }

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true
    const searchLower = searchQuery.toLowerCase()
    return (
      conv.contact?.name?.toLowerCase().includes(searchLower) ||
      conv.contact?.email?.toLowerCase().includes(searchLower) ||
      conv.subject?.toLowerCase().includes(searchLower) ||
      conv.lastMessage?.content?.toLowerCase().includes(searchLower)
    )
  })

  const getAvailableChannels = () => {
    const channels = [{ value: "same", label: "Stesso canale" }]
    if (selectedConversation?.contact?.email) {
      channels.push({ value: "email", label: "Email" })
    }
    if (selectedConversation?.contact?.whatsapp || selectedConversation?.contact?.phone) {
      channels.push({ value: "whatsapp", label: "WhatsApp" })
    }
    channels.push({ value: "telegram", label: "Telegram" })
    return channels
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {rateLimitError && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800">
          Troppe richieste. Attendere qualche secondo...
        </div>
      )}

      <div className="border-b shrink-0">
        <AdminHeader
          title="Inbox Unificata"
          subtitle="Tutte le conversazioni in un unico posto"
          breadcrumbs={[{ label: "Inbox" }]}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Lista Conversazioni */}
        <div className="w-96 bg-background border-r flex flex-col">
          {/* Toolbar */}
          <div className="p-3 border-b space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cerca conversazioni..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <Select value={filterChannel} onValueChange={setFilterChannel}>
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Canale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i canali</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="open">Aperti</SelectItem>
                  <SelectItem value="pending">In attesa</SelectItem>
                  <SelectItem value="resolved">Risolti</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent" onClick={loadConversations}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* Bulk Actions */}
            {selectedConversations.size > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                <span className="text-sm font-medium">{selectedConversations.size} selezionate</span>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => handleBulkAction("archive")}>
                  <Archive className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleBulkAction("star")}>
                  <Star className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedConversations(new Set())}>
                  Annulla
                </Button>
              </div>
            )}
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Inbox className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="font-medium">Nessuna conversazione</p>
                <p className="text-sm">Le nuove conversazioni appariranno qui</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const channel = channelConfig[conv.channel]
                const ChannelIcon = channel.icon
                const status = statusConfig[conv.status]
                const isSelected = selectedConversation?.id === conv.id

                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`group relative p-3 border-b hover:bg-muted/50 cursor-pointer transition-colors ${
                      isSelected ? "bg-muted border-l-2 border-l-primary" : ""
                    } ${conv.unread_count > 0 ? "bg-blue-50/50" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <Checkbox
                        checked={selectedConversations.has(conv.id)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedConversations)
                          if (checked) {
                            newSet.add(conv.id)
                          } else {
                            newSet.delete(conv.id)
                          }
                          setSelectedConversations(newSet)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      />

                      {/* Star */}
                      <button onClick={(e) => handleToggleStar(conv, e)} className="mt-1">
                        <Star
                          className={`w-4 h-4 ${conv.is_starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`}
                        />
                      </button>

                      {/* Channel Icon */}
                      <div className={`p-2 rounded-full ${channel.color} shrink-0`}>
                        <ChannelIcon className="w-4 h-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`font-medium truncate ${conv.unread_count > 0 ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {conv.contact?.name || "Visitatore"}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-2">
                            {formatDistanceToNow(new Date(conv.last_message_at), {
                              addSuffix: false,
                              locale: it,
                            })}
                          </span>
                        </div>

                        {conv.subject && (
                          <p className={`text-sm truncate mb-1 ${conv.unread_count > 0 ? "font-medium" : ""}`}>
                            {conv.subject}
                          </p>
                        )}

                        <p className="text-sm text-muted-foreground truncate">
                          {conv.lastMessage?.content || "Nessun messaggio"}
                        </p>

                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className={`text-xs ${status.color}`}>
                            {status.label}
                          </Badge>
                          {conv.unread_count > 0 && (
                            <Badge className="bg-primary text-primary-foreground">{conv.unread_count}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Area Chat */}
        {selectedConversation ? (
          <div className="flex-1 flex flex-col bg-muted/30">
            {/* Header Conversazione */}
            <div className="bg-background border-b px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-full ${channelConfig[selectedConversation.channel].color}`}>
                    {(() => {
                      const Icon = channelConfig[selectedConversation.channel].icon
                      return <Icon className="w-5 h-5" />
                    })()}
                  </div>
                  <div>
                    <h2 className="font-semibold">{selectedConversation.contact?.name || "Visitatore"}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedConversation.contact?.email || selectedConversation.channel}
                      {selectedConversation.contact?.phone && ` • ${selectedConversation.contact.phone}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleToggleStar(selectedConversation)}>
                    <Star
                      className={`h-4 w-4 ${selectedConversation.is_starred ? "fill-yellow-400 text-yellow-400" : ""}`}
                    />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleArchive(selectedConversation.id)}>
                    <Archive className="h-4 w-4" />
                  </Button>

                  <Select value={selectedConversation.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Aperto</SelectItem>
                      <SelectItem value="pending">In attesa</SelectItem>
                      <SelectItem value="resolved">Risolto</SelectItem>
                      <SelectItem value="spam">Spam</SelectItem>
                    </SelectContent>
                  </Select>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Users className="h-4 w-4 mr-2" />
                        Assegna a...
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Tag className="h-4 w-4 mr-2" />
                        Aggiungi etichetta
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {/* Messaggi */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender_type === "agent" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      msg.sender_type === "agent"
                        ? "bg-primary text-primary-foreground"
                        : msg.sender_type === "system"
                          ? "bg-muted text-muted-foreground text-sm"
                          : "bg-background border shadow-sm"
                    }`}
                  >
                    {msg.channel && msg.channel !== selectedConversation.channel && (
                      <Badge variant="outline" className="mb-2 text-xs">
                        via {channelConfig[msg.channel as keyof typeof channelConfig]?.name || msg.channel}
                      </Badge>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={`text-xs mt-2 ${msg.sender_type === "agent" ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                    >
                      {new Date(msg.created_at).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Risposta */}
            <div className="bg-background border-t p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-muted-foreground">Rispondi via:</span>
                <Select value={replyChannel} onValueChange={setReplyChannel}>
                  <SelectTrigger className="w-40 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableChannels().map((ch) => (
                      <SelectItem key={ch.value} value={ch.value}>
                        {ch.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {replyChannel !== "same" && replyChannel !== selectedConversation.channel && (
                  <Badge variant="outline" className="text-xs">
                    Cambio canale
                  </Badge>
                )}
              </div>

              <div className="flex gap-3">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Scrivi la tua risposta..."
                  rows={2}
                  className="flex-1 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendReply()
                    }
                  }}
                />
                <Button onClick={handleSendReply} disabled={!replyText.trim() || isSending} className="self-end">
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span className="ml-2">Invia</span>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted/30">
            <div className="text-center text-muted-foreground">
              <Inbox className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Seleziona una conversazione</p>
              <p className="text-sm">per visualizzare i messaggi</p>
            </div>
          </div>
        )}

        {/* Demand Calendar Sidebar */}
        {showDemandCalendar && adminUser?.property_id && (
          <div className="w-72 border-l bg-muted/30 p-3 overflow-y-auto hidden xl:block">
            <DemandCalendar propertyId={adminUser.property_id} compact={true} className="sticky top-0" />
          </div>
        )}
      </div>
    </div>
  )
}
