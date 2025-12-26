"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Calendar,
  Users,
  Sparkles,
  ImageIcon,
  Link2,
  Bold,
  Italic,
  List,
  AlignLeft,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface Segment {
  id: string
  name: string
  contact_count: number
}

export default function NewCampaignPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [segments] = useState<Segment[]>([
    { id: "1", name: "Tutti i contatti", contact_count: 0 },
    { id: "2", name: "VIP Guests", contact_count: 0 },
    { id: "3", name: "Returning Guests", contact_count: 0 },
  ])

  const [campaign, setCampaign] = useState({
    name: "",
    subject: "",
    preview_text: "",
    from_name: "Villa I Barronci",
    from_email: "",
    reply_to: "",
    segment_id: "",
    content_html: "",
    scheduled_at: "",
  })

  const handleSave = async (sendNow = false) => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...campaign,
          status: sendNow ? "sending" : "draft",
        }),
      })

      if (res.ok) {
        router.push("/admin/marketing")
      }
    } catch (error) {
      console.error("Error saving campaign:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/marketing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Nuova Campagna</h1>
          <p className="text-muted-foreground">Crea una nuova campagna email</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={loading}>
            Salva Bozza
          </Button>
          <Button onClick={() => handleSave(true)} disabled={loading}>
            <Send className="h-4 w-4 mr-2" />
            Invia Campagna
          </Button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
            `}
            >
              {s}
            </div>
            <span className={`text-sm ${step >= s ? "font-medium" : "text-muted-foreground"}`}>
              {s === 1 ? "Dettagli" : s === 2 ? "Contenuto" : "Destinatari"}
            </span>
            {s < 3 && <div className="w-16 h-0.5 bg-muted" />}
          </div>
        ))}
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Dettagli Campagna</CardTitle>
            <CardDescription>Imposta nome, oggetto e mittente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Nome Campagna *</Label>
                <Input
                  placeholder="es: Newsletter Gennaio 2025"
                  value={campaign.name}
                  onChange={(e) => setCampaign((c) => ({ ...c, name: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Solo per uso interno</p>
              </div>
              <div className="space-y-2">
                <Label>Oggetto Email *</Label>
                <Input
                  placeholder="es: Scopri le nostre offerte speciali"
                  value={campaign.subject}
                  onChange={(e) => setCampaign((c) => ({ ...c, subject: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Testo Anteprima</Label>
                <Input
                  placeholder="Testo che appare dopo l'oggetto nella inbox"
                  value={campaign.preview_text}
                  onChange={(e) => setCampaign((c) => ({ ...c, preview_text: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome Mittente</Label>
                <Input
                  placeholder="Villa I Barronci"
                  value={campaign.from_name}
                  onChange={(e) => setCampaign((c) => ({ ...c, from_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email Mittente</Label>
                <Input
                  type="email"
                  placeholder="info@villaibarronci.it"
                  value={campaign.from_email}
                  onChange={(e) => setCampaign((c) => ({ ...c, from_email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Reply-To</Label>
                <Input
                  type="email"
                  placeholder="booking@villaibarronci.it"
                  value={campaign.reply_to}
                  onChange={(e) => setCampaign((c) => ({ ...c, reply_to: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)}>
                Continua
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Content */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Contenuto Email</CardTitle>
            <CardDescription>Scrivi il contenuto della tua email</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="editor">
              <TabsList>
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="preview">Anteprima</TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="space-y-4">
                {/* Simple Toolbar */}
                <div className="flex items-center gap-1 p-2 border rounded-lg bg-muted/50">
                  <Button variant="ghost" size="sm">
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Italic className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button variant="ghost" size="sm">
                    <AlignLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <List className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button variant="ghost" size="sm">
                    <Link2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button variant="ghost" size="sm">
                    <Sparkles className="h-4 w-4 mr-1" /> AI Assist
                  </Button>
                </div>

                <Textarea
                  placeholder="Scrivi il contenuto della tua email..."
                  className="min-h-[400px] font-mono"
                  value={campaign.content_html}
                  onChange={(e) => setCampaign((c) => ({ ...c, content_html: e.target.value }))}
                />

                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-2">Variabili disponibili:</p>
                  <div className="flex flex-wrap gap-2">
                    {["{{name}}", "{{email}}", "{{company}}", "{{unsubscribe_link}}"].map((v) => (
                      <Badge key={v} variant="outline" className="cursor-pointer hover:bg-muted">
                        {v}
                      </Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="html">
                <Textarea
                  placeholder="<html>...</html>"
                  className="min-h-[400px] font-mono text-sm"
                  value={campaign.content_html}
                  onChange={(e) => setCampaign((c) => ({ ...c, content_html: e.target.value }))}
                />
              </TabsContent>

              <TabsContent value="preview">
                <div className="border rounded-lg p-4 min-h-[400px] bg-white">
                  {campaign.content_html ? (
                    <div dangerouslySetInnerHTML={{ __html: campaign.content_html }} />
                  ) : (
                    <p className="text-muted-foreground text-center py-16">
                      Scrivi del contenuto per vedere l&apos;anteprima
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Indietro
              </Button>
              <Button onClick={() => setStep(3)}>
                Continua
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Recipients */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Destinatari</CardTitle>
            <CardDescription>Scegli a chi inviare la campagna</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Segmento</Label>
              <Select value={campaign.segment_id} onValueChange={(v) => setCampaign((c) => ({ ...c, segment_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona un segmento" />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.contact_count} contatti)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {campaign.segment_id
                      ? `${segments.find((s) => s.id === campaign.segment_id)?.contact_count || 0} destinatari`
                      : "Nessun segmento selezionato"}
                  </p>
                  <p className="text-sm text-muted-foreground">Solo contatti con consenso marketing attivo</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Programmazione</Label>
              <div className="flex gap-4">
                <Button variant="outline" className="flex-1 bg-transparent">
                  <Send className="h-4 w-4 mr-2" />
                  Invia Subito
                </Button>
                <Button variant="outline" className="flex-1 bg-transparent">
                  <Calendar className="h-4 w-4 mr-2" />
                  Programma
                </Button>
              </div>
              <Input
                type="datetime-local"
                value={campaign.scheduled_at}
                onChange={(e) => setCampaign((c) => ({ ...c, scheduled_at: e.target.value }))}
                className="mt-2"
              />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Indietro
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleSave(false)} disabled={loading}>
                  Salva Bozza
                </Button>
                <Button onClick={() => handleSave(true)} disabled={loading}>
                  <Send className="h-4 w-4 mr-2" />
                  Invia Campagna
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
