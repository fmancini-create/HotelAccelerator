"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Film, Loader2, Play, RefreshCw, Sparkles } from "lucide-react"
import { toast } from "sonner"

type Job = {
  id: string
  title: string | null
  status: string
  aspect_ratio: string
  duration_seconds: number
  resolution: string
  output_url: string | null
  error_message: string | null
  created_at: string
  storyboard?: Array<{
    start_second: number
    end_second: number
    visual: string
    camera: string
    overlay_hint: string | null
  }>
}

const HOTEL_ACCELERATOR_EXAMPLE = `Crea uno spot cinematografico premium per Hotel Accelerator. Il protagonista e' un albergatore italiano: deve essere chiaro che gestisce personalmente il suo hotel e si impegna in mille modi per aumentare il numero di potenziali clienti intorno alla struttura. Visualizza la domanda che cresce come centinaia e poi migliaia di segnali/luci che convergono verso l'hotel; occupazione e prezzo medio salgono. Poi mostra, come attivazioni progressive e visivamente eleganti: Santaddeo per revenue management e pricing; ManuBot per manutenzioni; HotelProfitAI per controllo di gestione, entrate, uscite e marginalita'. Infine tutto converge in Hotel Accelerator e il sistema va metaforicamente "al turbo": hotel pieno, gestione sotto controllo, proprietario sereno. Stile luxury hospitality, tecnologia premium, ultra realistico, niente dashboard illeggibili e niente loghi inventati.`

function statusLabel(status: string) {
  switch (status) {
    case "planning":
      return "Regia AI"
    case "queued":
      return "In coda"
    case "running":
      return "Generazione"
    case "succeeded":
      return "Pronto"
    case "failed":
      return "Errore"
    case "cancelled":
      return "Annullato"
    default:
      return status
  }
}

export default function VideoStudioPage() {
  const [brief, setBrief] = useState(HOTEL_ACCELERATOR_EXAMPLE)
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9")
  const [durationSeconds, setDurationSeconds] = useState("30")
  const [generateAudio, setGenerateAudio] = useState(false)
  const [creating, setCreating] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Job | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const active = useMemo(() => jobs.some((j) => ["planning", "queued", "running"].includes(j.status)), [jobs])

  async function loadJobs() {
    const response = await fetch("/api/admin/marketing/video", { cache: "no-store" })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Impossibile caricare i video")
    setJobs(data.jobs || [])
  }

  async function refreshJob(id: string, quiet = false) {
    if (!quiet) setRefreshing(true)
    try {
      const response = await fetch(`/api/admin/marketing/video?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Impossibile aggiornare il video")
      const job = data.job as Job
      setSelected(job)
      setJobs((current) => {
        const exists = current.some((item) => item.id === job.id)
        return exists ? current.map((item) => (item.id === job.id ? { ...item, ...job } : item)) : [job, ...current]
      })
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : "Errore")
    } finally {
      if (!quiet) setRefreshing(false)
    }
  }

  useEffect(() => {
    loadJobs().catch((error) => toast.error(error instanceof Error ? error.message : "Errore"))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    refreshJob(selectedId, true)
  }, [selectedId])

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(async () => {
      const candidates = jobs.filter((j) => ["queued", "running"].includes(j.status)).slice(0, 3)
      for (const job of candidates) await refreshJob(job.id, true)
      await loadJobs().catch(() => undefined)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [active, jobs])

  async function createVideo() {
    if (brief.trim().length < 20) return toast.error("Descrivi il video con un po' piu' di dettaglio")
    setCreating(true)
    try {
      const response = await fetch("/api/admin/marketing/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          aspectRatio,
          durationSeconds: Number(durationSeconds),
          resolution: "720p",
          generateAudio,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Generazione non avviata")
      toast.success("Regia creata. Il video e' in generazione.")
      setSelectedId(data.id)
      await loadJobs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <h1 className="text-2xl font-bold">AI Video Studio</h1>
        </div>
        <p className="text-muted-foreground">
          Descrivi lo spot. HotelAccelerator prepara regia e storyboard e avvia Seedance automaticamente.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Nuovo video</CardTitle>
            <CardDescription>Non servono prompt tecnici: scrivi cosa vuoi comunicare.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="video-brief">Idea / brief</Label>
              <Textarea id="video-brief" value={brief} onChange={(e) => setBrief(e.target.value)} className="min-h-56" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Formato</Label>
                <Select value={aspectRatio} onValueChange={(value) => setAspectRatio(value as "16:9" | "9:16")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 - Spot / YouTube</SelectItem>
                    <SelectItem value="9:16">9:16 - Reel / Stories</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Durata</Label>
                <Select value={durationSeconds} onValueChange={setDurationSeconds}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 secondi</SelectItem>
                    <SelectItem value="20">20 secondi</SelectItem>
                    <SelectItem value="30">30 secondi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border p-4 text-sm">
              <p className="font-medium">Seedance 2.5 · 720p</p>
              <p className="mt-1 text-muted-foreground">
                E' la risoluzione massima attualmente supportata da Seedance 2.5 per generazioni fino a 30 secondi.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">Audio nativo</p>
                <p className="text-sm text-muted-foreground">Per gli spot con voice-over separato conviene lasciarlo spento.</p>
              </div>
              <Switch checked={generateAudio} onCheckedChange={setGenerateAudio} />
            </div>

            <Button onClick={createVideo} disabled={creating} size="lg" className="w-full sm:w-auto">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
              Genera video
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Produzioni recenti</CardTitle>
                <CardDescription>Lo stato si aggiorna automaticamente.</CardDescription>
              </div>
              <Button variant="outline" size="icon" onClick={() => loadJobs()} aria-label="Aggiorna produzioni">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nessun video ancora generato.</p>
            ) : jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setSelectedId(job.id)}
                className="w-full rounded-lg border p-3 text-left transition hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{job.title || "Nuovo video"}</p>
                    <p className="text-xs text-muted-foreground">{job.aspect_ratio} · {job.duration_seconds}s · {job.resolution}</p>
                  </div>
                  <Badge variant={job.status === "succeeded" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>
                    {statusLabel(job.status)}
                  </Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {selected && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{selected.title || "Produzione video"}</CardTitle>
                <CardDescription>{statusLabel(selected.status)}</CardDescription>
              </div>
              <Button variant="outline" onClick={() => refreshJob(selected.id)} disabled={refreshing}>
                {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Aggiorna
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {selected.error_message && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {selected.error_message}
              </div>
            )}
            {selected.output_url && (
              <div className="space-y-3">
                <video src={selected.output_url} controls playsInline className="max-h-[70vh] w-full rounded-xl bg-black" />
                <Button asChild>
                  <a href={selected.output_url} target="_blank" rel="noreferrer">
                    <Play className="mr-2 h-4 w-4" />Apri video
                  </a>
                </Button>
              </div>
            )}
            {selected.storyboard && selected.storyboard.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">Storyboard preparato dall'AI</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {selected.storyboard.map((scene, index) => (
                    <div key={`${scene.start_second}-${index}`} className="rounded-lg border p-4">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{scene.start_second}s - {scene.end_second}s</p>
                      <p className="text-sm">{scene.visual}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Camera: {scene.camera}</p>
                      {scene.overlay_hint && <p className="mt-2 text-xs"><strong>Overlay:</strong> {scene.overlay_hint}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
