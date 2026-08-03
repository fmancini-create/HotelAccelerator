"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, FileText, LayoutTemplate, Loader2, Mic, MicOff, Palette, Save, Sparkles } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createBrowserSpeechRecognition, type SpeechRecognitionLike } from "@/lib/cms/browser-speech"
import type { StudioTemplate } from "./template-preview"
import { TemplateGallery } from "./template-gallery"

const steps = [
  { id: 1, label: "Template", icon: LayoutTemplate },
  { id: 2, label: "Personalizzazione", icon: Palette },
  { id: 3, label: "Pagine", icon: FileText },
]

type SaveState = "idle" | "saving" | "saved" | "error"
type GeneratedSummary = {
  pages: string[]
  warnings: string[]
  sections: string[]
  explanation?: {
    promise: string
    prioritizes: string
    tradeoff: string
    result: string
  }
}

export default function CMSStudioPage() {
  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState<StudioTemplate[]>([])
  const [templateId, setTemplateId] = useState("luxury-editorial")
  const [propertyProfile, setPropertyProfile] = useState("")
  const [stylePrompt, setStylePrompt] = useState("")
  const [siteName, setSiteName] = useState("")
  const [pagePrompt, setPagePrompt] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState("")
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [generatedSummary, setGeneratedSummary] = useState<GeneratedSummary | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechBaseRef = useRef("")

  const selectedTemplate = useMemo(() => templates.find((template) => template.id === templateId) ?? templates[0], [templates, templateId])

  useEffect(() => {
    const recognition = createBrowserSpeechRecognition()
    recognitionRef.current = recognition
    setSpeechSupported(Boolean(recognition))
    return () => recognition?.abort()
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [projectResponse, templatesResponse] = await Promise.all([
          fetch("/api/cms/ai-project", { cache: "no-store" }),
          fetch("/api/cms/builder-templates", { cache: "no-store" }),
        ])
        const [projectData, templatesData] = await Promise.all([projectResponse.json(), templatesResponse.json()])
        if (!projectResponse.ok) throw new Error(projectData.error || "Impossibile caricare il progetto")
        if (!templatesResponse.ok) throw new Error(templatesData.error || "Impossibile caricare i template")
        const loadedTemplates: StudioTemplate[] = templatesData.templates || []
        setTemplates(loadedTemplates)
        if (projectData.project) {
          const savedTemplateId = projectData.project.template_id
          setTemplateId(loadedTemplates.some((template) => template.id === savedTemplateId) ? savedTemplateId : loadedTemplates[0]?.id || "luxury-editorial")
          setSiteName(projectData.project.site_name || "")
          setPropertyProfile(projectData.project.property_profile || "")
          setStylePrompt(projectData.project.style_prompt || "")
          setPagePrompt(projectData.project.page_prompt || "")
          setStep(projectData.project.current_step || 1)
          setUpdatedAt(projectData.project.updated_at || null)
        } else if (loadedTemplates[0]) setTemplateId(loadedTemplates[0].id)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Errore di caricamento")
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  function stopSpeech() {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  function currentSpeechValue() {
    if (step === 1) return propertyProfile.trim()
    if (step === 2) return stylePrompt.trim()
    return pagePrompt.trim()
  }

  function applyTranscript(value: string) {
    if (step === 1) setPropertyProfile(value.slice(0, 5000))
    if (step === 2) setStylePrompt(value.slice(0, 5000))
    if (step === 3) setPagePrompt(value.slice(0, 10000))
  }

  function startSpeech() {
    setError(null)
    setLiveTranscript("")
    const recognition = recognitionRef.current
    if (!recognition) {
      setError("Il riconoscimento vocale non è supportato da questo browser. Usa Chrome o Edge aggiornato.")
      return
    }
    speechBaseRef.current = currentSpeechValue()
    recognition.onresult = (event) => {
      let transcript = ""
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0]?.transcript ?? ""
      const normalized = transcript.trim()
      setLiveTranscript(normalized)
      applyTranscript([speechBaseRef.current, normalized].filter(Boolean).join(" "))
      setSaveState("idle")
    }
    recognition.onerror = (event) => {
      setError(event.error === "not-allowed" ? "Accesso al microfono negato." : event.error === "no-speech" ? "Non ho rilevato la voce." : `Riconoscimento vocale non riuscito: ${event.error}`)
      setIsListening(false)
    }
    recognition.onend = () => setIsListening(false)
    try {
      recognition.start()
      setIsListening(true)
    } catch {
      setError("Il microfono è già in uso oppure non può essere avviato.")
    }
  }

  async function saveProject(nextStep = step, extra: Record<string, unknown> = {}) {
    setSaveState("saving")
    setError(null)
    try {
      const response = await fetch("/api/cms/ai-project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateId, site_name: siteName, property_profile: propertyProfile, style_prompt: stylePrompt, page_prompt: pagePrompt, current_step: nextStep, ...extra }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Salvataggio non riuscito")
      setUpdatedAt(data.project?.updated_at || null)
      setSaveState("saved")
      window.setTimeout(() => setSaveState("idle"), 2500)
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore di salvataggio")
      setSaveState("error")
      return false
    }
  }

  async function generateDocument() {
    const response = await fetch("/api/cms/builder-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, siteName, propertyProfile, stylePrompt, pagePrompt }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Template non disponibile")
    return data
  }

  async function applyTemplate() {
    if (!templateId) return
    setApplyingTemplate(true)
    setError(null)
    try {
      const data = await generateDocument()
      const pages = (data.document?.pages || []).map((page: { title?: string }) => page.title).filter(Boolean)
      const warnings = (data.document?.warnings || []).map((warning: { message?: string }) => warning.message).filter(Boolean)
      const sections = (data.personalization?.sectionPlan || []).map((section: { label?: string }) => section.label).filter(Boolean)
      const explanation = data.personalization?.explanation
      setGeneratedSummary({ pages, warnings, sections, explanation })

      const confirmation = [
        `Stai applicando: ${data.template?.name || templateId}.`,
        explanation?.result ? `Risultato: ${explanation.result}` : "",
        explanation?.prioritizes ? `Privilegia: ${explanation.prioritizes}` : "",
        explanation?.tradeoff ? `Da sapere: ${explanation.tradeoff}` : "",
        sections.length ? `Homepage: ${sections.join(", ")}.` : "",
        `Pagine create (${pages.length}): ${pages.join(", ")}.`,
        "La bozza visuale attuale verrà sostituita. Il sito pubblico non cambia.",
        "Procedere?",
      ].filter(Boolean).join("\n\n")

      if (!window.confirm(confirmation)) return
      const saved = await saveProject(step, { builder_document: data.document })
      if (saved) window.location.href = "/admin/cms/studio/builder"
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Impossibile applicare il template")
    } finally {
      setApplyingTemplate(false)
    }
  }

  async function goToStep(nextStep: number) {
    if (isListening) stopSpeech()
    const safeStep = Math.max(1, Math.min(3, nextStep))
    if (await saveProject(safeStep)) setStep(safeStep)
  }

  const canContinue = step === 1 ? Boolean(templateId) : step === 2 ? Boolean(stylePrompt.trim()) : true

  if (isLoading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="space-y-6">
      <AdminHeader title="CMS AI-first" subtitle="Crea il sito con un percorso guidato in tre passaggi" actions={<Button variant="outline" asChild><Link href="/admin/cms"><ArrowLeft className="mr-2 h-4 w-4" />Gestione pagine</Link></Button>} />

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="mb-2 flex items-center gap-2"><Badge variant="secondary">Progetto persistente</Badge><Badge variant="outline">Codice</Badge></div><h2 className="text-xl font-semibold">Scegli, personalizza e costruisci il sito.</h2><p className="mt-1 text-sm text-muted-foreground">Profilo, stile e pagine guidano ora la generazione concreta del documento.</p></div><div className="flex flex-wrap gap-2"><Button variant={isListening ? "destructive" : "outline"} onClick={isListening ? stopSpeech : startSpeech}>{isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}{isListening ? "Ferma" : "Parla"}</Button><Button variant="outline" onClick={() => saveProject()} disabled={saveState === "saving"}>{saveState === "saving" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saveState === "saved" ? "Salvato" : "Salva bozza"}</Button></div></CardContent></Card>

      {isListening && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"><strong>Sto ascoltando…</strong> {liveTranscript}</div>}
      {!speechSupported && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">Per usare la voce prova Chrome o Edge aggiornato e consenti il microfono.</div>}
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {updatedAt && <p className="text-right text-xs text-muted-foreground">Ultimo salvataggio: {new Date(updatedAt).toLocaleString("it-IT")}</p>}

      <div className="grid gap-3 md:grid-cols-3">{steps.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => goToStep(id)} className={`rounded-lg border p-4 text-left transition-colors ${id === step ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}><div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-full ${id < step ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{id < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</div><div><p className="text-xs text-muted-foreground">Step {id}</p><p className="font-medium">{label}</p></div></div></button>)}</div>

      {step === 1 && <Card><CardHeader><CardTitle>1. Trova il layout giusto</CardTitle><CardDescription>Descrivi anche vocalmente la struttura: il profilo sarà usato sia per il consiglio sia per generare il sito.</CardDescription></CardHeader><CardContent className="space-y-6"><TemplateGallery templates={templates} selectedId={templateId} profile={propertyProfile} onProfileChange={(value) => { setPropertyProfile(value); setSaveState("idle") }} onSelect={(id) => { setTemplateId(id); setSaveState("idle") }} /><div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-xl border bg-background/95 p-4 shadow-xl backdrop-blur"><div><p className="text-xs text-muted-foreground">Template selezionato</p><p className="font-medium">{selectedTemplate?.name || "Nessuno"}</p>{propertyProfile && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">Profilo: {propertyProfile}</p>}</div><Button onClick={applyTemplate} disabled={!templateId || applyingTemplate}>{applyingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Genera e applica</Button></div>{generatedSummary && <div className="rounded-xl border bg-muted/20 p-5 text-sm"><p className="font-semibold">Cosa verrà creato</p>{generatedSummary.explanation && <div className="mt-3 grid gap-3 md:grid-cols-3"><div><p className="text-xs font-semibold">Privilegia</p><p className="mt-1 text-muted-foreground">{generatedSummary.explanation.prioritizes}</p></div><div><p className="text-xs font-semibold">Da sapere</p><p className="mt-1 text-muted-foreground">{generatedSummary.explanation.tradeoff}</p></div><div><p className="text-xs font-semibold">Risultato</p><p className="mt-1 text-muted-foreground">{generatedSummary.explanation.result}</p></div></div>}<p className="mt-4 text-muted-foreground"><strong className="text-foreground">Homepage:</strong> {generatedSummary.sections.join(", ")}</p><p className="mt-2 text-muted-foreground"><strong className="text-foreground">Pagine:</strong> {generatedSummary.pages.join(", ")}</p><p className="mt-3 text-xs text-muted-foreground">Questa operazione sostituisce la bozza visuale, non il sito pubblico.</p></div>}</CardContent></Card>}

      {step === 2 && <Card><CardHeader><CardTitle>2. Personalizza con parole semplici</CardTitle><CardDescription>Descrivi atmosfera, colori, fotografie e priorità commerciali.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="site-name">Nome della struttura</Label><Input id="site-name" value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder="Es. Villa I Barronci Resort & Spa" maxLength={160} /></div><div className="space-y-2"><Label htmlFor="style-prompt">Come deve apparire il sito?</Label><Textarea id="style-prompt" value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} placeholder="Es. Elegante ma caldo, verde degli ulivi, piscina e spa in evidenza." className="min-h-40" maxLength={5000} /></div></CardContent></Card>}

      {step === 3 && <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]"><Card><CardHeader><CardTitle>3. Descrivi pagine, menu e contenuti</CardTitle><CardDescription>Le richieste saranno interpretate insieme al profilo della struttura.</CardDescription></CardHeader><CardContent><Textarea value={pagePrompt} onChange={(event) => setPagePrompt(event.target.value)} placeholder="Es. Crea Home, Camere, Spa, Ristorante, Esperienze e Contatti..." className="min-h-64" maxLength={10000} /></CardContent></Card><Card><CardHeader><CardTitle>Riepilogo progetto</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div><p className="text-muted-foreground">Template</p><p className="font-medium">{selectedTemplate?.name || templateId}</p></div><div><p className="text-muted-foreground">Struttura</p><p className="font-medium">{siteName || "Non indicata"}</p></div><div><p className="text-muted-foreground">Profilo</p><p className="line-clamp-4 font-medium">{propertyProfile || "Non indicato"}</p></div><Button className="w-full" onClick={applyTemplate} disabled={applyingTemplate}>{applyingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Genera e apri editor</Button></CardContent></Card></div>}

      <div className="flex items-center justify-between border-t pt-5"><Button variant="outline" onClick={() => goToStep(step - 1)} disabled={step === 1 || saveState === "saving"}><ArrowLeft className="mr-2 h-4 w-4" />Indietro</Button>{step < 3 ? <Button onClick={() => goToStep(step + 1)} disabled={!canContinue || saveState === "saving"}>Continua<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button onClick={() => saveProject()} disabled={saveState === "saving"}><Save className="mr-2 h-4 w-4" />Salva progetto</Button>}</div>
    </div>
  )
}
