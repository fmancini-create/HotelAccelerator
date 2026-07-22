"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Loader2,
  Lightbulb,
  Bug,
  ArrowUpCircle,
  Send,
  CheckCircle2,
  Clock,
  Eye,
  MessageSquare,
  XCircle,
  RefreshCw,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

interface Feedback {
  id: string
  user_id: string
  hotel_id: string | null
  type: "suggestion" | "problem"
  message: string
  status: "open" | "read" | "replied" | "closed"
  admin_reply: string | null
  admin_reply_at: string | null
  created_at: string
  updated_at: string
  user_email?: string
  user_name?: string
  hotel_name?: string
}

interface UpgradeRequest {
  id: string
  user_id: string
  hotel_id: string
  request_type: string
  message: string | null
  status: "pending" | "approved" | "rejected" | "completed"
  admin_notes: string | null
  resolved_at: string | null
  created_at: string
  user_email?: string
  user_name?: string
  hotel_name?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  open: { label: "Aperto", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Clock },
  read: { label: "Letto", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Eye },
  replied: { label: "Risposto", color: "bg-green-100 text-green-800 border-green-200", icon: MessageSquare },
  closed: { label: "Chiuso", color: "bg-zinc-100 text-zinc-800 border-zinc-200", icon: XCircle },
  pending: { label: "In Attesa", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  approved: { label: "Approvato", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  rejected: { label: "Rifiutato", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  completed: { label: "Completato", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
}

export function FeedbackManager() {
  const [activeTab, setActiveTab] = useState("feedback")
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([])
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([])
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true)
  const [isLoadingUpgrades, setIsLoadingUpgrades] = useState(true)
  const [replyDialogOpen, setReplyDialogOpen] = useState(false)
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)
  const [replyText, setReplyText] = useState("")
  const [isSendingReply, setIsSendingReply] = useState(false)
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false)
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeRequest | null>(null)
  const [upgradeNotes, setUpgradeNotes] = useState("")
  const [isUpdatingUpgrade, setIsUpdatingUpgrade] = useState(false)
  const [feedbackFilter, setFeedbackFilter] = useState("all")
  const [upgradeFilter, setUpgradeFilter] = useState("all")

  const fetchFeedback = useCallback(async () => {
    setIsLoadingFeedback(true)
    try {
      const res = await fetch("/api/user-feedback")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setFeedbackList(data.feedback || [])
    } catch {
      toast.error("Errore nel caricamento feedback")
    } finally {
      setIsLoadingFeedback(false)
    }
  }, [])

  const fetchUpgradeRequests = useCallback(async () => {
    setIsLoadingUpgrades(true)
    try {
      const res = await fetch("/api/upgrade-requests")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUpgradeRequests(data.requests || [])
    } catch {
      toast.error("Errore nel caricamento richieste upgrade")
    } finally {
      setIsLoadingUpgrades(false)
    }
  }, [])

  useEffect(() => {
    fetchFeedback()
    fetchUpgradeRequests()
  }, [fetchFeedback, fetchUpgradeRequests])

  const handleOpenReply = (fb: Feedback) => {
    setSelectedFeedback(fb)
    setReplyText(fb.admin_reply || "")
    setReplyDialogOpen(true)

    // Mark as read if open
    if (fb.status === "open") {
      fetch(`/api/user-feedback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: fb.id, status: "read" }),
      }).then(() => {
        setFeedbackList((prev) =>
          prev.map((f) => (f.id === fb.id ? { ...f, status: "read" } : f))
        )
      })
    }
  }

  const handleSendReply = async () => {
    if (!selectedFeedback || !replyText.trim()) return
    setIsSendingReply(true)
    try {
      const res = await fetch("/api/user-feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackId: selectedFeedback.id,
          status: "replied",
          adminReply: replyText.trim(),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Risposta inviata!")
      setReplyDialogOpen(false)
      fetchFeedback()
    } catch {
      toast.error("Errore nell'invio della risposta")
    } finally {
      setIsSendingReply(false)
    }
  }

  const handleCloseFeedback = async (id: string) => {
    try {
      const res = await fetch("/api/user-feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: id, status: "closed" }),
      })
      if (!res.ok) throw new Error()
      toast.success("Feedback chiuso")
      fetchFeedback()
    } catch {
      toast.error("Errore")
    }
  }

  const handleOpenUpgrade = (req: UpgradeRequest) => {
    setSelectedUpgrade(req)
    setUpgradeNotes(req.admin_notes || "")
    setUpgradeDialogOpen(true)
  }

  const handleUpdateUpgrade = async (newStatus: "approved" | "rejected" | "completed") => {
    if (!selectedUpgrade) return
    setIsUpdatingUpgrade(true)
    try {
      const res = await fetch("/api/upgrade-requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: selectedUpgrade.id,
          status: newStatus,
          adminNotes: upgradeNotes.trim(),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Richiesta ${newStatus === "approved" ? "approvata" : newStatus === "rejected" ? "rifiutata" : "completata"}!`)
      setUpgradeDialogOpen(false)
      fetchUpgradeRequests()
    } catch {
      toast.error("Errore nell'aggiornamento")
    } finally {
      setIsUpdatingUpgrade(false)
    }
  }

  const openFeedbackCount = feedbackList.filter((f) => f.status === "open").length
  const pendingUpgradeCount = upgradeRequests.filter((r) => r.status === "pending").length

  const filteredFeedback = feedbackFilter === "all"
    ? feedbackList
    : feedbackList.filter((f) => f.status === feedbackFilter)

  const filteredUpgrades = upgradeFilter === "all"
    ? upgradeRequests
    : upgradeRequests.filter((r) => r.status === upgradeFilter)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Feedback e Richieste Upgrade
        </CardTitle>
        <CardDescription>
          Gestisci i suggerimenti, le segnalazioni di problemi e le richieste di upgrade KPI degli utenti.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="feedback" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Feedback Utenti
              {openFeedbackCount > 0 && (
                <Badge className="bg-red-500 text-white text-[10px] px-1.5 ml-1">{openFeedbackCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="upgrades" className="gap-1.5">
              <ArrowUpCircle className="h-3.5 w-3.5" />
              Richieste Upgrade
              {pendingUpgradeCount > 0 && (
                <Badge className="bg-amber-500 text-white text-[10px] px-1.5 ml-1">{pendingUpgradeCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Feedback Tab */}
          <TabsContent value="feedback" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Filtra:</Label>
                {["all", "open", "read", "replied", "closed"].map((s) => (
                  <Button
                    key={s}
                    variant={feedbackFilter === s ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setFeedbackFilter(s)}
                  >
                    {s === "all" ? "Tutti" : STATUS_CONFIG[s]?.label || s}
                    {s !== "all" && (
                      <span className="ml-1 text-[10px]">
                        ({feedbackList.filter((f) => f.status === s).length})
                      </span>
                    )}
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={fetchFeedback}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Aggiorna
              </Button>
            </div>

            {isLoadingFeedback ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredFeedback.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Nessun feedback trovato
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFeedback.map((fb) => {
                  const StatusIcon = STATUS_CONFIG[fb.status]?.icon || Clock
                  return (
                    <div
                      key={fb.id}
                      className={`border rounded-lg p-4 space-y-2 ${
                        fb.status === "open" ? "border-blue-200 bg-blue-50/30" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {fb.type === "suggestion" ? (
                            <Lightbulb className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Bug className="h-4 w-4 text-red-500" />
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {fb.type === "suggestion" ? "Suggerimento" : "Problema"}
                          </Badge>
                          <Badge className={`text-[10px] ${STATUS_CONFIG[fb.status]?.color || ""}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {STATUS_CONFIG[fb.status]?.label || fb.status}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(fb.created_at).toLocaleDateString("it-IT", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      <p className="text-sm">{fb.message}</p>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span>Utente: <strong>{fb.user_email || fb.user_id}</strong></span>
                          {fb.hotel_name && <span>Struttura: <strong>{fb.hotel_name}</strong></span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {fb.status !== "closed" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleOpenReply(fb)}
                              >
                                <Send className="h-3 w-3 mr-1" />
                                {fb.admin_reply ? "Modifica Risposta" : "Rispondi"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => handleCloseFeedback(fb.id)}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Chiudi
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {fb.admin_reply && (
                        <div className="mt-2 rounded-md bg-emerald-50 border border-emerald-200 p-3">
                          <p className="text-xs font-medium text-emerald-800 mb-1">Risposta SuperAdmin:</p>
                          <p className="text-sm text-emerald-900">{fb.admin_reply}</p>
                          {fb.admin_reply_at && (
                            <p className="text-[10px] text-emerald-600 mt-1">
                              {new Date(fb.admin_reply_at).toLocaleDateString("it-IT", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* Upgrade Requests Tab */}
          <TabsContent value="upgrades" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Filtra:</Label>
                {["all", "pending", "approved", "rejected", "completed"].map((s) => (
                  <Button
                    key={s}
                    variant={upgradeFilter === s ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setUpgradeFilter(s)}
                  >
                    {s === "all" ? "Tutti" : STATUS_CONFIG[s]?.label || s}
                    {s !== "all" && (
                      <span className="ml-1 text-[10px]">
                        ({upgradeRequests.filter((r) => r.status === s).length})
                      </span>
                    )}
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={fetchUpgradeRequests}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Aggiorna
              </Button>
            </div>

            {isLoadingUpgrades ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUpgrades.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Nessuna richiesta di upgrade trovata
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUpgrades.map((req) => {
                  const StatusIcon = STATUS_CONFIG[req.status]?.icon || Clock
                  return (
                    <div
                      key={req.id}
                      className={`border rounded-lg p-4 space-y-2 ${
                        req.status === "pending" ? "border-amber-200 bg-amber-50/30" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <ArrowUpCircle className="h-4 w-4 text-amber-500" />
                          <Badge variant="outline" className="text-[10px]">
                            {req.request_type === "kpi_upgrade" ? "Upgrade KPI" :
                             req.request_type === "plan_upgrade" ? "Upgrade Piano" : "Richiesta Funzione"}
                          </Badge>
                          <Badge className={`text-[10px] ${STATUS_CONFIG[req.status]?.color || ""}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {STATUS_CONFIG[req.status]?.label || req.status}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(req.created_at).toLocaleDateString("it-IT", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {req.message && <p className="text-sm">{req.message}</p>}

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span>Utente: <strong>{req.user_email || req.user_id}</strong></span>
                          {req.hotel_name && <span>Struttura: <strong>{req.hotel_name}</strong></span>}
                        </div>
                        {req.status === "pending" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleOpenUpgrade(req)}
                          >
                            Gestisci
                          </Button>
                        )}
                      </div>

                      {req.admin_notes && (
                        <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 p-3">
                          <p className="text-xs font-medium text-slate-800 mb-1">Note SuperAdmin:</p>
                          <p className="text-sm text-slate-900">{req.admin_notes}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Rispondi al Feedback
            </DialogTitle>
            <DialogDescription>
              La risposta sara visibile all{"'"}utente nella sezione feedback.
            </DialogDescription>
          </DialogHeader>

          {selectedFeedback && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3">
                <div className="flex items-center gap-2 mb-2">
                  {selectedFeedback.type === "suggestion" ? (
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                  ) : (
                    <Bug className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-xs font-medium">
                    {selectedFeedback.type === "suggestion" ? "Suggerimento" : "Problema"} da {selectedFeedback.user_email || "utente"}
                  </span>
                </div>
                <p className="text-sm">{selectedFeedback.message}</p>
              </div>

              <div>
                <Label>La tua risposta</Label>
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Scrivi la tua risposta..."
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSendReply}
              disabled={isSendingReply || !replyText.trim()}
            >
              {isSendingReply ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Invia Risposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Request Dialog */}
      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-amber-500" />
              Gestisci Richiesta Upgrade
            </DialogTitle>
          </DialogHeader>

          {selectedUpgrade && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                <p><strong>Tipo:</strong> {selectedUpgrade.request_type === "kpi_upgrade" ? "Upgrade KPI" : "Upgrade Piano"}</p>
                <p><strong>Utente:</strong> {selectedUpgrade.user_email || selectedUpgrade.user_id}</p>
                <p><strong>Struttura:</strong> {selectedUpgrade.hotel_name || selectedUpgrade.hotel_id}</p>
                {selectedUpgrade.message && <p><strong>Messaggio:</strong> {selectedUpgrade.message}</p>}
              </div>

              <div>
                <Label>Note (opzionali)</Label>
                <Textarea
                  value={upgradeNotes}
                  onChange={(e) => setUpgradeNotes(e.target.value)}
                  placeholder="Aggiungi note..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleUpdateUpgrade("rejected")}
              disabled={isUpdatingUpgrade}
            >
              Rifiuta
            </Button>
            <Button
              onClick={() => handleUpdateUpgrade("approved")}
              disabled={isUpdatingUpgrade}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isUpdatingUpgrade ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Approva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
