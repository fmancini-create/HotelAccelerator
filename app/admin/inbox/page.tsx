"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAdminAuth } from "@/lib/admin-hooks"
import { MessageCircle, Mail, Phone, Search, Send, ArrowLeft, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import Link from "next/link"

interface Contact {
  id: string
  name: string
  email: string
  phone: string
}

interface Conversation {
  id: string
  channel: "chat" | "whatsapp" | "email"
  status: "open" | "pending" | "resolved" | "spam"
  subject: string | null
  last_message_at: string
  unread_count: number
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
}

const channelIcons = {
  chat: MessageCircle,
  whatsapp: Phone,
  email: Mail,
}

const channelColors = {
  chat: "text-green-600 bg-green-100",
  whatsapp: "text-emerald-600 bg-emerald-100",
  email: "text-blue-600 bg-blue-100",
}

const statusColors = {
  open: "text-amber-600 bg-amber-100",
  pending: "text-orange-600 bg-orange-100",
  resolved: "text-green-600 bg-green-100",
  spam: "text-red-600 bg-red-100",
}

export default function InboxPage() {
  const router = useRouter()
  const { adminUser, isLoading: authLoading } = useAdminAuth()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterChannel, setFilterChannel] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("open")
  const [replyText, setReplyText] = useState("")
  const [isSending, setIsSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Carica conversazioni
  const loadConversations = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus !== "all") params.set("status", filterStatus)
      if (filterChannel !== "all") params.set("channel", filterChannel)

      const res = await fetch(`/api/inbox/conversations?${params}`)
      const data = await res.json()

      if (data.conversations) {
        setConversations(data.conversations)
      }
    } catch (error) {
      console.error("Error loading conversations:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Carica messaggi conversazione
  const loadMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/inbox/${conversationId}`)
      const data = await res.json()

      if (data.messages) {
        setMessages(data.messages)
      }
      if (data.conversation) {
        setSelectedConversation(data.conversation)
      }
    } catch (error) {
      console.error("Error loading messages:", error)
    }
  }

  useEffect(() => {
    if (!authLoading && adminUser) {
      loadConversations()

      // Polling per nuove conversazioni
      pollIntervalRef.current = setInterval(loadConversations, 10000)
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

      // Polling per nuovi messaggi
      const msgPoll = setInterval(() => {
        loadMessages(selectedConversation.id)
      }, 5000)

      return () => clearInterval(msgPoll)
    }
  }, [selectedConversation])

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

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true
    const searchLower = searchQuery.toLowerCase()
    return (
      conv.contact?.name?.toLowerCase().includes(searchLower) ||
      conv.contact?.email?.toLowerCase().includes(searchLower) ||
      conv.lastMessage?.content?.toLowerCase().includes(searchLower)
    )
  })

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-700"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col">
      {/* Header */}
      <header className="bg-stone-900 text-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="icon" className="text-white hover:bg-stone-800">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">Inbox Unificata</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="border-amber-600 text-amber-500 hover:bg-amber-600 hover:text-white bg-transparent"
              >
                <Home className="w-4 h-4 mr-2" />
                Sito Pubblico
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Lista Conversazioni */}
        <div className="w-96 bg-white border-r border-stone-200 flex flex-col">
          {/* Filtri */}
          <div className="p-4 border-b border-stone-200 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input
                placeholder="Cerca conversazioni..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="flex-1 text-sm border border-stone-300 rounded-md px-2 py-1.5"
              >
                <option value="all">Tutti i canali</option>
                <option value="chat">Chat</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 text-sm border border-stone-300 rounded-md px-2 py-1.5"
              >
                <option value="all">Tutti</option>
                <option value="open">Aperti</option>
                <option value="pending">In attesa</option>
                <option value="resolved">Risolti</option>
              </select>
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-stone-500">Caricamento...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-stone-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 text-stone-300" />
                <p>Nessuna conversazione</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const ChannelIcon = channelIcons[conv.channel]
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`w-full p-4 border-b border-stone-100 hover:bg-stone-50 text-left transition-colors ${
                      selectedConversation?.id === conv.id ? "bg-amber-50 border-l-4 border-l-amber-600" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${channelColors[conv.channel]}`}>
                        <ChannelIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-stone-900 truncate">
                            {conv.contact?.name || "Visitatore"}
                          </span>
                          {conv.unread_count > 0 && (
                            <span className="bg-amber-600 text-white text-xs rounded-full px-2 py-0.5">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-stone-600 truncate">
                          {conv.lastMessage?.content || "Nessun messaggio"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[conv.status]}`}>
                            {conv.status}
                          </span>
                          <span className="text-xs text-stone-400">
                            {new Date(conv.last_message_at).toLocaleString("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Area Chat */}
        {selectedConversation ? (
          <div className="flex-1 flex flex-col bg-stone-50">
            {/* Header Conversazione */}
            <div className="bg-white border-b border-stone-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-full ${channelColors[selectedConversation.channel]}`}>
                    {(() => {
                      const Icon = channelIcons[selectedConversation.channel]
                      return <Icon className="w-5 h-5" />
                    })()}
                  </div>
                  <div>
                    <h2 className="font-semibold text-stone-900">
                      {selectedConversation.contact?.name || "Visitatore"}
                    </h2>
                    <p className="text-sm text-stone-500">
                      {selectedConversation.contact?.email || selectedConversation.channel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedConversation.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="text-sm border border-stone-300 rounded-md px-3 py-1.5"
                  >
                    <option value="open">Aperto</option>
                    <option value="pending">In attesa</option>
                    <option value="resolved">Risolto</option>
                    <option value="spam">Spam</option>
                  </select>
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
                        ? "bg-amber-700 text-white"
                        : msg.sender_type === "system"
                          ? "bg-stone-200 text-stone-600 text-sm"
                          : "bg-white text-stone-800 border border-stone-200 shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-2 ${msg.sender_type === "agent" ? "text-amber-200" : "text-stone-400"}`}>
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
            <div className="bg-white border-t border-stone-200 p-4">
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
                <Button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || isSending}
                  className="bg-amber-700 hover:bg-amber-800 self-end"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Invia
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-stone-50">
            <div className="text-center text-stone-500">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 text-stone-300" />
              <p className="text-lg">Seleziona una conversazione</p>
              <p className="text-sm">per visualizzare i messaggi</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
