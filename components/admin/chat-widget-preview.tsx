"use client"

import { HelpCircle, MessageCircle, MessageSquare, Phone, Send, Sparkles, X } from "lucide-react"
import { type WidgetAppearance, type WidgetIcon, raggioPerForma } from "@/lib/chat-widgets/appearance"

const ICONE: Record<WidgetIcon, typeof MessageCircle> = {
  chat: MessageCircle,
  message: MessageSquare,
  help: HelpCircle,
  sparkles: Sparkles,
  phone: Phone,
}

/**
 * Anteprima dal vivo del widget.
 *
 * Riceve l'aspetto già normalizzato dalla stessa funzione che usa il widget
 * pubblico, quindi quello che si vede qui è quello che vedrà il visitatore.
 * Il riquadro simula una pagina: senza un contorno, la posizione "basso a
 * sinistra" e la distanza dai bordi non si capiscono.
 */
export function ChatWidgetPreview({
  appearance,
  aperto = true,
}: {
  appearance: WidgetAppearance
  aperto?: boolean
}) {
  const Icona = ICONE[appearance.icon] ?? MessageCircle
  const raggio = raggioPerForma(appearance.shape, appearance.buttonSize)
  const aDestra = appearance.position === "bottom-right"

  // L'anteprima è in scala: una finestra da 560px non entrerebbe nel pannello.
  const scala = 0.62

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-lg border border-border bg-muted/40">
      {/* Finta pagina, per dare un riferimento visivo alle posizioni */}
      <div className="flex flex-col gap-2 p-4" aria-hidden="true">
        <div className="h-3 w-24 rounded bg-foreground/10" />
        <div className="h-2 w-full max-w-xs rounded bg-foreground/[0.07]" />
        <div className="h-2 w-full max-w-[14rem] rounded bg-foreground/[0.07]" />
      </div>

      <div
        className="absolute flex flex-col items-end gap-2"
        style={{
          bottom: appearance.offsetY * scala,
          [aDestra ? "right" : "left"]: appearance.offsetX * scala,
          alignItems: aDestra ? "flex-end" : "flex-start",
        }}
      >
        {aperto && (
          <div
            className="flex flex-col overflow-hidden bg-card shadow-xl"
            style={{
              width: appearance.windowWidth * scala,
              height: appearance.windowHeight * scala,
              borderRadius: raggio.finestra,
            }}
          >
            {/* Testata: è qui che il contrasto fra colore e testo si vede */}
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ backgroundColor: appearance.primaryColor, color: appearance.textColor }}
            >
              {appearance.logoUrl ? (
                <img
                  src={appearance.logoUrl || "/placeholder.svg"}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded object-contain"
                />
              ) : (
                <Icona className="h-4 w-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold leading-tight">{appearance.title}</p>
                <p className="truncate text-[9px] leading-tight opacity-80">{appearance.subtitle}</p>
              </div>
              <X className="h-3 w-3 shrink-0 opacity-70" />
            </div>

            <div className="flex-1 space-y-2 overflow-hidden bg-muted/30 p-2">
              <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-card px-2 py-1.5 text-[10px] leading-snug text-foreground shadow-sm">
                {appearance.welcomeMessage}
              </div>
              <div
                className="ml-auto max-w-[70%] rounded-lg rounded-tr-sm px-2 py-1.5 text-[10px] leading-snug"
                style={{ backgroundColor: appearance.primaryColor, color: appearance.textColor }}
              >
                Avete camere libere sabato?
              </div>
            </div>

            <div className="flex items-center gap-1.5 border-t border-border bg-card px-2 py-1.5">
              <span className="flex-1 truncate text-[10px] text-muted-foreground">{appearance.placeholder}</span>
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: appearance.primaryColor, color: appearance.textColor }}
              >
                <Send className="h-2.5 w-2.5" />
              </span>
            </div>
          </div>
        )}

        <span
          className="flex items-center justify-center shadow-lg"
          style={{
            width: appearance.buttonSize * scala,
            height: appearance.buttonSize * scala,
            borderRadius: raggio.pulsante,
            backgroundColor: appearance.primaryColor,
            color: appearance.textColor,
          }}
        >
          <Icona style={{ width: appearance.buttonSize * scala * 0.45, height: appearance.buttonSize * scala * 0.45 }} />
        </span>
      </div>

      <p className="absolute left-3 top-3 text-[10px] uppercase tracking-wide text-muted-foreground">Anteprima</p>
    </div>
  )
}
