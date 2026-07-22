"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  MessageSquare,
  Search,
  ArrowUpRight,
  Building2,
  User,
  Trash2,
  Eye,
  X,
  Bot,
  Settings,
  Send,
  BookOpen,
  Plus,
  Pencil,
  Save,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"

type ChatTier = "free" | "standard" | "advanced"

interface ChatSession {
  id: string
  title: string
  tier: ChatTier
  status: string
  created_at: string
  updated_at: string
  hotel_id: string
  hotel_name: string
  user_id: string
  user_name: string
  forwarded_at: string | null
  forwarded_to: string | null
}

interface ChatMessage {
  id: string
  role: string
  content: string
  created_at: string
  metadata?: Record<string, unknown>
}

interface Hotel {
  id: string
  name: string
}

interface TierConfig {
  hotel_id: string
  tier: ChatTier
  hotels?: { name: string }
}

interface KnowledgeEntry {
  id: string
  category: string
  title: string
  content: string
  version: number
  is_active: boolean
  created_at: string
  updated_at: string
}

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  standard: { label: "Standard", color: "bg-blue-50 text-blue-700 border-blue-200" },
  advanced: { label: "Advanced", color: "bg-amber-50 text-amber-700 border-amber-200" },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Attiva", color: "bg-green-50 text-green-700 border-green-200" },
  closed: { label: "Chiusa", color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  forwarded: { label: "Inoltrata", color: "bg-amber-50 text-amber-700 border-amber-200" },
}

export function ChatManagement() {
  const [activeTab, setActiveTab] = useState("chats")

  // ===== CHAT STATE =====
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [filteredSessions, setFilteredSessions] = useState<ChatSession[]>([])
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null)
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [filterTier, setFilterTier] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState("")
  const [sendingReply, setSendingReply] = useState(false)

  // ===== TIER STATE =====
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [tierConfigs, setTierConfigs] = useState<TierConfig[]>([])

  // ===== KNOWLEDGE STATE =====
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([])
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null)
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [newEntry, setNewEntry] = useState({ category: "", title: "", content: "" })
  const [savingEntry, setSavingEntry] = useState(false)

  // ===== FETCH FUNCTIONS =====
  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/ai-chat/sessions?all=true", { credentials: "include" })
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  const fetchTierConfigs = useCallback(async () => {
    try {
      const [configsRes, hotelsRes] = await Promise.all([
        fetch("/api/ai-chat/tier-config", { credentials: "include" }),
        fetch("/api/superadmin/hotels", { credentials: "include" }),
      ])
      const configsData = await configsRes.json()
      const hotelsData = await hotelsRes.json()
      setTierConfigs(configsData.configs || [])
      setHotels(hotelsData.hotels || [])
    } catch { /* ignore */ }
  }, [])

  const fetchKnowledge = useCallback(async () => {
    setKnowledgeLoading(true)
    try {
      const res = await fetch("/api/ai-chat/knowledge", { credentials: "include" })
      const data = await res.json()
      setKnowledgeEntries(data.entries || [])
    } catch { /* ignore */ } finally {
      setKnowledgeLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    fetchTierConfigs()
    fetchKnowledge()
  }, [fetchSessions, fetchTierConfigs, fetchKnowledge])

  // Apply filters
  useEffect(() => {
    let filtered = [...sessions]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.hotel_name.toLowerCase().includes(q) ||
          s.user_name.toLowerCase().includes(q)
      )
    }
    if (filterTier !== "all") filtered = filtered.filter((s) => s.tier === filterTier)
    if (filterStatus !== "all") filtered = filtered.filter((s) => s.status === filterStatus)
    setFilteredSessions(filtered)
  }, [sessions, searchQuery, filterTier, filterStatus])

  // ===== CHAT HANDLERS =====
  const handleViewSession = async (session: ChatSession) => {
    setSelectedSession(session)
    setReplyText("")
    try {
      const res = await fetch(`/api/ai-chat/sessions/${session.id}`, { credentials: "include" })
      const data = await res.json()
      setSessionMessages(data.messages || [])
    } catch {
      setSessionMessages([])
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
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null)
        setSessionMessages([])
      }
    } catch { /* ignore */ }
  }

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedSession || sendingReply) return
    setSendingReply(true)
    try {
      const res = await fetch(`/api/ai-chat/sessions/${selectedSession.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "reply", content: replyText.trim() }),
      })
      if (res.ok) {
        setReplyText("")
        // Refresh messages
        const msgRes = await fetch(`/api/ai-chat/sessions/${selectedSession.id}`, { credentials: "include" })
        const msgData = await msgRes.json()
        setSessionMessages(msgData.messages || [])
      }
    } catch { /* ignore */ } finally {
      setSendingReply(false)
    }
  }

  // ===== TIER HANDLERS =====
  const handleSetTier = async (hotelId: string, tier: ChatTier) => {
    try {
      const res = await fetch("/api/ai-chat/tier-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hotelId, tier }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error("Failed to set tier:", err)
      }
      fetchTierConfigs()
    } catch (err) {
      console.error("Error setting tier:", err)
    }
  }

  const getHotelTier = (hotelId: string): ChatTier => {
    const config = tierConfigs.find((c: any) => c.hotel_id === hotelId)
    return (config as any)?.effective_tier || config?.tier || "free"
  }

  // ===== KNOWLEDGE HANDLERS =====
  const handleSaveKnowledge = async (entry: KnowledgeEntry) => {
    setSavingEntry(true)
    try {
      await fetch("/api/ai-chat/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: entry.id,
          category: entry.category,
          title: entry.title,
          content: entry.content,
          is_active: entry.is_active,
        }),
      })
      setEditingEntry(null)
      fetchKnowledge()
    } catch { /* ignore */ } finally {
      setSavingEntry(false)
    }
  }

  const handleCreateKnowledge = async () => {
    if (!newEntry.category || !newEntry.title || !newEntry.content) return
    setSavingEntry(true)
    try {
      await fetch("/api/ai-chat/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newEntry),
      })
      setShowNewEntry(false)
      setNewEntry({ category: "", title: "", content: "" })
      fetchKnowledge()
    } catch { /* ignore */ } finally {
      setSavingEntry(false)
    }
  }

  const handleDeleteKnowledge = async (id: string) => {
    try {
      await fetch("/api/ai-chat/knowledge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      })
      fetchKnowledge()
    } catch { /* ignore */ }
  }

  const handleToggleKnowledge = async (entry: KnowledgeEntry) => {
    try {
      await fetch("/api/ai-chat/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: entry.id, is_active: !entry.is_active }),
      })
      fetchKnowledge()
    } catch { /* ignore */ }
  }

  // Unique categories for knowledge
  const categories = [...new Set(knowledgeEntries.map((e) => e.category))].sort()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Gestione Chat IA</h2>
        <p className="text-sm text-muted-foreground">
          Conversazioni, livelli di abbonamento e Knowledge Base
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="chats">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Conversazioni
          </TabsTrigger>
          <TabsTrigger value="tiers">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Livelli
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Knowledge Base
          </TabsTrigger>
        </TabsList>

        {/* ========== TAB CONVERSAZIONI ========== */}
        <TabsContent value="chats">
          <div className="flex gap-4 h-[600px]">
            {/* Sessions list */}
            <Card className="w-[380px] flex flex-col flex-shrink-0">
              <CardHeader className="py-3 px-4 flex-shrink-0">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Cerca per titolo, struttura, utente..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select value={filterTier} onValueChange={setFilterTier}>
                      <SelectTrigger className="h-7 text-[10px]">
                        <SelectValue placeholder="Livello" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti i livelli</SelectItem>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-7 text-[10px]">
                        <SelectValue placeholder="Stato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti gli stati</SelectItem>
                        <SelectItem value="active">Attive</SelectItem>
                        <SelectItem value="forwarded">Inoltrate</SelectItem>
                        <SelectItem value="closed">Chiuse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-2 space-y-1">
                    {loading && <p className="text-sm text-muted-foreground text-center py-8">Caricamento...</p>}
                    {!loading && filteredSessions.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">Nessuna conversazione</p>
                    )}
                    {filteredSessions.map((session) => {
                      const tierCfg = TIER_LABELS[session.tier] || TIER_LABELS.free
                      const statusCfg = STATUS_LABELS[session.status] || STATUS_LABELS.active
                      const isSelected = selectedSession?.id === session.id

                      return (
                        <div
                          key={session.id}
                          className={`p-2.5 rounded-lg cursor-pointer group transition-colors ${isSelected ? "bg-muted" : "hover:bg-muted/50"}`}
                          onClick={() => handleViewSession(session)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleViewSession(session) }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{session.title}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <Building2 className="h-2.5 w-2.5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground truncate">{session.hotel_name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <User className="h-2.5 w-2.5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground truncate">{session.user_name}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <Badge variant="outline" className={`text-[9px] px-1 py-0 ${tierCfg.color}`}>{tierCfg.label}</Badge>
                              <Badge variant="outline" className={`text-[9px] px-1 py-0 ${statusCfg.color}`}>{statusCfg.label}</Badge>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(session.updated_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 opacity-0 group-hover:opacity-100 bg-transparent"
                              onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id) }}
                            >
                              <Trash2 className="h-2.5 w-2.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Message detail + reply */}
            <Card className="flex-1 flex flex-col">
              {selectedSession ? (
                <>
                  <CardHeader className="py-3 px-4 border-b flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{selectedSession.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {selectedSession.hotel_name} - {selectedSession.user_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedSession.status === "forwarded" && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-600">
                            <ArrowUpRight className="h-3 w-3" />
                            Inoltrata
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 bg-transparent"
                          onClick={() => { setSelectedSession(null); setSessionMessages([]); setReplyText("") }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1">
                      <div className="p-4 space-y-3">
                        {sessionMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.role === "user" ? "justify-end" : msg.role === "system" ? "justify-center" : "justify-start"}`}
                          >
                            {msg.role === "system" ? (
                              <div className="bg-muted text-muted-foreground rounded-lg px-3 py-1.5 text-[11px] italic">
                                {msg.content}
                              </div>
                            ) : (
                              <div
                                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                                  msg.role === "user"
                                    ? "bg-foreground text-background rounded-br-md"
                                    : msg.metadata?.from_superadmin
                                      ? "bg-blue-50 border border-blue-200 rounded-bl-md"
                                      : "bg-muted rounded-bl-md"
                                }`}
                              >
                                {msg.metadata?.from_superadmin && (
                                  <p className="text-[9px] font-medium text-blue-600 mb-0.5">Risposta SuperAdmin</p>
                                )}
                                <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
                                <p className={`text-[9px] mt-1 ${msg.role === "user" ? "text-background/60" : "text-muted-foreground"}`}>
                                  {new Date(msg.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    {/* Reply input for superadmin */}
                    <div className="border-t p-3 flex-shrink-0">
                      <p className="text-[10px] text-muted-foreground mb-1.5">Rispondi come SuperAdmin (visibile all'utente nella chat)</p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Scrivi un messaggio all'utente..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply() } }}
                          disabled={sendingReply}
                          className="text-sm"
                        />
                        <Button
                          size="icon"
                          onClick={handleSendReply}
                          disabled={!replyText.trim() || sendingReply}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center">
                  <div>
                    <Eye className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground mt-2">Seleziona una conversazione per visualizzarla e rispondere</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ========== TAB LIVELLI ========== */}
        <TabsContent value="tiers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Livelli Chat IA per Struttura</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {hotels.map((hotel) => (
                  <div key={hotel.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{hotel.name}</span>
                  {(() => {
                    const cfg = tierConfigs.find((c: any) => c.hotel_id === hotel.id) as any
                    if (cfg?.source === "subscription") return <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">da subscription</span>
                    return null
                  })()}
                </div>
                    <Select value={getHotelTier(hotel.id)} onValueChange={(value) => handleSetTier(hotel.id, value as ChatTier)}>
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {hotels.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nessuna struttura trovata</p>
                )}
              </div>

              <div className="mt-6 p-4 bg-muted/50 rounded-lg space-y-3">
                <p className="text-xs font-semibold">Come l'IA recupera i dati per ogni livello:</p>
                <div className="space-y-2">
                  <div className="p-3 bg-background rounded border">
                    <p className="text-xs font-medium">Free</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      L'IA ha accesso solo alla Knowledge Base della piattaforma (come funziona Santaddeo, spiegazione KPI, concetti di Revenue Management). Non legge nessun dato specifico della struttura.
                    </p>
                  </div>
                  <div className="p-3 bg-background rounded border">
                    <p className="text-xs font-medium">Standard</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Oltre alla Knowledge Base, l'IA carica nel contesto: dati struttura (nome, camere, citta, categoria), <strong>KPI aggregati ultimi 30 giorni</strong> (occupazione media, ADR, RevPAR, RevPOR calcolati dal <code>kpi-calculation-service</code>), prenotazioni e cancellazioni con analisi canali, soglie KPI configurate, e <strong>trend metriche storiche</strong> da <code>metrics_history</code>. Tutti i dati sono recuperati in modo <strong>PMS-agnostico</strong>: il sistema identifica il connettore attivo (<code>hotel_pms_connections</code>) e usa il servizio KPI che funziona con qualsiasi PMS.
                    </p>
                  </div>
                  <div className="p-3 bg-background rounded border">
                    <p className="text-xs font-medium">Advanced</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Tutto come Standard, con in piu la possibilita di inoltrare la conversazione a un esperto di Revenue Management via email. L'IA suggerisce autonomamente l'inoltro quando la richiesta va oltre le sue capacita di analisi.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== TAB KNOWLEDGE BASE ========== */}
        <TabsContent value="knowledge">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Knowledge Base Piattaforma</CardTitle>
              <Button size="sm" className="gap-1.5" onClick={() => setShowNewEntry(true)}>
                <Plus className="h-3.5 w-3.5" />
                Nuova voce
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Queste voci vengono caricate automaticamente nel contesto dell'IA ad ogni conversazione. Aggiorna questa knowledge base ogni volta che vengono aggiunte nuove funzionalita alla piattaforma.
              </p>

              {knowledgeLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Caricamento...</p>
              ) : (
                <div className="space-y-4">
                  {categories.map((category) => (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{category}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {knowledgeEntries.filter((e) => e.category === category).length} voci
                        </span>
                      </div>
                      <div className="space-y-2">
                        {knowledgeEntries
                          .filter((e) => e.category === category)
                          .map((entry) => (
                            <div
                              key={entry.id}
                              className={`p-3 border rounded-lg transition-opacity ${!entry.is_active ? "opacity-50" : ""}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-medium">{entry.title}</p>
                                    {!entry.is_active && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 bg-red-50 text-red-600 border-red-200">Disattivata</Badge>
                                    )}
                                    <span className="text-[9px] text-muted-foreground">v{entry.version}</span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{entry.content}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 bg-transparent"
                                    onClick={() => handleToggleKnowledge(entry)}
                                    title={entry.is_active ? "Disattiva" : "Attiva"}
                                  >
                                    {entry.is_active ? (
                                      <ToggleRight className="h-3.5 w-3.5 text-green-600" />
                                    ) : (
                                      <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 bg-transparent"
                                    onClick={() => setEditingEntry({ ...entry })}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 bg-transparent"
                                    onClick={() => handleDeleteKnowledge(entry.id)}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                  {knowledgeEntries.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">Nessuna voce nella Knowledge Base</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== DIALOG: Edit Knowledge Entry ===== */}
      <Dialog open={editingEntry !== null} onOpenChange={(open) => { if (!open) setEditingEntry(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Modifica voce Knowledge Base</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium" htmlFor="edit-category">Categoria</label>
                <Input
                  id="edit-category"
                  value={editingEntry.category}
                  onChange={(e) => setEditingEntry({ ...editingEntry, category: e.target.value })}
                  className="text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="edit-title">Titolo</label>
                <Input
                  id="edit-title"
                  value={editingEntry.title}
                  onChange={(e) => setEditingEntry({ ...editingEntry, title: e.target.value })}
                  className="text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="edit-content">Contenuto</label>
                <Textarea
                  id="edit-content"
                  value={editingEntry.content}
                  onChange={(e) => setEditingEntry({ ...editingEntry, content: e.target.value })}
                  className="text-sm mt-1 min-h-[150px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setEditingEntry(null)}>Annulla</Button>
            <Button onClick={() => editingEntry && handleSaveKnowledge(editingEntry)} disabled={savingEntry}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {savingEntry ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: New Knowledge Entry ===== */}
      <Dialog open={showNewEntry} onOpenChange={setShowNewEntry}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Nuova voce Knowledge Base</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium" htmlFor="new-category">Categoria</label>
              <Input
                id="new-category"
                placeholder="es. dashboard, metriche, prenotazioni..."
                value={newEntry.category}
                onChange={(e) => setNewEntry({ ...newEntry, category: e.target.value })}
                className="text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="new-title">Titolo</label>
              <Input
                id="new-title"
                placeholder="es. Nuova funzionalita XYZ"
                value={newEntry.title}
                onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                className="text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="new-content">Contenuto</label>
              <Textarea
                id="new-content"
                placeholder="Descrivi la funzionalita, come funziona, cosa fa..."
                value={newEntry.content}
                onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                className="text-sm mt-1 min-h-[150px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setShowNewEntry(false)}>Annulla</Button>
            <Button onClick={handleCreateKnowledge} disabled={savingEntry || !newEntry.category || !newEntry.title || !newEntry.content}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {savingEntry ? "Creazione..." : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
