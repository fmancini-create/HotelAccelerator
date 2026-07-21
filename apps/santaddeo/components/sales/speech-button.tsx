/**
 * SpeechButton — audio guida del Disco Vendita.
 *
 * Legge un testo ad alta voce con voce NEURALE realistica (OpenAI TTS via
 * /api/sales/tts), non piu' la sintesi vocale robotica del browser.
 * L'MP3 viene generato una sola volta lato server e messo in cache su Vercel
 * Blob: gli ascolti successivi dello stesso testo sono immediati e a costo zero.
 *
 * - Una sola lettura alla volta a livello globale (un nuovo play interrompe
 *   quella in corso) tramite un piccolo store condiviso.
 * - Stati: idle, loading (genero/scarico), playing.
 * - In caso di errore mostra "Riprova" senza rompere la pagina.
 */

"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Pause, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Store globale minimale: quale audio e' attivo ────────────────────────
const listeners = new Set<(activeId: string | null) => void>()
let activeId: string | null = null

function setActive(id: string | null) {
  activeId = id
  for (const l of listeners) l(id)
}

type SpeechButtonProps = {
  /** Testo da leggere ad alta voce. */
  text: string
  /** Etichetta accessibile / visibile accanto all'icona. */
  label?: string
  size?: "sm" | "icon"
  className?: string
  /** Voce OpenAI (default: alloy). */
  voice?: string
}

export function SpeechButton({ text, label, size = "sm", className, voice }: SpeechButtonProps) {
  const id = useId()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // Sottoscrizione allo store globale: se diventa attivo un altro id, mi fermo.
  useEffect(() => {
    const update = (current: string | null) => {
      const mine = current === id
      setIsActive(mine)
      if (!mine && audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
    }
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [id])

  // Pulizia allo smontaggio.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
      }
      if (activeId === id) setActive(null)
    }
  }, [id])

  const handleClick = async () => {
    // Toggle stop se sta suonando.
    if (isActive && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setActive(null)
      return
    }

    setError(false)

    // Riusa l'audio gia' scaricato.
    if (urlRef.current && audioRef.current) {
      setActive(id)
      try {
        await audioRef.current.play()
      } catch {
        setError(true)
        setActive(null)
      }
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/sales/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      })
      if (!res.ok) throw new Error("tts failed")
      const data = (await res.json()) as { url?: string }
      if (!data.url) throw new Error("no url")

      urlRef.current = data.url
      const audio = new Audio(data.url)
      audio.onended = () => {
        if (activeId === id) setActive(null)
      }
      audio.onerror = () => {
        setError(true)
        if (activeId === id) setActive(null)
      }
      audioRef.current = audio

      setActive(id)
      await audio.play()
    } catch {
      setError(true)
      setActive(null)
    } finally {
      setLoading(false)
    }
  }

  const labelText = loading ? "Genero…" : error ? "Riprova" : isActive ? "Stop" : label ?? "Ascolta"

  return (
    <Button
      type="button"
      size={size === "icon" ? "icon" : "sm"}
      variant={isActive ? "default" : "outline"}
      onClick={handleClick}
      disabled={loading}
      className={cn("gap-2", className)}
      aria-label={isActive ? "Ferma l'ascolto" : label ? `Ascolta: ${label}` : "Ascolta"}
      aria-pressed={isActive}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isActive ? (
        <Pause className="h-4 w-4" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
      {size !== "icon" && <span className="text-xs">{labelText}</span>}
    </Button>
  )
}
