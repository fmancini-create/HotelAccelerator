"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import {
  Pin,
  Trash2,
  Upload,
  FileText,
  CheckCircle2,
  Circle,
  PlayCircle,
  XCircle,
  MessageSquare,
  Download,
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { SellerHotelDataPanel } from "@/components/revman/seller-hotel-data-panel"

type Note = {
  id: string
  hotel_id: string
  author_role: "tenant" | "staff"
  title: string | null
  body: string
  pinned: boolean
  created_at: string
  updated_at: string
}

type Activity = {
  id: string
  hotel_id: string
  title: string
  description: string | null
  status: "open" | "in_progress" | "done" | "cancelled"
  due_date: string | null
  assigned_to: "tenant" | "staff" | null
  created_at: string
  completed_at: string | null
}

type RevFile = {
  id: string
  hotel_id: string
  file_name: string
  mime_type: string | null
  size_bytes: number
  blob_url: string
  category: string
  description: string | null
  uploaded_by_role: "tenant" | "staff"
  created_at: string
}

type ChatSession = {
  id: string
  title: string | null
  created_at: string
  hotel_name?: string
}

const CATEGORIES = [
  { value: "general", label: "Generale" },
  { value: "relazione", label: "Relazione" },
  { value: "documento", label: "Documento" },
  { value: "report", label: "Report" },
  { value: "presentazione", label: "Presentazione" },
]

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function StatusIcon({ status }: { status: Activity["status"] }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  if (status === "in_progress") return <PlayCircle className="h-4 w-4 text-amber-600" />
  if (status === "cancelled") return <XCircle className="h-4 w-4 text-muted-foreground" />
  return <Circle className="h-4 w-4 text-muted-foreground" />
}

export function RevmanArea({
  hotelId,
  isStaff,
  readOnly = false,
  canViewMetrics = false,
  canViewFullDashboard = false,
}: {
  hotelId: string
  isStaff: boolean
  readOnly?: boolean
  /** Venditore: mostra la scheda Dati con KPI/analytics in sola lettura. */
  canViewMetrics?: boolean
  /** Venditore: la scheda Dati include anche i moduli avanzati (pace ecc.). */
  canViewFullDashboard?: boolean
}) {
  const [notes, setNotes] = useState<Note[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [files, setFiles] = useState<RevFile[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)

  // New note form
  const [noteTitle, setNoteTitle] = useState("")
  const [noteBody, setNoteBody] = useState("")
  const [notePinned, setNotePinned] = useState(false)
  const [savingNote, setSavingNote] = useState(false)

  // New activity form
  const [actTitle, setActTitle] = useState("")
  const [actDesc, setActDesc] = useState("")
  const [actDue, setActDue] = useState("")
  const [actAssigned, setActAssigned] = useState<"tenant" | "staff" | "">("")
  const [savingAct, setSavingAct] = useState(false)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadCategory, setUploadCategory] = useState("general")
  const [uploadDesc, setUploadDesc] = useState("")

  // Helper: leggi response come JSON in modo tollerante (body vuoto o non-JSON
  // su 500/HTML page non deve far esplodere l'UI con "Unexpected end of JSON
  // input"). Ritorna null se non parsabile.
  const safeJson = async (res: Response): Promise<any | null> => {
    try {
      const text = await res.text()
      if (!text) return null
      try { return JSON.parse(text) } catch { return { error: text.slice(0, 200) } }
    } catch {
      return null
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [notesRes, actRes, filesRes, chatRes] = await Promise.all([
        fetch(`/api/revman/notes?hotel_id=${hotelId}`),
        fetch(`/api/revman/activities?hotel_id=${hotelId}`),
        fetch(`/api/revman/files?hotel_id=${hotelId}`),
        fetch(`/api/ai-chat/sessions?hotelId=${hotelId}&limit=20`),
      ])
      if (notesRes.ok) setNotes(((await safeJson(notesRes)) || {}).notes || [])
      if (actRes.ok) setActivities(((await safeJson(actRes)) || {}).activities || [])
      if (filesRes.ok) setFiles(((await safeJson(filesRes)) || {}).files || [])
      if (chatRes.ok) {
        const j = (await safeJson(chatRes)) || {}
        setChatSessions(j.sessions || [])
      }
    } finally {
      setLoading(false)
    }
  }, [hotelId])

  useEffect(() => { void refresh() }, [refresh])

  async function createNote() {
    if (!noteBody.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch("/api/revman/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, title: noteTitle || null, body: noteBody, pinned: notePinned }),
      })
      if (!res.ok) throw new Error(((await safeJson(res)) || {}).error || `Errore ${res.status}`)
      setNoteTitle(""); setNoteBody(""); setNotePinned(false)
      toast.success("Nota salvata")
      await refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio")
    } finally {
      setSavingNote(false)
    }
  }

  async function togglePin(n: Note) {
    await fetch(`/api/revman/notes/${n.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !n.pinned }),
    })
    await refresh()
  }

  async function deleteNote(id: string) {
    if (!confirm("Eliminare questa nota?")) return
    await fetch(`/api/revman/notes/${id}`, { method: "DELETE" })
    await refresh()
  }

  async function createActivity() {
    if (!actTitle.trim()) return
    setSavingAct(true)
    try {
      const res = await fetch("/api/revman/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          title: actTitle,
          description: actDesc || null,
          due_date: actDue || null,
          assigned_to: actAssigned || null,
        }),
      })
      if (!res.ok) throw new Error(((await safeJson(res)) || {}).error || `Errore ${res.status}`)
      setActTitle(""); setActDesc(""); setActDue(""); setActAssigned("")
      toast.success("Attività creata")
      await refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore")
    } finally {
      setSavingAct(false)
    }
  }

  async function setActivityStatus(a: Activity, status: Activity["status"]) {
    await fetch(`/api/revman/activities/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    await refresh()
  }

  async function deleteActivity(id: string) {
    if (!confirm("Eliminare questa attività?")) return
    await fetch(`/api/revman/activities/${id}`, { method: "DELETE" })
    await refresh()
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set("hotel_id", hotelId)
      fd.set("file", f)
      fd.set("category", uploadCategory)
      if (uploadDesc) fd.set("description", uploadDesc)
      const res = await fetch("/api/revman/files", { method: "POST", body: fd })
      if (!res.ok) throw new Error(((await safeJson(res)) || {}).error || `Upload fallito (${res.status})`)
      toast.success("File caricato")
      setUploadDesc("")
      await refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore upload")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  async function deleteFile(id: string) {
    if (!confirm("Eliminare questo file?")) return
    await fetch(`/api/revman/files/${id}`, { method: "DELETE" })
    await refresh()
  }

  const fmt = (d: string) => format(new Date(d), "dd MMM yyyy HH:mm", { locale: it })

  return (
    <div className="space-y-6">
      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes">Conversazioni & Note</TabsTrigger>
          <TabsTrigger value="activities">Attività</TabsTrigger>
          <TabsTrigger value="files">File</TabsTrigger>
          <TabsTrigger value="chat">Chat Taddeo</TabsTrigger>
          {(canViewMetrics || canViewFullDashboard) && (
            <TabsTrigger value="dati">Dati</TabsTrigger>
          )}
        </TabsList>

        {/* NOTES */}
        <TabsContent value="notes" className="space-y-4">
          {!readOnly && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nuova nota</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Titolo (opzionale)" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
              <Textarea
                placeholder={isStaff
                  ? "Annotazioni interne, riepilogo call, decisioni prese, prossimi passi..."
                  : "Domande, richieste, feedback al revenue manager..."}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={4}
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={notePinned} onChange={(e) => setNotePinned(e.target.checked)} />
                  Fissa in alto
                </label>
                <Button onClick={createNote} disabled={!noteBody.trim() || savingNote}>
                  {savingNote ? "Salvataggio..." : "Salva nota"}
                </Button>
              </div>
            </CardContent>
          </Card>
          )}

          {loading && <div className="text-sm text-muted-foreground">Caricamento...</div>}
          {!loading && notes.length === 0 && (
            <div className="text-sm text-muted-foreground italic">Nessuna nota ancora.</div>
          )}
          <div className="space-y-3">
            {notes.map((n) => (
              <Card key={n.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {n.pinned && <Pin className="h-4 w-4 text-amber-600 shrink-0" />}
                      {n.title && <span className="font-medium truncate">{n.title}</span>}
                      <Badge variant={n.author_role === "staff" ? "default" : "secondary"} className="shrink-0">
                        {n.author_role === "staff" ? "RevMan" : "Hotel"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!readOnly && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => togglePin(n)} title={n.pinned ? "Sblocca" : "Fissa"}>
                            <Pin className={`h-4 w-4 ${n.pinned ? "fill-current" : ""}`} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteNote(n.id)} title="Elimina">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                  <div className="text-xs text-muted-foreground">{fmt(n.created_at)}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ACTIVITIES */}
        <TabsContent value="activities" className="space-y-4">
          {!readOnly && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nuova attività</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Titolo attività" value={actTitle} onChange={(e) => setActTitle(e.target.value)} />
              <Textarea placeholder="Descrizione (opzionale)" value={actDesc} onChange={(e) => setActDesc(e.target.value)} rows={2} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Scadenza</Label>
                  <Input type="date" value={actDue} onChange={(e) => setActDue(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assegnata a</Label>
                  <Select value={actAssigned} onValueChange={(v: "tenant" | "staff") => setActAssigned(v)}>
                    <SelectTrigger><SelectValue placeholder="Non assegnata" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tenant">Hotel</SelectItem>
                      <SelectItem value="staff">Revenue Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={createActivity} disabled={!actTitle.trim() || savingAct}>
                  {savingAct ? "Salvataggio..." : "Crea attività"}
                </Button>
              </div>
            </CardContent>
          </Card>
          )}

          {loading && <div className="text-sm text-muted-foreground">Caricamento...</div>}
          {!loading && activities.length === 0 && (
            <div className="text-sm text-muted-foreground italic">Nessuna attività registrata.</div>
          )}
          <div className="space-y-2">
            {activities.map((a) => (
              <Card key={a.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => !readOnly && setActivityStatus(a, a.status === "done" ? "open" : "done")}
                      className="mt-0.5"
                      title={readOnly ? "Stato" : "Cambia stato"}
                      disabled={readOnly}
                    >
                      <StatusIcon status={a.status} />
                    </button>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium ${a.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                          {a.title}
                        </span>
                        {a.assigned_to && (
                          <Badge variant="outline" className="text-xs">
                            {a.assigned_to === "staff" ? "RevMan" : "Hotel"}
                          </Badge>
                        )}
                        {a.due_date && (
                          <Badge variant="secondary" className="text-xs">
                            Scad. {format(new Date(a.due_date), "dd/MM/yyyy")}
                          </Badge>
                        )}
                      </div>
                      {a.description && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!readOnly && (
                        <>
                          <Select value={a.status} onValueChange={(v: Activity["status"]) => setActivityStatus(a, v)}>
                            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Da fare</SelectItem>
                              <SelectItem value="in_progress">In corso</SelectItem>
                              <SelectItem value="done">Fatta</SelectItem>
                              <SelectItem value="cancelled">Annullata</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" onClick={() => deleteActivity(a.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {readOnly && (
                        <Badge variant="outline" className="text-xs">
                          {a.status === "open" ? "Da fare" :
                            a.status === "in_progress" ? "In corso" :
                            a.status === "done" ? "Fatta" : "Annullata"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* FILES */}
        <TabsContent value="files" className="space-y-4">
          {!readOnly && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Carica file</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Categoria</Label>
                  <Select value={uploadCategory} onValueChange={setUploadCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrizione (opzionale)</Label>
                  <Input value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} placeholder="Es. Relazione di avvio mese 1" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input type="file" onChange={uploadFile} disabled={uploading} className="cursor-pointer" />
                {uploading && <span className="text-xs text-muted-foreground">Upload...</span>}
              </div>
              <p className="text-xs text-muted-foreground">Max 25 MB per file.</p>
            </CardContent>
          </Card>
          )}

          {loading && <div className="text-sm text-muted-foreground">Caricamento...</div>}
          {!loading && files.length === 0 && (
            <div className="text-sm text-muted-foreground italic">Nessun file caricato.</div>
          )}
          <div className="space-y-2">
            {files.map((f) => (
              <Card key={f.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{f.file_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORIES.find((c) => c.value === f.category)?.label || f.category}
                        </Badge>
                        <Badge variant={f.uploaded_by_role === "staff" ? "default" : "secondary"} className="text-xs">
                          {f.uploaded_by_role === "staff" ? "RevMan" : "Hotel"}
                        </Badge>
                      </div>
                      {f.description && <div className="text-sm text-muted-foreground">{f.description}</div>}
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(f.size_bytes)} - {fmt(f.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" asChild>
                        <a href={f.blob_url} target="_blank" rel="noopener noreferrer" title="Apri / Scarica">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      {!readOnly && (
                        <Button variant="ghost" size="icon" onClick={() => deleteFile(f.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* CHAT TADDEO */}
        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversazioni recenti con Taddeo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && <div className="text-sm text-muted-foreground">Caricamento...</div>}
              {!loading && chatSessions.length === 0 && (
                <div className="text-sm text-muted-foreground italic">
                  Nessuna conversazione registrata. Le sessioni della chat Taddeo verranno storicizzate qui automaticamente.
                </div>
              )}
              <div className="space-y-2">
                {chatSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{s.title || "Conversazione senza titolo"}</div>
                      <div className="text-xs text-muted-foreground">{fmt(s.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DATI (venditore, sola lettura) */}
        {(canViewMetrics || canViewFullDashboard) && (
          <TabsContent value="dati" className="space-y-4">
            <SellerHotelDataPanel hotelId={hotelId} full={canViewFullDashboard} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
