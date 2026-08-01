"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  LayoutTemplate,
  MessageSquareText,
  Mic,
  Palette,
  Sparkles,
} from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const templates = [
  { id: "luxury", name: "Luxury Resort", description: "Elegante, fotografico e orientato alle esperienze." },
  { id: "boutique", name: "Boutique Hotel", description: "Editoriale, intimo e ricco di storytelling." },
  { id: "wellness", name: "Spa & Wellness", description: "Pensato per spa, relax, trattamenti e pacchetti." },
  { id: "family", name: "Family Hotel", description: "Chiaro, rassicurante e focalizzato sui servizi famiglia." },
  { id: "business", name: "Business Hotel", description: "Essenziale, rapido e orientato alla conversione." },
  { id: "agriturismo", name: "Agriturismo", description: "Caldo, naturale e legato al territorio." },
]

const steps = [
  { id: 1, label: "Template", icon: LayoutTemplate },
  { id: 2, label: "Personalizzazione", icon: Palette },
  { id: 3, label: "Pagine", icon: FileText },
]

export default function CMSStudioPage() {
  const [step, setStep] = useState(1)
  const [templateId, setTemplateId] = useState("luxury")
  const [stylePrompt, setStylePrompt] = useState("")
  const [siteName, setSiteName] = useState("")
  const [pagePrompt, setPagePrompt] = useState("")

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? templates[0],
    [templateId],
  )

  const canContinue = step === 1 ? Boolean(templateId) : step === 2 ? Boolean(stylePrompt.trim()) : true

  return (
    <div className="space-y-6">
      <AdminHeader
        title="CMS AI-first"
        subtitle="Crea il sito con un percorso guidato in tre passaggi"
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/cms">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Gestione pagine
            </Link>
          </Button>
        }
      />

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary">Prima versione</Badge>
                <Badge variant="outline">UI/mock</Badge>
              </div>
              <h2 className="text-xl font-semibold">Descrivi il sito. HotelAccelerator prepara la struttura.</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Questo studio introduce il nuovo flusso conversazionale senza rimuovere l’editor CMS esistente.
                Generazione AI, voce, salvataggio e pubblicazione saranno collegati in incrementi successivi.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled>
                <Mic className="mr-2 h-4 w-4" />
                Parla
              </Button>
              <Button variant="outline" disabled>
                <MessageSquareText className="mr-2 h-4 w-4" />
                Assistente AI
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {steps.map(({ id, label, icon: Icon }) => {
          const isActive = id === step
          const isCompleted = id < step
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                isActive ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    isCompleted ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Step {id}</p>
                  <p className="font-medium">{label}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>1. Scegli lo stile di partenza</CardTitle>
            <CardDescription>
              Il template definisce struttura e linguaggio visivo. Contenuti e identità restano del tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setTemplateId(template.id)}
                className={`rounded-xl border p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                  templateId === template.id ? "border-primary ring-2 ring-primary/15" : ""
                }`}
              >
                <div className="mb-6 aspect-[16/9] rounded-lg bg-gradient-to-br from-muted to-muted/40 p-4">
                  <div className="h-3 w-2/3 rounded bg-background/90" />
                  <div className="mt-3 h-16 rounded bg-background/70" />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="h-8 rounded bg-background/60" />
                    <div className="h-8 rounded bg-background/60" />
                    <div className="h-8 rounded bg-background/60" />
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{template.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                  </div>
                  {templateId === template.id && <Check className="h-5 w-5 text-primary" />}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Personalizza con parole semplici</CardTitle>
            <CardDescription>
              Descrivi risultato, atmosfera, colori, font, fotografie e priorità commerciali.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="site-name">Nome del sito o della struttura</Label>
              <Input
                id="site-name"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder="Es. Villa I Barronci Resort & Spa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="style-prompt">Come deve apparire il sito?</Label>
              <Textarea
                id="style-prompt"
                value={stylePrompt}
                onChange={(event) => setStylePrompt(event.target.value)}
                placeholder="Es. Rendilo elegante ma caldo, usa il verde degli ulivi, valorizza piscina e spa, immagini grandi e pulsanti di prenotazione sempre visibili."
                className="min-h-40"
              />
              <p className="text-xs text-muted-foreground">
                In questa prima versione il prompt viene conservato solo nello stato della pagina e non genera ancora modifiche reali.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <Card>
            <CardHeader>
              <CardTitle>3. Descrivi pagine, menu e contenuti</CardTitle>
              <CardDescription>
                Scrivi come parleresti a una persona. Il futuro orchestratore convertirà la richiesta in pagine e componenti strutturati.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={pagePrompt}
                onChange={(event) => setPagePrompt(event.target.value)}
                placeholder="Es. Crea Home, Camere, Spa, Ristorante, Esperienze e Contatti. Nella Home metti piscina, spa e prenotazione. Usa le foto della cartella Resort. Collega prezzi e disponibilità a Santaddeo."
                className="min-h-64"
              />
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <Sparkles className="mb-2 h-5 w-5" />
                Prossimo incremento: analisi del prompt, proposta della sitemap, conferma dell’utente, creazione bozze e audit SEO prima della pubblicazione.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Riepilogo progetto</CardTitle>
              <CardDescription>Nessuna modifica viene ancora pubblicata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Template</p>
                <p className="font-medium">{selectedTemplate.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Struttura</p>
                <p className="font-medium">{siteName || "Non indicata"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Personalizzazione</p>
                <p className="line-clamp-4">{stylePrompt || "Non descritta"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pagine richieste</p>
                <p className="line-clamp-6">{pagePrompt || "Da definire"}</p>
              </div>
              <Button className="w-full" disabled>
                Genera proposta del sito
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-5">
        <Button variant="outline" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Indietro
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((current) => Math.min(3, current + 1))} disabled={!canContinue}>
            Continua
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button disabled>
            <Sparkles className="mr-2 h-4 w-4" />
            Genera proposta
          </Button>
        )}
      </div>
    </div>
  )
}
