"use client"

import { useEffect, useRef, useState } from "react"
import { Bold, Italic, Underline, List, ListOrdered, Link2, Paperclip, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EMAIL_TEMPLATES, type EmailTemplate } from "@/lib/sales/email-templates"
import { cn } from "@/lib/utils"

export type ComposerAttachment = {
  url: string
  filename: string
  size: number
  contentType: string
}

const DRAFT_PREFIX = "santaddeo:mail-draft:"

/** Cancella una bozza salvata (da chiamare dopo un invio andato a buon fine). */
export function clearComposerDraft(draftKey?: string) {
  if (!draftKey || typeof window === "undefined") return
  try {
    window.localStorage.removeItem(DRAFT_PREFIX + draftKey)
  } catch {
    // localStorage non disponibile: ignora.
  }
}

/**
 * Compositore email con formattazione (grassetto/corsivo/sottolineato/elenchi/
 * link) basato su contentEditable + document.execCommand, e gestione allegati
 * (upload su /api/sales/attachments -> Vercel Blob).
 *
 * Espone il contenuto come HTML; la sanitizzazione definitiva avviene
 * server-side prima dell'invio. Usato sia nella risposta del thread sia nel
 * dialog "Scrivi".
 */
export function RichEmailComposer({
  placeholder,
  sending,
  disabled,
  onChangeEmpty,
  editorRef,
  attachments,
  onAttachmentsChange,
  minHeightClass = "min-h-[96px]",
  showTemplates = false,
  templateData,
  onApplyTemplate,
  draftKey,
}: {
  placeholder?: string
  sending?: boolean
  disabled?: boolean
  /** Notifica se l'editor e' vuoto (per disabilitare il pulsante invia). */
  onChangeEmpty?: (empty: boolean) => void
  /** Ref all'elemento editable, per leggere/azzerare l'HTML dal genitore. */
  editorRef: React.RefObject<HTMLDivElement | null>
  attachments: ComposerAttachment[]
  onAttachmentsChange: (next: ComposerAttachment[]) => void
  /** Classe Tailwind per l'altezza minima dell'area editabile. */
  minHeightClass?: string
  /** Mostra i chip delle risposte predefinite sopra l'editor. */
  showTemplates?: boolean
  /**
   * Dati per sostituire i placeholder del template: nome/struttura del lead +
   * identità del venditore firmatario (agentName/agentEmail) per risolvere
   * {{nome_venditore}}/{{email_venditore}} subito nell'editor.
   */
  templateData?: {
    firstName?: string
    lastName?: string
    hotelName?: string
    agentName?: string
    agentEmail?: string
  }
  /** Callback opzionale dopo l'applicazione di un template (es. impostare l'oggetto). */
  onApplyTemplate?: (tpl: EmailTemplate, filledSubject: string) => void
  /**
   * Se valorizzato, abilita l'autosave della bozza in localStorage con questa
   * chiave (es. `reply:<leadId>` o `compose`). La bozza viene ripristinata al
   * montaggio e cancellata quando l'editor torna vuoto. Dopo un invio riuscito
   * il genitore deve chiamare clearComposerDraft(draftKey).
   */
  draftKey?: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)
  const [draftSaved, setDraftSaved] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ripristino bozza al montaggio (una volta per draftKey). Se l'editor è già
  // popolato dal genitore (es. quoting di una risposta) NON sovrascriviamo.
  useEffect(() => {
    if (!draftKey || typeof window === "undefined") return
    const el = editorRef.current
    if (!el) return
    const existing = (el.textContent ?? "").trim()
    if (existing.length > 0) return
    try {
      const saved = window.localStorage.getItem(DRAFT_PREFIX + draftKey)
      if (saved) {
        el.innerHTML = saved
        onChangeEmpty?.((el.textContent ?? "").trim().length === 0)
        setDraftSaved(true)
      }
    } catch {
      // ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  // Salvataggio (debounce) della bozza corrente.
  function scheduleDraftSave() {
    if (!draftKey || typeof window === "undefined") return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const el = editorRef.current
      if (!el) return
      const text = (el.textContent ?? "").trim()
      try {
        if (text.length === 0) {
          window.localStorage.removeItem(DRAFT_PREFIX + draftKey)
          setDraftSaved(false)
        } else {
          window.localStorage.setItem(DRAFT_PREFIX + draftKey, el.innerHTML)
          setDraftSaved(true)
        }
      } catch {
        // ignora (quota/Safari privato)
      }
    }, 600)
  }

  // Sostituisce i placeholder noti coi dati del lead e la firma del venditore.
  // {{nome_venditore}}/{{email_venditore}} si risolvono qui (per mostrare subito
  // la firma reale nell'editor) e comunque di nuovo lato server all'invio. I
  // {{link_*}} restano e si risolvono solo lato server.
  function fillPlaceholders(text: string) {
    return text
      .replace(/\{\{nome_lead\}\}/g, templateData?.firstName?.trim() || "{{nome_lead}}")
      .replace(/\{\{cognome_lead\}\}/g, templateData?.lastName?.trim() || "{{cognome_lead}}")
      .replace(/\{\{nome_struttura\}\}/g, templateData?.hotelName?.trim() || "{{nome_struttura}}")
      .replace(/\{\{nome_venditore\}\}/g, templateData?.agentName?.trim() || "{{nome_venditore}}")
      .replace(/\{\{email_venditore\}\}/g, templateData?.agentEmail?.trim() || "{{email_venditore}}")
  }

  function applyTemplate(tpl: EmailTemplate) {
    const html = fillPlaceholders(tpl.body)
    if (editorRef.current) {
      editorRef.current.innerHTML = html
      onChangeEmpty?.((editorRef.current.textContent ?? "").trim().length === 0)
    }
    setActiveTemplate(tpl.id)
    scheduleDraftSave()
    onApplyTemplate?.(tpl, fillPlaceholders(tpl.subject))
  }

  // FIX formattazione: i pulsanti della toolbar DEVONO impedire il mousedown
  // di default, altrimenti il click sposta il focus fuori dall'area editabile e
  // la SELEZIONE corrente viene persa -> document.execCommand non ha nulla su
  // cui agire e la formattazione "non funziona". preventDefault mantiene focus e
  // selezione nell'editor.
  function preserveSelection(e: React.MouseEvent) {
    e.preventDefault()
  }

  function exec(command: string) {
    editorRef.current?.focus()
    document.execCommand(command, false)
    handleInput()
  }

  function addLink() {
    const url = window.prompt("Inserisci l'URL del link:", "https://")
    if (!url) return
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
      window.alert("Il link deve iniziare con http://, https:// o mailto:")
      return
    }
    editorRef.current?.focus()
    document.execCommand("createLink", false, url)
    handleInput()
  }

  function handleInput() {
    const text = editorRef.current?.textContent?.trim() ?? ""
    onChangeEmpty?.(text.length === 0)
    scheduleDraftSave()
  }

  async function uploadFiles(files: FileList) {
    setUploadError(null)
    setUploading(true)
    try {
      const next = [...attachments]
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/sales/attachments", { method: "POST", body: fd })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setUploadError(json?.message || "Caricamento allegato non riuscito.")
          continue
        }
        next.push(json as ComposerAttachment)
      }
      onAttachmentsChange(next)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const toolbarBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"

  return (
    <div className="rounded-lg border border-border">
      {/* Risposte predefinite (opzionali) */}
      {showTemplates && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
          <span className="mr-0.5 text-xs text-muted-foreground">Risposte:</span>
          {EMAIL_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              disabled={disabled || sending}
              onClick={() => applyTemplate(tpl)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-50",
                activeTemplate === tpl.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {tpl.name}
            </button>
          ))}
        </div>
      )}
      {/* Toolbar di formattazione */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <button
          type="button"
          className={toolbarBtn}
          onMouseDown={preserveSelection}
          onClick={() => exec("bold")}
          disabled={disabled}
          title="Grassetto"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onMouseDown={preserveSelection}
          onClick={() => exec("italic")}
          disabled={disabled}
          title="Corsivo"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onMouseDown={preserveSelection}
          onClick={() => exec("underline")}
          disabled={disabled}
          title="Sottolineato"
        >
          <Underline className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button
          type="button"
          className={toolbarBtn}
          onMouseDown={preserveSelection}
          onClick={() => exec("insertUnorderedList")}
          disabled={disabled}
          title="Elenco puntato"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onMouseDown={preserveSelection}
          onClick={() => exec("insertOrderedList")}
          disabled={disabled}
          title="Elenco numerato"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onMouseDown={preserveSelection}
          onClick={addLink}
          disabled={disabled}
          title="Inserisci link"
        >
          <Link2 className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          title="Allega file"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && e.target.files.length > 0 && void uploadFiles(e.target.files)}
        />
      </div>

      {/* Area editabile */}
      <div
        ref={editorRef}
        contentEditable={!disabled && !sending}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || "Scrivi un messaggio"}
        data-placeholder={placeholder || "Scrivi un messaggio..."}
        onInput={handleInput}
        className={cn(
          "max-h-[280px] overflow-y-auto px-3 py-2 text-sm leading-relaxed outline-none",
          minHeightClass,
          "[&[data-placeholder]:empty::before]:text-muted-foreground [&[data-placeholder]:empty::before]:content-[attr(data-placeholder)]",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline",
        )}
        suppressContentEditableWarning
      />

      {/* Chip allegati + stato bozza */}
      {(attachments.length > 0 || uploadError || (draftKey && draftSaved)) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-2 py-1.5">
          {attachments.map((a, i) => (
            <span
              key={`${a.url}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[160px] truncate">{a.filename}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onAttachmentsChange(attachments.filter((_, idx) => idx !== i))}
                aria-label={`Rimuovi ${a.filename}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {uploadError ? <span className="text-xs text-destructive">{uploadError}</span> : null}
          {draftKey && draftSaved ? (
            <span className="ml-auto text-xs text-muted-foreground">Bozza salvata</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** Pulsante invia coerente, usato accanto al composer. */
export function ComposerSendButton({
  onClick,
  sending,
  disabled,
  label = "Invia",
  icon,
}: {
  onClick: () => void
  sending?: boolean
  disabled?: boolean
  label?: string
  icon?: React.ReactNode
}) {
  return (
    <Button size="sm" onClick={onClick} disabled={disabled || sending}>
      {sending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Invio...
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </Button>
  )
}
