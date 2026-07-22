"use client"

import { useState } from "react"
import useSWR from "swr"
import { Loader2, StickyNote, Phone, GitBranch, Mail, ArrowDownLeft, FileText, Video } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Activity = {
  id: string
  activity_type: "note" | "call" | "email_sent" | "email_received" | "stage_change" | "task"
  content: string | null
  metadata: Record<string, unknown>
  due_at: string | null
  completed_at: string | null
  created_at: string
}

const ACTIVITY_LABEL: Record<string, string> = {
  note: "Nota",
  call: "Chiamata",
  email_sent: "Email inviata",
  email_received: "Risposta cliente",
  stage_change: "Cambio stadio",
  task: "Promemoria",
}

function ActivityIcon({ type }: { type: string }) {
  const cls = "h-3 w-3"
  if (type === "note") return <StickyNote className={cls} />
  if (type === "call") return <Phone className={cls} />
  if (type === "stage_change") return <GitBranch className={cls} />
  if (type === "email_received") return <ArrowDownLeft className={cls} />
  return <Mail className={cls} />
}

/**
 * Timeline attivita' del lead (note, call, email, cambi stadio) + composizione
 * di note/chiamate. Componente CONDIVISO tra il dialog conversazione lead e la
 * vista Posta, cosi' le due UI restano allineate.
 *
 * `onChanged` viene chiamato dopo l'aggiunta di una nota (es. per refresh
 * esterni). `refreshKey` puo' essere cambiato dal genitore per forzare il
 * reload (es. dopo un cambio stadio).
 */
export function LeadTimeline({
  leadId,
  enabled = true,
  onChanged,
}: {
  leadId: string | null
  enabled?: boolean
  onChanged?: () => void
}) {
  const { data, isLoading, mutate } = useSWR<{ activities: Activity[] }>(
    enabled && leadId ? `/api/sales/leads/${leadId}/activities` : null,
    fetcher,
  )

  const [note, setNote] = useState("")
  const [type, setType] = useState<"note" | "call">("note")
  const [saving, setSaving] = useState(false)
  const activities = data?.activities ?? []

  async function addNote() {
    if (!leadId || !note.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content: note.trim() }),
      })
      if (res.ok) {
        setNote("")
        await mutate()
        onChanged?.()
      }
    } finally {
      setSaving(false)
    }
  }

  // Espone la mutate al genitore tramite un trucco semplice: si puo' chiamare
  // refresh() richiamando mutate via key. Qui esponiamo come metodo passato.
  return (
    <div className="space-y-3">
      {/* Composizione nota / call */}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={type === "note" ? "default" : "outline"}
            onClick={() => setType("note")}
          >
            <StickyNote className="mr-1 h-3.5 w-3.5" /> Nota
          </Button>
          <Button
            type="button"
            size="sm"
            variant={type === "call" ? "default" : "outline"}
            onClick={() => setType("call")}
          >
            <Phone className="mr-1 h-3.5 w-3.5" /> Chiamata
          </Button>
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={type === "note" ? "Aggiungi una nota interna..." : "Esito della chiamata..."}
          rows={2}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void addNote()} disabled={saving || !note.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento cronologia...
        </div>
      ) : activities.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nessuna attività registrata.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {activities.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[1.42rem] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ActivityIcon type={a.activity_type} />
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground/80">
                  {ACTIVITY_LABEL[a.activity_type] ?? a.activity_type}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {a.content ? (
                <p className="whitespace-pre-wrap text-sm text-foreground/90">{a.content}</p>
              ) : null}
              {(a.metadata?.recap_doc_url || a.metadata?.recording_url) ? (
                <div className="mt-1 flex flex-wrap gap-3">
                  {a.metadata?.recap_doc_url ? (
                    <a
                      href={String(a.metadata.recap_doc_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" /> Appunti di Gemini
                    </a>
                  ) : null}
                  {a.metadata?.recording_url ? (
                    <a
                      href={String(a.metadata.recording_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Video className="h-3.5 w-3.5" /> Registrazione
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
