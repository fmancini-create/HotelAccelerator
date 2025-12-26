"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Mail,
  Search,
  Send,
  Calendar,
  Users,
  Hotel,
  Euro,
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  RefreshCw,
  Inbox,
  AlertCircle,
  Brain,
  ArrowRight,
  MessageSquare,
  CalendarPlus,
  Phone,
  AlertTriangle,
  Zap,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import { useAdminAuth } from "@/lib/admin-hooks"
import type { IntelligenceSummary, NextAction } from "@/lib/conversation-intelligence-aggregator"
import { AdminHeader } from "@/components/admin/admin-header"

// Types
interface Contact {
  id: string
  email: string
  name: string | null
  phone: string | null
}

interface Message {
  id: string
  content: string
  sender_type: "customer" | "agent" | "staff" | "system"
  sender_id: string | null
  created_at: string
  metadata: Record<string, unknown>
}

interface BookingData {
  check_in?: string
  check_out?: string
  guests_adults?: number
  guests_children?: number
  room_type?: string
  room_notes?: string
  quote_amount?: number
  quote_sent_at?: string
  outcome?: "pending" | "confirmed" | "cancelled" | "no_response"
  outcome_notes?: string
}

interface ConversationMetadata {
  intelligence_summary?: IntelligenceSummary
}

interface Conversation {
  id: string
  subject: string | null
  status: string
  priority: string
  is_starred: boolean
  channel: string
  last_message_at: string
  created_at: string
  contact: Contact | null
  messages: Message[]
  booking_data: BookingData
  property_id: string
  metadata: ConversationMetadata | null
}

const ROOM_TYPES = [
  { value: "economy", label: "Economy" },
  { value: "standard", label: "Standard" },
  { value: "superior", label: "Superior" },
  { value: "deluxe", label: "Deluxe" },
  { value: "suite", label: "Suite" },
  { value: "family", label: "Family Room" },
  { value: "tuscan", label: "Tuscan Style" },
  { value: "dependance", label: "Dependance" },
]

const OUTCOMES = [
  { value: "pending", label: "In attesa", color: "bg-yellow-100 text-yellow-800" },
  { value: "confirmed", label: "Confermato", color: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "Annullato", color: "bg-red-100 text-red-800" },
  { value: "no_response", label: "Nessuna risposta", color: "bg-gray-100 text-gray-800" },
]

const ACTION_CONFIG: Record<
  NextAction,
  { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  send_quote: { label: "Invia Preventivo", icon: <Euro className="h-4 w-4" />, variant: "default" },
  request_dates: { label: "Richiedi Date", icon: <CalendarPlus className="h-4 w-4" />, variant: "default" },
  request_guests: { label: "Richiedi Ospiti", icon: <Users className="h-4 w-4" />, variant: "default" },
  request_confirmation: { label: "Richiedi Conferma", icon: <CheckCircle className="h-4 w-4" />, variant: "default" },
  follow_up: { label: "Follow Up", icon: <Phone className="h-4 w-4" />, variant: "secondary" },
  provide_info: { label: "Rispondi Info", icon: <MessageSquare className="h-4 w-4" />, variant: "secondary" },
  handle_complaint: { label: "Gestisci Reclamo", icon: <AlertTriangle className="h-4 w-4" />, variant: "destructive" },
  close_won: { label: "Chiudi Vinto", icon: <CheckCircle className="h-4 w-4" />, variant: "default" },
  close_lost: { label: "Chiudi Perso", icon: <XCircle className="h-4 w-4" />, variant: "outline" },
  await_response: { label: "In Attesa", icon: <Clock className="h-4 w-4" />, variant: "outline" },
  escalate: { label: "Escala", icon: <AlertCircle className="h-4 w-4" />, variant: "destructive" },
  none: { label: "Nessuna Azione", icon: <CheckCircle className="h-4 w-4" />, variant: "outline" },
}

const PRIORITY_CONFIG = {
  high: { label: "Alta", color: "bg-red-100 text-red-800 border-red-200" },
  medium: { label: "Media", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  low: { label: "Bassa", color: "bg-gray-100 text-gray-600 border-gray-200" },
}

const INTENT_LABELS: Record<string, string> = {
  booking_request: "Richiesta Prenotazione",
  booking_modification: "Modifica Prenotazione",
  booking_cancellation: "Cancellazione",
  availability_check: "Verifica Disponibilità",
  info_rooms: "Info Camere",
  info_services: "Info Servizi",
  info_location: "Info Posizione",
  info_pricing: "Info Prezzi",
  info_policies: "Info Politiche",
  complaint: "Reclamo",
  feedback: "Feedback",
  thank_you: "Ringraziamento",
  greeting: "Saluto",
  follow_up: "Follow Up",
  confirmation: "Conferma",
  question: "Domanda",
  other: "Altro",
  unknown: "Non classificato",
}

const STATE_LABELS: Record<string, string> = {
  new: "Nuova",
  inquiry: "Richiesta",
  quote_pending: "Preventivo da fare",
  quote_sent: "Preventivo inviato",
  negotiation: "Negoziazione",
  confirmed: "Confermata",
  cancelled: "Annullata",
  completed: "Completata",
  complaint: "Reclamo",
  follow_up: "Follow Up",
  archived: "Archiviata",
}

export default function EmailInboxClient() {
  const { isAuthenticated, isLoading: authLoading } = useAdminAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [replyText, setReplyText] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [bookingData, setBookingData] = useState<BookingData>({})
  const [isSavingBooking, setIsSavingBooking] = useState(false)
  const [filter, setFilter] = useState<"all" | "action_needed" | "high_priority">("all")
  const [isProcessingIntelligence, setIsProcessingIntelligence] = useState(false)

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchConversations()
    }
  }, [authLoading, isAuthenticated, filter, searchQuery])

  useEffect(() => {
    if (selectedConversation) {
      setBookingData(selectedConversation.booking_data || {})
    }
  }, [selectedConversation])

  async function fetchConversations() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        status: "all",
        channel: "email",
        limit: "100",
        filter: filter,
      })

      if (searchQuery) {
        params.append("search", searchQuery)
      }

      const response = await fetch(`/api/inbox/conversations?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch conversations")
      }

      // Map API response to UI types
      const formattedConversations = (data.conversations || []).map((conv: any) => ({
        ...conv,
        is_starred: conv.is_starred || false,
        priority: conv.intelligence_summary?.next_action?.priority || "normal",
        messages: [], // Messages loaded separately when conversation is selected
      })) as Conversation[]

      setConversations(formattedConversations)
    } catch (error) {
      console.error("Error fetching conversations:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function loadConversationDetail(convId: string) {
    try {
      const response = await fetch(`/api/inbox/${convId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to load conversation")
      }

      // Update selected conversation with full data
      const fullConversation: Conversation = {
        ...data.conversation,
        messages: data.messages || [],
        is_starred: data.conversation.is_starred || false,
        priority: data.conversation.intelligence_summary?.next_action?.priority || "normal",
      }

      setSelectedConversation(fullConversation)
    } catch (error) {
      console.error("Error loading conversation detail:", error)
    }
  }

  async function processIntelligence(conv: Conversation) {
    setIsProcessingIntelligence(true)
    try {
      // First process all messages
      for (const msg of conv.messages.filter((m) => m.sender_type === "customer")) {
        await fetch("/api/intelligence/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message_id: msg.id,
          }),
        })
      }

      // Then aggregate
      const response = await fetch("/api/intelligence/aggregate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conv.id,
        }),
      })

      if (response.ok) {
        await fetchConversations()
        // Re-select the conversation to get updated data
        const updated = conversations.find((c) => c.id === conv.id)
        if (updated) setSelectedConversation(updated)
      }
    } catch (error) {
      console.error("Error processing intelligence:", error)
    } finally {
      setIsProcessingIntelligence(false)
    }
  }

  async function executeAction(action: NextAction, conv: Conversation) {
    const summary = conv.metadata?.intelligence_summary

    switch (action) {
      case "send_quote":
        // Pre-fill reply with quote template
        const dates = summary?.dates_status
        const guests = summary?.guests_status
        setReplyText(`Gentile ${conv.contact?.name || "Cliente"},

grazie per la Sua richiesta di prenotazione${dates?.check_in ? ` dal ${format(new Date(dates.check_in), "dd/MM/yyyy")} al ${format(new Date(dates.check_out!), "dd/MM/yyyy")}` : ""}.

${guests?.adults ? `Per ${guests.adults} adult${guests.adults > 1 ? "i" : "o"}${guests.children ? ` e ${guests.children} bambin${guests.children > 1 ? "i" : "o"}` : ""}` : ""}

Il preventivo per il soggiorno richiesto è di € _____.

Il prezzo include:
- Pernottamento con prima colazione
- Accesso alla piscina e alla Jacuzzi
- WiFi gratuito
- Parcheggio gratuito

Restiamo a disposizione per qualsiasi chiarimento.

Cordiali saluti,
Villa I Barronci`)
        break

      case "request_dates":
        setReplyText(`Gentile ${conv.contact?.name || "Cliente"},

grazie per averci contattato!

Per poterLe inviare un preventivo accurato, potrebbe gentilmente indicarci:
- Data di arrivo (check-in)
- Data di partenza (check-out)

Restiamo a disposizione.

Cordiali saluti,
Villa I Barronci`)
        break

      case "request_guests":
        setReplyText(`Gentile ${conv.contact?.name || "Cliente"},

grazie per la Sua richiesta.

Per completare il preventivo, potrebbe indicarci il numero di ospiti (adulti e bambini)?

Cordiali saluti,
Villa I Barronci`)
        break

      case "follow_up":
        setReplyText(`Gentile ${conv.contact?.name || "Cliente"},

ci permettiamo di ricontattarLa riguardo alla Sua richiesta di informazioni.

Siamo ancora a disposizione per assisterLa nella prenotazione.

Può contattarci anche telefonicamente al numero +39 055 XXX XXXX.

Cordiali saluti,
La Direzione
Villa I Barronci`)
        break

      case "handle_complaint":
        setReplyText(`Gentile ${conv.contact?.name || "Cliente"},

ci scusiamo sinceramente per l'inconveniente segnalato.

Prendiamo molto seriamente ogni feedback dei nostri ospiti e faremo il possibile per risolvere la situazione.

Può contattarci direttamente al +39 055 XXX XXXX per discutere del problema.

Cordiali saluti,
La Direzione
Villa I Barronci`)
        break

      case "close_won":
        await updateConversationOutcome(conv.id, "confirmed")
        break

      case "close_lost":
        await updateConversationOutcome(conv.id, "cancelled")
        break

      default:
        break
    }
  }

  async function updateConversationOutcome(convId: string, outcome: string) {
    try {
      const response = await fetch(`/api/inbox/${convId}/update-outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          booking_data: bookingData,
        }),
      })

      if (!response.ok) throw new Error("Failed to update outcome")

      await fetchConversations()
    } catch (error) {
      console.error("Error updating outcome:", error)
    }
  }

  async function toggleStar(conv: Conversation, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const response = await fetch(`/api/inbox/${conv.id}/toggle-star`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_starred: !conv.is_starred }),
      })

      if (!response.ok) throw new Error("Failed to toggle star")

      const result = await response.json()

      setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, is_starred: !conv.is_starred } : c)))
      if (selectedConversation?.id === conv.id) {
        setSelectedConversation({ ...selectedConversation, is_starred: !conv.is_starred })
      }
    } catch (error) {
      console.error("Error toggling star:", error)
    }
  }

  async function sendReply() {
    if (!selectedConversation || !replyText.trim()) return

    setIsSending(true)
    try {
      const response = await fetch(`/api/inbox/${selectedConversation.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyText,
          sender_type: "agent",
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Errore invio email")
      }

      const newMessage: Message = {
        id: result.message?.id || crypto.randomUUID(),
        content: replyText,
        sender_type: "agent",
        sender_id: null,
        created_at: new Date().toISOString(),
        metadata: {
          email_sent: true,
        },
      }

      setSelectedConversation({
        ...selectedConversation,
        messages: [...selectedConversation.messages, newMessage],
      })

      setReplyText("")
      alert("Email inviata con successo")
    } catch (error) {
      console.error("Error sending reply:", error)
      alert(error instanceof Error ? error.message : "Errore durante l'invio dell'email")
    } finally {
      setIsSending(false)
    }
  }

  async function saveBookingData() {
    if (!selectedConversation) return

    setIsSavingBooking(true)
    try {
      const response = await fetch(`/api/inbox/${selectedConversation.id}/update-booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_data: bookingData }),
      })

      if (!response.ok) throw new Error("Failed to save booking data")

      const result = await response.json()

      setSelectedConversation({ ...selectedConversation, booking_data: bookingData })
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConversation.id ? { ...c, booking_data: bookingData } : c)),
      )
    } catch (error) {
      console.error("Error saving booking data:", error)
    } finally {
      setIsSavingBooking(false)
    }
  }

  const getIntelligenceSummary = (conv: Conversation) => conv.metadata?.intelligence_summary

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="border-b shrink-0">
        <AdminHeader
          title="Email Inbox"
          subtitle="Gestisci le email"
          breadcrumbs={[{ label: "Inbox", href: "/admin/inbox" }, { label: "Email" }]}
        />
      </div>

      {/* Left Sidebar - Conversation List */}
      <div className="w-96 border-r flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <h1 className="font-semibold text-lg">Inbox Operativa</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={fetchConversations}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca conversazioni..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2 mt-3">
            <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
              <Inbox className="h-3 w-3 mr-1" />
              Tutte
            </Button>
            <Button
              variant={filter === "action_needed" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("action_needed")}
            >
              <Zap className="h-3 w-3 mr-1" />
              Da fare
            </Button>
            <Button
              variant={filter === "high_priority" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("high_priority")}
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Urgenti
            </Button>
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Mail className="h-12 w-12 mb-2 opacity-50" />
              <p className="text-sm">Nessuna conversazione</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const summary = getIntelligenceSummary(conv)
              const nextAction = summary?.next_action
              const priorityConfig = nextAction?.priority ? PRIORITY_CONFIG[nextAction.priority] : null

              return (
                <div
                  key={conv.id}
                  onClick={() => loadConversationDetail(conv.id)}
                  className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedConversation?.id === conv.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {priorityConfig && nextAction?.action !== "await_response" && nextAction?.action !== "none" && (
                      <div
                        className={`w-2 h-2 rounded-full mt-2 ${
                          nextAction.priority === "high"
                            ? "bg-red-500"
                            : nextAction.priority === "medium"
                              ? "bg-yellow-500"
                              : "bg-gray-400"
                        }`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate">
                          {conv.contact?.name || conv.contact?.email || "Sconosciuto"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(conv.last_message_at), {
                            addSuffix: true,
                            locale: it,
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mb-2">{conv.subject || "Nessun oggetto"}</p>

                      <div className="flex flex-wrap gap-1">
                        {summary?.primary_intent && (
                          <Badge variant="secondary" className="text-xs">
                            {INTENT_LABELS[summary.primary_intent.intent] || summary.primary_intent.intent}
                          </Badge>
                        )}
                        {nextAction && nextAction.action !== "await_response" && nextAction.action !== "none" && (
                          <Badge className={`text-xs ${priorityConfig?.color || ""}`}>
                            {ACTION_CONFIG[nextAction.action]?.label || nextAction.action}
                          </Badge>
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

      {/* Center - Thread View */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Thread Header with Intelligence */}
            <div className="p-4 border-b">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedConversation(null)}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                  <h2 className="font-semibold text-lg">{selectedConversation.subject || "Nessun oggetto"}</h2>
                  <p className="text-sm text-muted-foreground">{selectedConversation.contact?.email}</p>
                </div>

                {(() => {
                  const summary = getIntelligenceSummary(selectedConversation)
                  const nextAction = summary?.next_action
                  if (nextAction && nextAction.action !== "await_response" && nextAction.action !== "none") {
                    const config = ACTION_CONFIG[nextAction.action]
                    return (
                      <Button
                        variant={config.variant}
                        onClick={() => executeAction(nextAction.action, selectedConversation)}
                        className="gap-2"
                      >
                        {config.icon}
                        {config.label}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )
                  }
                  return null
                })()}

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => processIntelligence(selectedConversation)}
                  disabled={isProcessingIntelligence}
                >
                  <Brain className={`h-4 w-4 ${isProcessingIntelligence ? "animate-pulse" : ""}`} />
                </Button>
              </div>

              {(() => {
                const summary = getIntelligenceSummary(selectedConversation)
                if (!summary) return null

                return (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-muted-foreground">Intento:</span>{" "}
                          <span className="font-medium">
                            {INTENT_LABELS[summary.primary_intent.intent] || summary.primary_intent.intent}
                          </span>
                          <span className="text-muted-foreground ml-1">
                            ({Math.round(summary.primary_intent.confidence * 100)}%)
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Stato:</span>{" "}
                          <span className="font-medium">
                            {STATE_LABELS[summary.conversation_state.current] || summary.conversation_state.current}
                          </span>
                        </div>
                        {summary.dates_status.state !== "missing" && (
                          <div>
                            <span className="text-muted-foreground">Date:</span>{" "}
                            <span className="font-medium">
                              {summary.dates_status.check_in &&
                                format(new Date(summary.dates_status.check_in), "dd/MM")}
                              {summary.dates_status.check_out &&
                                ` - ${format(new Date(summary.dates_status.check_out), "dd/MM")}`}
                            </span>
                          </div>
                        )}
                        {summary.guests_status.adults && (
                          <div>
                            <span className="text-muted-foreground">Ospiti:</span>{" "}
                            <span className="font-medium">
                              {summary.guests_status.adults} ad.
                              {summary.guests_status.children ? ` + ${summary.guests_status.children} bimb.` : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {summary.next_action.reason && (
                      <p className="text-xs text-muted-foreground mt-2">
                        <Zap className="h-3 w-3 inline mr-1" />
                        {summary.next_action.reason}
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender_type === "agent" || message.sender_type === "staff" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-4 ${
                      message.sender_type === "agent" || message.sender_type === "staff"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">
                        {message.sender_type === "agent" || message.sender_type === "staff"
                          ? "Tu"
                          : message.sender_type === "system"
                            ? "Sistema"
                            : selectedConversation.contact?.name || "Cliente"}
                      </span>
                      <span className="text-xs opacity-70">
                        {format(new Date(message.created_at), "dd/MM HH:mm", { locale: it })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Box */}
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Scrivi una risposta..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
              <div className="flex justify-end mt-2">
                <Button onClick={sendReply} disabled={isSending || !replyText.trim()}>
                  {isSending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Invia risposta
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Brain className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Seleziona una conversazione</p>
            <p className="text-sm">L'AI ti suggerirà l'azione migliore</p>
          </div>
        )}
      </div>

      {/* Right Sidebar - Booking Data (simplified) */}
      {selectedConversation && (
        <div className="w-72 border-l overflow-y-auto">
          <div className="p-4">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Hotel className="h-5 w-5" />
              Dettagli
            </h3>

            {/* Contact Info */}
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Contatto</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{selectedConversation.contact?.name || "—"}</p>
                <p className="text-muted-foreground">{selectedConversation.contact?.email}</p>
                {selectedConversation.contact?.phone && (
                  <p className="text-muted-foreground">{selectedConversation.contact.phone}</p>
                )}
              </CardContent>
            </Card>

            <Separator className="my-4" />

            {/* Simplified Booking Fields */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4" />
                  Date
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Check-in</Label>
                    <Input
                      type="date"
                      value={bookingData.check_in || ""}
                      onChange={(e) => setBookingData({ ...bookingData, check_in: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Check-out</Label>
                    <Input
                      type="date"
                      value={bookingData.check_out || ""}
                      onChange={(e) => setBookingData({ ...bookingData, check_out: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Ospiti
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Adulti</Label>
                    <Input
                      type="number"
                      min="1"
                      value={bookingData.guests_adults || ""}
                      onChange={(e) =>
                        setBookingData({ ...bookingData, guests_adults: Number.parseInt(e.target.value) || undefined })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Bambini</Label>
                    <Input
                      type="number"
                      min="0"
                      value={bookingData.guests_children || ""}
                      onChange={(e) =>
                        setBookingData({
                          ...bookingData,
                          guests_children: Number.parseInt(e.target.value) || undefined,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Euro className="h-4 w-4" />
                  Preventivo
                </Label>
                <Input
                  type="number"
                  placeholder="€"
                  value={bookingData.quote_amount || ""}
                  onChange={(e) =>
                    setBookingData({ ...bookingData, quote_amount: Number.parseFloat(e.target.value) || undefined })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Esito</Label>
                <Select
                  value={bookingData.outcome || "pending"}
                  onValueChange={(value) =>
                    setBookingData({ ...bookingData, outcome: value as BookingData["outcome"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTCOMES.map((outcome) => (
                      <SelectItem key={outcome.value} value={outcome.value}>
                        {outcome.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" onClick={saveBookingData} disabled={isSavingBooking}>
                {isSavingBooking ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Salva
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
