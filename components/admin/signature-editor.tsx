"use client"

import { useEffect, useRef, useState } from "react"
import {
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  List,
  ListOrdered,
  Palette,
  Eraser,
  Image as ImageIcon,
  Type,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface SignatureEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

/**
 * Rich text editor for email signatures.
 *
 * - Uses contentEditable so pasted HTML from Gmail/Outlook is preserved
 *   (images, tables, inline colors, links, buttons).
 * - Exposes a minimal formatting toolbar via document.execCommand.
 *   execCommand is legacy but still the most reliable cross-browser API
 *   for contentEditable rich text, and it's the industry standard for
 *   signature editors (including Gmail's own).
 */
export function SignatureEditor({ value, onChange, placeholder }: SignatureEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)

  // Initialize / sync external value → DOM only when the value differs from
  // current DOM, to avoid stealing focus or resetting the caret while typing.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (el.innerHTML !== value) {
      el.innerHTML = value || ""
    }
  }, [value])

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg)
    const el = editorRef.current
    if (el) onChange(el.innerHTML)
    el?.focus()
  }

  const handleInput = () => {
    const el = editorRef.current
    if (el) onChange(el.innerHTML)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // Preserve HTML when pasting (Gmail signatures come as rich HTML).
    // Default behaviour already does this, but some browsers strip it on
    // contentEditable without plaintext-only. We just let it through.
    // Ensure we capture the resulting change.
    setTimeout(handleInput, 0)
    // No preventDefault: rely on native paste
    void e
  }

  const promptLink = () => {
    const url = window.prompt("URL del link (https://... oppure mailto:...)")
    if (!url) return
    exec("createLink", url)
  }

  const promptImage = () => {
    const url = window.prompt("URL immagine (https://... oppure data:image/...)")
    if (!url) return
    exec("insertImage", url)
  }

  const applyColor = (color: string) => {
    exec("foreColor", color)
    setColorPickerOpen(false)
  }

  const clearFormatting = () => {
    exec("removeFormat")
    exec("unlink")
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b bg-muted/30">
        <ToolbarButton onClick={() => exec("bold")} title="Grassetto (Ctrl+B)">
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} title="Corsivo (Ctrl+I)">
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("underline")} title="Sottolineato (Ctrl+U)">
          <Underline className="w-4 h-4" />
        </ToolbarButton>
        <Divider />
        <select
          onChange={(e) => exec("fontSize", e.target.value)}
          className="h-8 text-xs border rounded px-1 bg-background"
          defaultValue="3"
          title="Dimensione testo"
        >
          <option value="1">XS</option>
          <option value="2">S</option>
          <option value="3">M</option>
          <option value="4">L</option>
          <option value="5">XL</option>
          <option value="6">XXL</option>
        </select>
        <div className="relative">
          <ToolbarButton onClick={() => setColorPickerOpen((v) => !v)} title="Colore testo">
            <Palette className="w-4 h-4" />
          </ToolbarButton>
          {colorPickerOpen && (
            <div className="absolute z-10 top-9 left-0 bg-popover border rounded-md shadow-md p-2 grid grid-cols-6 gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => applyColor(c)}
                  className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  aria-label={`Colore ${c}`}
                />
              ))}
            </div>
          )}
        </div>
        <Divider />
        <ToolbarButton onClick={() => exec("insertUnorderedList")} title="Elenco puntato">
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("insertOrderedList")} title="Elenco numerato">
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={promptLink} title="Inserisci link">
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={promptImage} title="Inserisci immagine">
          <ImageIcon className="w-4 h-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={clearFormatting} title="Rimuovi formattazione">
          <Eraser className="w-4 h-4" />
        </ToolbarButton>
        <div className="ml-auto text-[11px] text-muted-foreground pr-1 flex items-center gap-1">
          <Type className="w-3 h-3" />
          Incolla da Gmail per mantenere stile e immagini
        </div>
      </div>

      {/* Editor surface */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder ?? "Scrivi o incolla la tua firma..."}
        className="signature-editor-surface min-h-[180px] max-h-[480px] overflow-auto p-4 text-sm focus:outline-none"
      />

      <style jsx>{`
        .signature-editor-surface[contenteditable="true"]:empty::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
        .signature-editor-surface :global(img) {
          max-width: 100%;
          height: auto;
        }
        .signature-editor-surface :global(a) {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        .signature-editor-surface :global(table) {
          border-collapse: collapse;
        }
        .signature-editor-surface :global(ul),
        .signature-editor-surface :global(ol) {
          padding-left: 1.5rem;
        }
      `}</style>
    </div>
  )
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onMouseDown={(e) => e.preventDefault()} // keep selection in the editor
      onClick={onClick}
      title={title}
      className="h-8 w-8 p-0"
    >
      {children}
    </Button>
  )
}

function Divider() {
  return <div className="h-6 w-px bg-border mx-1" />
}

const PRESET_COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc",
  "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff",
  "#4a86e8", "#0000ff", "#9900ff", "#ff00ff",
  "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3",
  "#1f4e79", "#2e7d32", "#c62828", "#6a1b9a",
]
