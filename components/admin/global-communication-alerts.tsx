"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { BellRing, MessageCircle, PhoneIncoming, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAdminAuth } from "@/lib/admin-hooks"
import { createClient } from "@/lib/supabase/client"

type AlertKind = "message" | "phone"

type ActiveAlert = {
  kind: AlertKind
  title: string
  detail: string
  href: string
  count: number
}

type MessageInsertRow = {
  id?: string
  sender_type?: string | null
  sender_name?: string | null
}

type PhoneAlertItem = {
  id: string
  counterpart_number: string | null
  started_at: string | null
  status: string | null
  created_at: string
}

type PhoneAlertResponse = {
  items?: PhoneAlertItem[]
  cursor?: string
}

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

const DISPLAY_MS = 12_000
const PHONE_POLL_MS = 8_000
const MAX_SEEN = 200

export function GlobalCommunicationAlerts() {
  const { adminUser, isLoading } = useAdminAuth()
  const propertyId = adminUser?.property_id
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seenRef = useRef(new Set<string>())
  const seenOrderRef = useRef<string[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const phoneCursorRef = useRef<string | null>(null)
  const phonePollingBlockedRef = useRef(false)

  const remember = useCallback((key: string) => {
    if (seenRef.current.has(key)) return false
    seenRef.current.add(key)
    seenOrderRef.current.push(key)
    while (seenOrderRef.current.length > MAX_SEEN) {
      const oldest = seenOrderRef.current.shift()
      if (oldest) seenRef.current.delete(oldest)
    }
    return true
  }, [])

  const ensureAudio = useCallback(async () => {
    if (typeof window === "undefined") return null
    const AudioContextClass = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext
    if (!AudioContextClass) return null

    let context = audioContextRef.current
    if (!context) {
      context = new AudioContextClass()
      audioContextRef.current = context
    }
    if (context.state === "suspended") await context.resume().catch(() => undefined)
    return context.state === "running" ? context : null
  }, [])

  useEffect(() => {
    const unlock = () => {
      void ensureAudio()
    }
    window.addEventListener("pointerdown", unlock, { once: true })
    window.addEventListener("keydown", unlock, { once: true })
    return () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
    }
  }, [ensureAudio])

  const playSignal = useCallback((kind: AlertKind) => {
    const context = audioContextRef.current
    if (!context || context.state !== "running") return

    const tone = (frequency: number, startsIn: number, duration: number) => {
      const start = context.currentTime + startsIn
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.03)
    }

    if (kind === "phone") {
      tone(660, 0, 0.16)
      tone(520, 0.22, 0.18)
    } else {
      tone(880, 0, 0.12)
      tone(1040, 0.15, 0.12)
    }
  }, [])

  const showAlert = useCallback(
    (next: Omit<ActiveAlert, "count">) => {
      playSignal(next.kind)
      setActiveAlert((current) => ({
        ...next,
        count: current ? current.count + 1 : 1,
      }))
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => setActiveAlert(null), DISPLAY_MS)
    },
    [playSignal],
  )

  useEffect(() => {
    if (isLoading || !propertyId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`global-communication-alerts-${propertyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `property_id=eq.${propertyId}`,
        },
        (payload) => {
          const row = payload.new as MessageInsertRow
          if (row.sender_type !== "customer") return
          const id = row.id ? `message:${row.id}` : `message:${Date.now()}`
          if (!remember(id)) return
          showAlert({
            kind: "message",
            title: "Nuova comunicazione",
            detail: row.sender_name?.trim() ? `Messaggio da ${row.sender_name.trim()}` : "Nuovo messaggio in Inbox",
            href: "/admin/inbox",
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [isLoading, propertyId, remember, showAlert])

  useEffect(() => {
    if (isLoading || !propertyId) return
    let cancelled = false
    phonePollingBlockedRef.current = false
    phoneCursorRef.current = new Date().toISOString()

    const pollPhone = async () => {
      if (cancelled || phonePollingBlockedRef.current || !phoneCursorRef.current) return
      try {
        const response = await fetch(
          `/api/platform/communication-alerts/phone?after=${encodeURIComponent(phoneCursorRef.current)}`,
          { credentials: "include", cache: "no-store" },
        )
        if (response.status === 403) {
          phonePollingBlockedRef.current = true
          return
        }
        if (!response.ok) return

        const body = (await response.json()) as PhoneAlertResponse
        if (body.cursor) phoneCursorRef.current = body.cursor
        for (const item of body.items ?? []) {
          if (!item.id || !remember(`phone:${item.id}`)) continue
          showAlert({
            kind: "phone",
            title: "Nuova telefonata",
            detail: item.counterpart_number ? `Chiamata in entrata da ${item.counterpart_number}` : "Nuova chiamata in entrata",
            href: "/admin/calls",
          })
        }
      } catch {
        // Il ciclo successivo ritenta senza interrompere il lavoro dell'operatore.
      }
    }

    const interval = window.setInterval(() => {
      void pollPhone()
    }, PHONE_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isLoading, propertyId, remember, showAlert])

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      if (audioContextRef.current) void audioContextRef.current.close().catch(() => undefined)
    }
  }, [])

  if (!activeAlert) return null

  const Icon = activeAlert.kind === "phone" ? PhoneIncoming : MessageCircle

  return (
    <div className="fixed right-3 top-20 z-[80] w-[calc(100vw-1.5rem)] max-w-sm sm:right-5" aria-live="assertive">
      <div className="relative overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <span className="absolute inset-y-0 left-0 w-1 animate-pulse bg-amber-400" aria-hidden />
        <span
          className="absolute right-4 top-4 h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.9)] animate-pulse"
          aria-hidden
        />
        <div className="flex items-start gap-3 p-4 pr-11">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-amber-600" aria-hidden />
              <p className="font-semibold text-foreground">{activeAlert.title}</p>
              {activeAlert.count > 1 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  +{activeAlert.count - 1}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">{activeAlert.detail}</p>
            <Button asChild size="sm" className="mt-3 h-8">
              <Link href={activeAlert.href} onClick={() => setActiveAlert(null)}>
                Apri
              </Link>
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveAlert(null)}
          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Chiudi notifica"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
