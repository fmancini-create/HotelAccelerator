"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Pause, Play, Sparkles } from "lucide-react"

/**
 * Popup descrittivo + voce narrante femminile (italiano).
 *
 * Implementazione:
 * - Auto-apre all'arrivo sulla pagina demo.
 * - Memoria sessione (sessionStorage) per pageKey: se l'utente l'ha gia'
 *   chiuso in questa sessione, NON riaprire automaticamente. Serve solo
 *   il bottone "Riapri info" nello shell.
 * - TTS via Web Speech API (`window.speechSynthesis`): zero costo, zero
 *   API key, supportata su Chrome/Safari/Edge moderni. Selezioniamo la
 *   prima voce italiana femminile disponibile, fallback su qualsiasi
 *   voce italiana.
 */

type Props = {
  pageKey: string
  title: string
  /** Testo descrittivo della pagina, viene anche letto dalla voce TTS */
  narration: string
  /** Bullet point opzionali mostrati nel popup (non vengono letti dalla voce) */
  bullets?: string[]
  /** Se true, ignora la sessionStorage e apre sempre */
  forceOpen?: boolean
  /** Callback chiusura, usato dallo shell per resettare il bottone "Riapri" */
  onClose?: () => void
}

/**
 * Sceglie la voce italiana che suona MENO robotica disponibile sul dispositivo.
 *
 * La Web Speech API espone voci molto diverse per qualita': quelle "neural" /
 * "natural" / "online" (Microsoft Edge, Google) sono nettamente piu' naturali
 * delle voci locali di sistema. Invece di una lista fissa, assegniamo un
 * punteggio a ogni voce italiana e prendiamo la migliore: cosi' su ogni
 * browser/OS otteniamo automaticamente la voce piu' umana presente.
 */
function pickItalianVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  const itVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith("it"))
  const pool = itVoices.length ? itVoices : voices

  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase()
    let s = 0
    // Voci neurali/naturali: il fattore che piu' riduce l'effetto "robot"
    if (n.includes("natural")) s += 120
    if (n.includes("neural")) s += 120
    if (n.includes("online")) s += 50
    if (n.includes("premium") || n.includes("enhanced")) s += 60
    // Le voci Google italiane sono molto fluide
    if (n.includes("google")) s += 70
    // Voci di rete (non locali) tipicamente di qualita' superiore
    if (v.localService === false) s += 25
    // Voci femminili italiane note di buona qualita'
    for (const fn of ["isabella", "elsa", "federica", "alice", "giorgia", "carla"]) {
      if (n.includes(fn)) s += 15
    }
    if (v.lang?.toLowerCase() === "it-it") s += 10
    return s
  }

  return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null
}

export function DemoPopup({ pageKey, title, narration, bullets, forceOpen, onClose }: Props) {
  const [open, setOpen] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  // Frasi da leggere in sequenza + indice corrente.
  const chunksRef = useRef<string[]>([])
  // Token di esecuzione: incrementandolo invalidiamo i run precedenti, cosi'
  // un onend "in ritardo" non fa ripartire una narrazione gia' fermata.
  const runIdRef = useRef(0)
  // Timer keep-alive contro il bug di Chrome che taglia la voce dopo ~15s.
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-open: solo se non gia' visto in questa sessione, oppure se forceOpen
  useEffect(() => {
    const key = `demo-seen:${pageKey}`
    const seen = typeof window !== "undefined" && sessionStorage.getItem(key)
    if (forceOpen || !seen) {
      // microdelay per evitare flash al primo render
      const t = setTimeout(() => setOpen(true), 200)
      return () => clearTimeout(t)
    }
  }, [pageKey, forceOpen])

  // Mute persistente in sessione
  useEffect(() => {
    const m = typeof window !== "undefined" && sessionStorage.getItem("demo-muted")
    if (m === "1") setMuted(true)
  }, [])

  // Avvia la voce quando il popup si apre.
  // IMPORTANTE: chiudere il popup NON ferma la narrazione: la voce continua
  // mentre l'utente esplora la pagina. La voce si interrompe solo quando si
  // lascia la pagina (unmount), si disattiva (mute) o si avvia un'altra pagina.
  useEffect(() => {
    if (!open || muted) return

    let cancelled = false
    const start = () => {
      if (!cancelled) speak()
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length === 0) {
        // Le voci si caricano async su Chrome: aspettiamo l'evento
        const onVoices = () => {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoices)
          start()
        }
        window.speechSynthesis.addEventListener("voiceschanged", onVoices)
        const t = setTimeout(start, 500)
        return () => {
          cancelled = true
          clearTimeout(t)
          window.speechSynthesis.removeEventListener("voiceschanged", onVoices)
          // niente stopSpeech qui: la chiusura del dialog non deve zittire la voce
        }
      }
      start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, muted, pageKey])

  // La voce si ferma solo quando il componente viene smontato (cambio pagina).
  useEffect(() => {
    return () => stopSpeech()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Riscrive foneticamente alcuni termini SOLO per la voce (il testo a schermo
   * resta invariato). Le voci italiane leggerebbero "Price Guard" all'italiana
   * ("pri-che gu-ard") e "RevPOR" lettera per lettera ("erre-e-por"): qui li
   * forziamo a suonare come si pronunciano davvero.
   */
  function applyPronunciation(text: string): string {
    return (
      text
        // "Price Guard" -> pronuncia inglese
        .replace(/\bprice\s+guard\b/gi, "Prais Gard")
        // "Guard" da solo (es. "il Guard") -> "Gard" all'inglese
        .replace(/\bguard\b/gi, "Gard")
        // RevPOR / RevPAR letti come parola, con l'accento sulla sillaba giusta
        .replace(/\brevpor\b/gi, "Revpòr")
        .replace(/\brevpar\b/gi, "Revpàr")
    )
  }

  function buildText(): string {
    // Niente puntini artificiali: spezziamo per frase (vedi splitIntoSentences),
    // cosi' ogni frase ha la sua intonazione e suona piu' naturale.
    return applyPronunciation(`${title}. ${narration}`)
  }

  /**
   * Spezza il testo in frasi pulite. Leggere frasi brevi in sequenza, invece
   * di un unico blocco lungo, fa due cose: 1) suona molto piu' umano perche'
   * la prosodia si "resetta" a ogni frase; 2) evita il bug di Chrome che
   * tronca le utterance lunghe oltre ~15 secondi.
   */
  function splitIntoSentences(text: string): string[] {
    return text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  function startKeepAlive() {
    stopKeepAlive()
    if (typeof window === "undefined" || !window.speechSynthesis) return
    // Chrome sospende la sintesi dopo ~15s: un resume periodico la tiene viva.
    // Non tocchiamo lo stato se l'utente ha messo in pausa di proposito.
    keepAliveRef.current = setInterval(() => {
      const synth = window.speechSynthesis
      if (synth.speaking && !synth.paused) synth.resume()
    }, 8000)
  }

  function stopKeepAlive() {
    if (keepAliveRef.current != null) {
      clearInterval(keepAliveRef.current)
      keepAliveRef.current = null
    }
  }

  function speakChunk(i: number, runId: number) {
    if (runId !== runIdRef.current) return
    if (typeof window === "undefined" || !window.speechSynthesis) return
    const chunks = chunksRef.current
    if (i >= chunks.length) {
      setSpeaking(false)
      setPaused(false)
      stopKeepAlive()
      return
    }
    const u = new SpeechSynthesisUtterance(chunks[i])
    u.lang = "it-IT"
    // Ritmo naturale e tono leggermente piu' caldo: meno "robot", piu' persona.
    u.rate = 0.97
    u.pitch = 1.05
    u.volume = 1
    const voice = pickItalianVoice()
    if (voice) u.voice = voice
    u.onstart = () => {
      setSpeaking(true)
      setPaused(false)
    }
    u.onend = () => {
      if (runId !== runIdRef.current) return
      // Micro-pausa tra una frase e l'altra: rende il discorso piu' disteso.
      setTimeout(() => speakChunk(i + 1, runId), 240)
    }
    u.onerror = () => {
      if (runId !== runIdRef.current) return
      // Se una frase fallisce, proseguiamo comunque con la successiva.
      setTimeout(() => speakChunk(i + 1, runId), 120)
    }
    utteranceRef.current = u
    window.speechSynthesis.speak(u)
  }

  function speak() {
    if (typeof window === "undefined" || !window.speechSynthesis) return
    stopSpeech()
    const runId = ++runIdRef.current
    chunksRef.current = splitIntoSentences(buildText())
    setSpeaking(true)
    setPaused(false)
    startKeepAlive()
    speakChunk(0, runId)
  }

  function stopSpeech() {
    // Invalida ogni run in corso, cosi' nessun onend in coda lo fa ripartire.
    runIdRef.current++
    stopKeepAlive()
    if (typeof window === "undefined" || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
    setPaused(false)
  }

  function togglePause() {
    if (typeof window === "undefined" || !window.speechSynthesis) return
    if (!speaking) {
      speak()
      return
    }
    if (paused) {
      window.speechSynthesis.resume()
      setPaused(false)
    } else {
      window.speechSynthesis.pause()
      setPaused(true)
    }
  }

  function toggleMute() {
    const next = !muted
    setMuted(next)
    if (typeof window !== "undefined") {
      sessionStorage.setItem("demo-muted", next ? "1" : "0")
    }
    if (next) stopSpeech()
    else if (open) speak()
  }

  function handleClose(o: boolean) {
    setOpen(o)
    if (!o) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(`demo-seen:${pageKey}`, "1")
      }
      // NB: non fermiamo la voce: la narrazione prosegue mentre si esplora la
      // pagina. Per zittirla l'utente puo' riaprire l'info e usare "Voce off".
      onClose?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Sparkles className="h-4 w-4" />
            </span>
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{narration}</p>

          {bullets && bullets.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Cosa puoi fare qui
              </p>
              <ul className="space-y-1.5">
                {bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-600 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={togglePause}
                disabled={muted}
                className="gap-2 bg-transparent"
              >
                {paused || !speaking ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused || !speaking ? "Riascolta" : "Pausa"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                className="gap-2"
                title={muted ? "Riattiva voce" : "Disattiva voce"}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {muted ? "Voce off" : "Voce on"}
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => handleClose(false)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Esplora la pagina
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
