"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Mail,
  Users,
  Upload,
  Plus,
  Trash2,
  Send,
  Eye,
  Sparkles,
  Calendar,
  Play,
  Pause,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Link2,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────

interface Contact {
  id: string
  name: string
  email: string
  company: string | null
  tags: string[]
  source: string
  is_subscribed: boolean
  created_at: string
}

interface CampaignEmail {
  id?: string
  send_order: number
  subject: string
  body_html: string
  body_json?: any
  status: string
  scheduled_at?: string
  sent_at?: string
  stats_sent?: number
}

interface Campaign {
  id: string
  name: string
  status: string
  target_type: string
  target_filter: any
  start_date: string | null
  frequency_days: number
  total_sends: number
  sends_completed: number
  created_at: string
  marketing_campaign_emails: CampaignEmail[]
}

// ─── Sub-tabs ─────────────────────────────────────────────────────────

export function MarketingManager() {
  const [activeTab, setActiveTab] = useState("compose")

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="compose" className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Componi
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Campagne
          </TabsTrigger>
          <TabsTrigger value="contacts" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Contatti
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose"><ComposeTab /></TabsContent>
        <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
        <TabsContent value="contacts"><ContactsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// COMPOSE TAB - Create & send single email or campaign
// ═══════════════════════════════════════════════════════════════════════

function ComposeTab() {
  const [subject, setSubject] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [ctaText, setCtaText] = useState("")
  const [ctaUrl, setCtaUrl] = useState("")
  const [topic, setTopic] = useState("")
  const [targetType, setTargetType] = useState("hotels")
  const [targetFilter, setTargetFilter] = useState<any>({})
  const [previewHtml, setPreviewHtml] = useState("")
  const [showPreview, setShowPreview] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<any>(null)

  // --- AI Generation ---
  async function generateContent(type: "text" | "subject") {
    if (!topic.trim()) return
    setGenerating(type)
    try {
      const res = await fetch("/api/superadmin/marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, topic, language: "italiano", tone: "professionale" }),
      })
      const data = await res.json()
      if (type === "text" && data.html) {
        setBodyHtml(data.html)
      } else if (type === "subject" && data.subjects) {
        setSubject(data.subjects[0] || "")
      }
    } catch (e) {
      console.error("AI generation error:", e)
    }
    setGenerating(null)
  }

  // --- Preview ---
  async function loadPreview() {
    try {
      const res = await fetch("/api/superadmin/marketing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body_html: bodyHtml, cta_text: ctaText, cta_url: ctaUrl }),
      })
      const data = await res.json()
      setPreviewHtml(data.html || "")
      setShowPreview(true)
    } catch {}
  }

  // --- Send ---
  async function handleSend() {
    if (!subject || !bodyHtml) return
    setSending(true)
    setSendResult(null)
    try {
      // First create as campaign, then send
      const fullHtml = await fetch("/api/superadmin/marketing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body_html: bodyHtml, cta_text: ctaText, cta_url: ctaUrl }),
      }).then(r => r.json()).then(d => d.html)

      const campRes = await fetch("/api/superadmin/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Invio rapido: ${subject}`,
          target_type: targetType,
          target_filter: targetFilter,
          emails: [{ subject, body_html: fullHtml }],
        }),
      })
      const camp = await campRes.json()

      const sendRes = await fetch("/api/superadmin/marketing/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: camp.id }),
      })
      setSendResult(await sendRes.json())
    } catch (e) {
      setSendResult({ error: String(e) })
    }
    setSending(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: Editor */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              Generatore AI
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Argomento / Descrizione</Label>
              <Textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Es: Invito a provare SANTADDEO per il revenue management del tuo hotel..."
                rows={2}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateContent("subject")}
                disabled={generating !== null || !topic.trim()}
              >
                {generating === "subject" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                Genera Oggetto
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateContent("text")}
                disabled={generating !== null || !topic.trim()}
              >
                {generating === "text" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
                Genera Testo
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Contenuto Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Oggetto</Label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Oggetto dell'email..."
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Corpo (HTML)</Label>
              <Textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                placeholder="<p>Gentile {{name}},</p><p>...</p>"
                rows={12}
                className="text-sm font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                {'Usa {{name}} per personalizzare con il nome del destinatario.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Link2 className="h-3 w-3" /> Testo Bottone (CTA)</Label>
                <Input
                  value={ctaText}
                  onChange={e => setCtaText(e.target.value)}
                  placeholder="Scopri di piu"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">URL Bottone</Label>
                <Input
                  value={ctaUrl}
                  onChange={e => setCtaUrl(e.target.value)}
                  placeholder="https://santaddeo.com/..."
                  className="text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: Target + Preview + Send */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Destinatari</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo destinatari</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotels">Hotel iscritti</SelectItem>
                  <SelectItem value="contacts">Contatti esterni (database)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetType === "hotels" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Filtra per stato abbonamento</Label>
                <Select
                  value={targetFilter.status || "all"}
                  onValueChange={v => setTargetFilter({ ...targetFilter, status: v === "all" ? undefined : v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    <SelectItem value="active">Abbonamento attivo</SelectItem>
                    <SelectItem value="trial">In prova</SelectItem>
                    <SelectItem value="expired">Scaduto</SelectItem>
                    <SelectItem value="cancelled">Cancellato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> Anteprima
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" onClick={loadPreview} disabled={!bodyHtml}>
              <Eye className="h-3.5 w-3.5 mr-1" />
              Mostra anteprima
            </Button>

            {showPreview && previewHtml && (
              <div className="mt-3 border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-1.5 flex items-center justify-between border-b">
                  <span className="text-[10px] text-muted-foreground font-mono">Preview</span>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setShowPreview(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-[500px] border-0"
                  title="Email preview"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <Button
              className="w-full"
              onClick={handleSend}
              disabled={sending || !subject || !bodyHtml}
            >
              {sending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Invio in corso...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Invia ora</>
              )}
            </Button>

            {sendResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm flex items-start gap-2 ${
                sendResult.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
              }`}>
                {sendResult.error ? (
                  <><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{sendResult.error}</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />Inviate {sendResult.sent} email su {sendResult.total} destinatari.</>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CAMPAIGNS TAB - Multi-send scheduled campaigns
// ═══════════════════════════════════════════════════════════════════════

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const loadCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/superadmin/marketing/campaigns")
      setCampaigns(await res.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {campaigns.length} campagne totali
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nuova campagna
        </Button>
      </div>

      {showCreate && (
        <CampaignCreator
          onClose={() => { setShowCreate(false); loadCampaigns() }}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Nessuna campagna creata. Crea la prima!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <CampaignCard key={c.id} campaign={c} onRefresh={loadCampaigns} />
          ))}
        </div>
      )}
    </div>
  )
}

function CampaignCard({ campaign: c, onRefresh }: { campaign: Campaign; onRefresh: () => void }) {
  const [sending, setSending] = useState(false)

  const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "Bozza", variant: "secondary" },
    scheduled: { label: "Programmata", variant: "outline" },
    active: { label: "Attiva", variant: "default" },
    paused: { label: "In pausa", variant: "secondary" },
    completed: { label: "Completata", variant: "outline" },
  }

  const badge = statusBadge[c.status] || statusBadge.draft

  async function sendNext() {
    setSending(true)
    try {
      await fetch("/api/superadmin/marketing/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: c.id }),
      })
      onRefresh()
    } catch {}
    setSending(false)
  }

  async function deleteCampaign() {
    if (!confirm("Eliminare questa campagna?")) return
    await fetch(`/api/superadmin/marketing/campaigns?id=${c.id}`, { method: "DELETE" })
    onRefresh()
  }

  const emails = c.marketing_campaign_emails || []

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold truncate">{c.name}</h3>
              <Badge variant={badge.variant} className="text-[9px] shrink-0">{badge.label}</Badge>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>Target: {c.target_type === "hotels" ? "Hotel" : "Contatti"}</span>
              <span>Invii: {c.sends_completed}/{c.total_sends}</span>
              {c.frequency_days > 0 && <span>Ogni {c.frequency_days}gg</span>}
              {c.start_date && <span>Dal {new Date(c.start_date).toLocaleDateString("it-IT")}</span>}
            </div>

            {emails.length > 0 && (
              <div className="mt-2 space-y-1">
                {emails.sort((a, b) => a.send_order - b.send_order).map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <Badge variant="outline" className="text-[9px] w-5 justify-center shrink-0">{e.send_order}</Badge>
                    <span className="truncate">{e.subject || "(senza oggetto)"}</span>
                    {e.status === "sent" && <Badge className="text-[8px] bg-green-600 shrink-0">Inviata</Badge>}
                    {e.status === "draft" && <Badge variant="secondary" className="text-[8px] shrink-0">Bozza</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {c.status !== "completed" && (
              <Button size="sm" variant="outline" onClick={sendNext} disabled={sending} className="h-7 text-xs">
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                Invia prossima
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={deleteCampaign} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CampaignCreator({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("")
  const [targetType, setTargetType] = useState("contacts")
  const [targetFilter, setTargetFilter] = useState<any>({})
  const [startDate, setStartDate] = useState("")
  const [frequencyDays, setFrequencyDays] = useState(7)
  const [emails, setEmails] = useState<{ subject: string; body_html: string }[]>([
    { subject: "", body_html: "" },
  ])
  const [saving, setSaving] = useState(false)
  const [genIdx, setGenIdx] = useState<number | null>(null)
  const [genTopic, setGenTopic] = useState("")

  function addEmail() {
    setEmails([...emails, { subject: "", body_html: "" }])
  }

  function removeEmail(idx: number) {
    setEmails(emails.filter((_, i) => i !== idx))
  }

  function updateEmail(idx: number, field: "subject" | "body_html", value: string) {
    const updated = [...emails]
    updated[idx] = { ...updated[idx], [field]: value }
    setEmails(updated)
  }

  async function generateForEmail(idx: number, type: "text" | "subject") {
    if (!genTopic.trim()) return
    setGenIdx(idx)
    try {
      const res = await fetch("/api/superadmin/marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, topic: genTopic, language: "italiano" }),
      })
      const data = await res.json()
      if (type === "text" && data.html) {
        // Wrap in template
        const previewRes = await fetch("/api/superadmin/marketing/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: emails[idx].subject, body_html: data.html }),
        })
        const previewData = await previewRes.json()
        updateEmail(idx, "body_html", previewData.html || data.html)
      } else if (type === "subject" && data.subjects) {
        updateEmail(idx, "subject", data.subjects[0] || "")
      }
    } catch {}
    setGenIdx(null)
  }

  async function handleSave() {
    if (!name || emails.length === 0) return
    setSaving(true)
    try {
      await fetch("/api/superadmin/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          target_type: targetType,
          target_filter: targetFilter,
          start_date: startDate || null,
          frequency_days: frequencyDays,
          emails,
        }),
      })
      onClose()
    } catch {}
    setSaving(false)
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Nuova Campagna DEM</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-6 w-6 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome campagna</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Es: Onboarding nuovi lead" className="text-sm h-8" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Destinatari</Label>
            <Select value={targetType} onValueChange={setTargetType}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hotels">Hotel iscritti</SelectItem>
                <SelectItem value="contacts">Contatti esterni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {targetType === "hotels" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Filtra abbonamento</Label>
              <Select value={targetFilter.status || "all"} onValueChange={v => setTargetFilter(v === "all" ? {} : { status: v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="active">Attivo</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="expired">Scaduto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Data inizio</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm h-8" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Frequenza (giorni tra invii)</Label>
            <Input type="number" value={frequencyDays} onChange={e => setFrequencyDays(Number(e.target.value))} min={1} className="text-sm h-8" />
          </div>
        </div>

        {/* AI topic for all emails */}
        <div className="space-y-1.5 p-3 rounded-lg bg-background border">
          <Label className="text-xs flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-blue-600" /> Argomento AI (per generazione testo)</Label>
          <Input value={genTopic} onChange={e => setGenTopic(e.target.value)} placeholder="Descrivi l'argomento della campagna..." className="text-sm h-8" />
        </div>

        {/* Email rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Email della campagna ({emails.length})</Label>
            <Button size="sm" variant="outline" onClick={addEmail} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Aggiungi DEM
            </Button>
          </div>

          {emails.map((em, idx) => (
            <div key={idx} className="p-3 rounded-lg border bg-background space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">DEM #{idx + 1}</span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                    onClick={() => generateForEmail(idx, "subject")}
                    disabled={genIdx !== null || !genTopic.trim()}
                  >
                    {genIdx === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-0.5" />}
                    AI Oggetto
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                    onClick={() => generateForEmail(idx, "text")}
                    disabled={genIdx !== null || !genTopic.trim()}
                  >
                    {genIdx === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3 mr-0.5" />}
                    AI Testo
                  </Button>
                  {emails.length > 1 && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => removeEmail(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <Input
                value={em.subject}
                onChange={e => updateEmail(idx, "subject", e.target.value)}
                placeholder="Oggetto email..."
                className="text-sm h-8"
              />
              <Textarea
                value={em.body_html}
                onChange={e => updateEmail(idx, "body_html", e.target.value)}
                placeholder="<p>Corpo HTML dell'email...</p>"
                rows={4}
                className="text-sm font-mono"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || !name || emails.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calendar className="h-4 w-4 mr-2" />}
            Salva campagna
          </Button>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CONTACTS TAB - External contacts database
// ═══════════════════════════════════════════════════════════════════════

function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [newContact, setNewContact] = useState({ name: "", email: "", company: "" })
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadContacts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      const res = await fetch(`/api/superadmin/marketing/contacts?${params}`)
      setContacts(await res.json())
    } catch {}
    setLoading(false)
  }, [search])

  useEffect(() => { loadContacts() }, [loadContacts])

  async function addContact() {
    if (!newContact.email) return
    await fetch("/api/superadmin/marketing/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newContact),
    })
    setNewContact({ name: "", email: "", company: "" })
    setShowAdd(false)
    loadContacts()
  }

  async function deleteContact(id: string) {
    await fetch(`/api/superadmin/marketing/contacts?id=${id}`, { method: "DELETE" })
    loadContacts()
  }

  async function handleFileImport(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const lines = text.split("\n").filter(l => l.trim())

      // CSV: name, email, company (or just email)
      const contacts = lines.slice(1).map(line => {
        const parts = line.split(/[,;\t]/).map(p => p.trim().replace(/^"|"$/g, ""))
        if (parts.length >= 2) {
          return { name: parts[0], email: parts[1], company: parts[2] || "" }
        }
        // Single column: email only
        if (parts[0]?.includes("@")) {
          return { name: parts[0].split("@")[0], email: parts[0], company: "" }
        }
        return null
      }).filter(Boolean)

      await fetch("/api/superadmin/marketing/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, source: "csv_import" }),
      })

      loadContacts()
    } catch (e) {
      console.error("Import error:", e)
    }
    setImporting(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca contatti..."
          className="max-w-xs h-8 text-sm"
        />
        <div className="flex items-center gap-2 ml-auto">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFileImport(f)
              e.target.value = ""
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            Importa CSV
          </Button>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
          </Button>
        </div>
      </div>

      {showAdd && (
        <Card className="border-blue-200">
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Nome</Label>
                <Input value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Azienda</Label>
                <Input value={newContact.company} onChange={e => setNewContact({ ...newContact, company: e.target.value })} className="h-8 text-sm" />
              </div>
              <Button size="sm" onClick={addContact} disabled={!newContact.email} className="h-8">
                Salva
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Nessun contatto trovato. Importa un CSV o aggiungi manualmente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium text-xs">Nome</th>
                    <th className="text-left p-3 font-medium text-xs">Email</th>
                    <th className="text-left p-3 font-medium text-xs">Azienda</th>
                    <th className="text-left p-3 font-medium text-xs">Fonte</th>
                    <th className="text-left p-3 font-medium text-xs">Data</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-3">{c.name}</td>
                      <td className="p-3 font-mono text-xs">{c.email}</td>
                      <td className="p-3 text-muted-foreground">{c.company || "-"}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[9px]">{c.source}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(c.created_at).toLocaleDateString("it-IT")}
                      </td>
                      <td className="p-3">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => deleteContact(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 text-[11px] text-muted-foreground border-t">
                {contacts.length} contatti
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="p-3 rounded-lg bg-muted/30 text-[11px] text-muted-foreground">
        <strong>Formato CSV:</strong> Nome, Email, Azienda (con intestazione). Separatore: virgola, punto e virgola o tab.
      </div>
    </div>
  )
}
