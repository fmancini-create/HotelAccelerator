"use client"

import { useState, useEffect, useRef } from "react"
import { MessageCircle, X, Send, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Message {
  id: string
  content: string
  sender_type: "customer" | "agent" | "system"
  created_at: string
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [visitorInfo, setVisitorInfo] = useState({ name: "", email: "" })
  const [showForm, setShowForm] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Polling per nuovi messaggi
  useEffect(() => {
    if (conversationId && isOpen) {
      pollIntervalRef.current = setInterval(async () => {
        const res = await fetch("/api/chat/widget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "messages", conversation_id: conversationId }),
        })
        const data = await res.json()
        if (data.messages) {
          setMessages(data.messages)
        }
      }, 3000)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [conversationId, isOpen])

  const startConversation = async () => {
    if (!visitorInfo.name.trim()) return

    setIsLoading(true)
    try {
      const res = await fetch("/api/chat/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          visitor: {
            name: visitorInfo.name,
            email: visitorInfo.email,
            page_url: window.location.href,
            language: navigator.language.split("-")[0],
          },
        }),
      })
      const data = await res.json()

      if (data.conversation_id) {
        setConversationId(data.conversation_id)
        setShowForm(false)
        if (data.welcome_message) {
          setMessages([
            {
              id: "welcome",
              content: data.welcome_message,
              sender_type: "system",
              created_at: new Date().toISOString(),
            },
          ])
        }
      }
    } catch (error) {
      console.error("Error starting conversation:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!inputValue.trim() || !conversationId) return

    const content = inputValue.trim()
    setInputValue("")

    // Aggiungi messaggio ottimisticamente
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      content,
      sender_type: "customer",
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMessage])

    try {
      await fetch("/api/chat/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          conversation_id: conversationId,
          message: content,
        }),
      })
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-amber-700 hover:bg-amber-800 text-white rounded-full p-4 shadow-lg transition-all hover:scale-110"
        aria-label="Apri chat"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    )
  }

  if (isMinimized) {
    return (
      <div
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 bg-amber-700 text-white rounded-lg px-4 py-2 shadow-lg cursor-pointer flex items-center gap-2"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm font-medium">Chat</span>
        {messages.filter((m) => m.sender_type === "agent").length > 0 && (
          <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">!</span>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-48px)] bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col"
      style={{ height: "500px", maxHeight: "calc(100vh - 100px)" }}
    >
      {/* Header */}
      <div className="bg-amber-700 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          <span className="font-semibold">Villa I Barronci</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMinimized(true)} className="p-1 hover:bg-amber-600 rounded">
            <Minimize2 className="w-4 h-4" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-amber-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {showForm ? (
        <div className="flex-1 p-4 flex flex-col justify-center">
          <h3 className="text-lg font-semibold text-stone-800 mb-2 text-center">Benvenuto!</h3>
          <p className="text-sm text-stone-600 mb-4 text-center">Inserisci i tuoi dati per iniziare la chat</p>
          <div className="space-y-3">
            <Input
              placeholder="Il tuo nome *"
              value={visitorInfo.name}
              onChange={(e) => setVisitorInfo((prev) => ({ ...prev, name: e.target.value }))}
            />
            <Input
              type="email"
              placeholder="Email (opzionale)"
              value={visitorInfo.email}
              onChange={(e) => setVisitorInfo((prev) => ({ ...prev, email: e.target.value }))}
            />
            <Button
              onClick={startConversation}
              disabled={!visitorInfo.name.trim() || isLoading}
              className="w-full bg-amber-700 hover:bg-amber-800"
            >
              {isLoading ? "Avvio chat..." : "Inizia Chat"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender_type === "customer" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    msg.sender_type === "customer"
                      ? "bg-amber-700 text-white"
                      : msg.sender_type === "system"
                        ? "bg-stone-200 text-stone-600 text-sm"
                        : "bg-white text-stone-800 border border-stone-200"
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                  <p className={`text-xs mt-1 ${msg.sender_type === "customer" ? "text-amber-200" : "text-stone-400"}`}>
                    {new Date(msg.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-stone-200 bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendMessage()
              }}
              className="flex gap-2"
            >
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Scrivi un messaggio..."
                className="flex-1"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputValue.trim()}
                className="bg-amber-700 hover:bg-amber-800"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
