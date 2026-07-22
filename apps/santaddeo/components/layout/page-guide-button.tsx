"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { HelpCircle, X, Send, CheckCircle2, Loader2, AlertTriangle, BookOpen, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getPageGuide } from "@/lib/page-guides"
import type { PageGuide } from "@/lib/page-guides"
// FIX 02/05/2026: l'auth check si fa ora via server (/api/page-guide/whoami)
// e NON via Supabase JS client-side. Il vecchio approccio falliva spesso su
// preview/v0 sandbox e su alcuni domini di produzione (cookie HttpOnly non
// leggibili dal browser), causando il bug "chat chiede nome/email anche se
// loggato dopo la prima risposta".

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

// Pages where guide should NOT appear at all
const HIDDEN_PATHS = ["/auth", "/onboarding"]

// Prefissi delle pagine "app autenticata" dove il FAB flottante NON va mostrato
// e dove il lead capture (richiesta nome+email) non deve mai scattare.
// Su queste pagine il trigger della guida vive nell'header (PageGuideHeaderButton)
// e l'utente e' identificato via cookie auth (whoami), quindi non serve
// catturare email da lead. Tutto il resto e' considerato "pagina pubblica".
const PRIVATE_APP_PATHS = [
  "/dati",
  "/dashboard",
  "/dashboard-v3",
  "/accelerator",
  "/calendar",
  "/settings",
  "/superadmin",
  // FIX 06/06/2026: /sales e' l'area CRM venditori (autenticata). Senza questo
  // prefisso il FAB blu della guida compariva in basso a destra es. su
  // /sales/revman/[hotelId]. Aggiunto per sopprimere il FAB e il lead-capture.
  "/sales",
  "/profilo",
  "/profile",
  "/notifiche",
  "/notifications",
]

// Shared state for opening the guide from header
let openGuideFromHeader: (() => void) | null = null

export function setOpenGuideHandler(handler: () => void) {
  openGuideFromHeader = handler
}

export function triggerOpenGuide() {
  if (openGuideFromHeader) {
    openGuideFromHeader()
  }
}

// Header button component (to be used in app-header)
export function PageGuideHeaderButton() {
  return (
    <button
      onClick={() => triggerOpenGuide()}
      title="Guida interattiva"
      className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-blue-400 bg-blue-600 text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
      aria-label="Guida interattiva"
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  )
}

export function PageGuideButton() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [guide, setGuide] = useState<PageGuide | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [uncertainSaved, setUncertainSaved] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userName, setUserName] = useState("")
  const [authChecked, setAuthChecked] = useState(false)

  // Lead capture state (for unauthenticated visitors only)
  const [needsLeadCapture, setNeedsLeadCapture] = useState(false)
  const [leadCaptured, setLeadCaptured] = useState(false)
  const [leadName, setLeadName] = useState("")
  const [leadEmail, setLeadEmail] = useState("")
  const [leadError, setLeadError] = useState("")
  const [responseCount, setResponseCount] = useState(0)

  // FIX 02/05/2026: id della conversazione lato server, restituito dall'API
  // come header `x-conversation-id` al primo invio. Lo passiamo nelle chiamate
  // successive cosi' il backend aggiorna la stessa riga in
  // `page_guide_conversations` invece di crearne una nuova ad ogni messaggio.
  const [conversationId, setConversationId] = useState<string | null>(null)

  // FIX 02/05/2026: auth check server-side affidabile.
  // Deferred: parte solo quando l'utente apre il pannello.
  // Il vecchio approccio importava dinamicamente Supabase JS e falliva in
  // diversi ambienti (preview, dominio Vercel custom, ecc.) lasciando
  // `isAuthenticated=false` anche per utenti loggati. Ora /api/page-guide/whoami
  // legge i cookie HttpOnly server-side e ritorna firstName affidabilmente.
  useEffect(() => {
    if (!isOpen || authChecked) return

    // Cache di sessione per non ripetere la fetch a ogni apertura.
    const cached = sessionStorage.getItem("page-guide-user")
    if (cached) {
      try {
        const data = JSON.parse(cached)
        if (data.authenticated) {
          setIsAuthenticated(true)
          setUserName(data.firstName || "")
          setLeadCaptured(true)
        }
        setAuthChecked(true)
        return
      } catch {
        /* fall through */
      }
    }

    let cancelled = false
    fetch("/api/page-guide/whoami", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((data) => {
        if (cancelled) return
        if (data?.authenticated) {
          const firstName = String(data.firstName || "")
          sessionStorage.setItem(
            "page-guide-user",
            JSON.stringify({ authenticated: true, firstName }),
          )
          setIsAuthenticated(true)
          setUserName(firstName)
          setLeadCaptured(true)
        }
        setAuthChecked(true)
      })
      .catch(() => {
        if (!cancelled) setAuthChecked(true)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, authChecked])

  useEffect(() => {
    setGuide(getPageGuide(pathname))
    setChatMessages([])
    setUncertainSaved(false)
    setResponseCount(0)
    // Cambio pagina = nuova conversazione lato DB. Reset cosi' il prossimo
    // POST crea una nuova riga con il page_path corretto.
    setConversationId(null)
  }, [pathname])

  // Register handler for opening from header
  useEffect(() => {
    setOpenGuideHandler(() => setIsOpen(true))
    return () => setOpenGuideHandler(() => {})
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  useEffect(() => {
    if (isOpen && inputRef.current && !needsLeadCapture) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen, needsLeadCapture])

  const handleLeadSubmit = useCallback(() => {
    const name = leadName.trim()
    const email = leadEmail.trim()
    if (!name || !email) {
      setLeadError("Inserisci nome e email per continuare")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLeadError("Inserisci un indirizzo email valido")
      return
    }
    setLeadError("")
    setLeadCaptured(true)
    setNeedsLeadCapture(false)

    // Save lead + conversation to backend
    fetch("/api/page-guide/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        pathname,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    }).catch(() => {})
  }, [leadName, leadEmail, chatMessages, pathname])

  const handleSend = useCallback(async () => {
    const q = input.trim()
    if (!q || isLoading) return

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: q }]
    setChatMessages(newMessages)
    setInput("")
    setIsLoading(true)
    setUncertainSaved(false)

    try {
      const res = await fetch("/api/page-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathname,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          leadName: leadCaptured ? leadName : undefined,
          leadEmail: leadCaptured ? leadEmail : undefined,
          conversationId, // null al primo messaggio, valorizzato dopo
        }),
      })

      if (!res.ok) throw new Error("API error")

      // FIX 02/05/2026: il server ritorna l'id della conversazione DB nello
      // header `x-conversation-id`. Salvalo cosi' i prossimi messaggi
      // aggiornano la stessa riga (no spam di righe per la stessa chat).
      const serverConvId = res.headers.get("x-conversation-id")
      if (serverConvId && serverConvId !== conversationId) {
        setConversationId(serverConvId)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No reader")

      const decoder = new TextDecoder()
      let fullContent = ""
      let buffer = ""

      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith("d:")) {
            try {
              const data = JSON.parse(trimmed.slice(2))
              if (typeof data === "string") {
                fullContent += data
                const currentContent = fullContent
                setChatMessages((prev) => {
                  const msgs = [...prev]
                  msgs[msgs.length - 1] = { role: "assistant", content: currentContent }
                  return msgs
                })
              }
            } catch {}
          } else if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim()
            if (data === "[DONE]") break
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === "text-delta" && parsed.delta) {
                fullContent += parsed.delta
                const currentContent = fullContent
                setChatMessages((prev) => {
                  const msgs = [...prev]
                  msgs[msgs.length - 1] = { role: "assistant", content: currentContent }
                  return msgs
                })
              }
            } catch {}
          }
        }
      }

      // Track responses and check lead capture
      const newCount = responseCount + 1
      setResponseCount(newCount)

      // FIX 02/05/2026: il lead capture (chiedi nome+email dopo la prima
      // risposta) deve scattare SOLO sulle pagine pubbliche (front-end).
      // Sulle pagine private (/dati, /dashboard, /accelerator, ecc.)
      // l'utente e' loggato e identificato via /api/page-guide/whoami,
      // quindi e' un disturbo inutile.
      const isPrivateAppPage = PRIVATE_APP_PATHS.some((p) => pathname.startsWith(p))
      if (newCount >= 1 && !isAuthenticated && !leadCaptured && !isPrivateAppPage) {
        setNeedsLeadCapture(true)
      }

      // Check if AI is uncertain
      if (fullContent.includes("[UNCERTAIN]")) {
        const cleanContent = fullContent.replace("[UNCERTAIN]", "").trim()
        setChatMessages((prev) => {
          const msgs = [...prev]
          msgs[msgs.length - 1] = { role: "assistant", content: cleanContent }
          return msgs
        })

        try {
          await fetch("/api/page-guide/uncertain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pathname,
              question: q,
              aiAnswer: cleanContent,
              leadName: leadCaptured ? leadName : undefined,
              leadEmail: leadCaptured ? leadEmail : undefined,
            }),
          })
          setUncertainSaved(true)
        } catch {}
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Mi dispiace, si e' verificato un errore. Riprova tra qualche istante." },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, chatMessages, pathname, responseCount, leadCaptured, leadName, leadEmail])

  // Hide only on auth/onboarding/root
  const isHidden = HIDDEN_PATHS.some((p) => pathname.startsWith(p))
  if (isHidden) {
    return null
  }

  // FIX 02/05/2026 (richiesta utente): il FAB flottante deve apparire SOLO
  // sulle pagine pubbliche (homepage, landing, marketing). Sulle pagine app
  // autenticate (/dati, /dashboard, /accelerator, ...) il trigger della
  // guida vive nell'header tramite `PageGuideHeaderButton`, quindi il FAB
  // sarebbe duplicato. Il pannello pero' resta montato per ricevere il
  // segnale `triggerOpenGuide()` dall'header.
  const isPrivateAppPage = PRIVATE_APP_PATHS.some((p) => pathname.startsWith(p))

  // FIX 06/06/2026: nella DEMO il widget in basso a destra deve essere il
  // RevMentor VERDE (DemoTaddeoWidget, montato dal DemoShell), non il FAB
  // blu della guida. Sopprimiamo qui il FAB blu su /demo.
  const isDemo = pathname === "/demo" || pathname.startsWith("/demo/")

  return (
    <>
      {/* Floating Action Button — solo su pagine pubbliche (NO header app, NO demo). */}
      {!isOpen && !isPrivateAppPage && !isDemo && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Apri guida interattiva"
          title="Guida interattiva"
          className="fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl hover:scale-105 active:scale-95"
        >
          <HelpCircle className="h-6 w-6" />
        </button>
      )}

      {/* Overlay + Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-[10000]">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" onClick={() => setIsOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center gap-3 border-b px-5 py-4 bg-gradient-to-r from-blue-50 to-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-foreground truncate">
                  {guide?.title || "Guida SANTADDEO"}
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {guide ? pathname : "Chiedi qualsiasi cosa sul revenue e la piattaforma"}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Guide Section */}
              {guide && (
                <div className="p-5 border-b">
                  {isAuthenticated && userName && (
                    <p className="text-sm font-medium text-blue-600 mb-2">
                      {`Ciao ${userName}!`}
                    </p>
                  )}
                  <p className="text-sm text-foreground leading-relaxed mb-4">
                    {guide.description}
                  </p>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {"Funzionalita'"}
                    </h3>
                    {guide.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!guide && chatMessages.length === 0 && (
                <div className="p-5 border-b">
                  <p className="text-sm text-foreground leading-relaxed">
                    {isAuthenticated && userName
                      ? `Ciao ${userName}! Come posso aiutarti? Puoi chiedermi qualsiasi cosa su:`
                      : "Benvenuto nella guida SANTADDEO. Puoi chiedermi qualsiasi cosa su:"}
                  </p>
                  <div className="space-y-2 mt-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm">Revenue Management e strategie di pricing</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm">Come funziona la piattaforma SANTADDEO</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm">KPI alberghieri (RevPAR, ADR, Occupancy...)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm">Piani e funzionalita' disponibili</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Chat Section */}
              <div className="p-5">
                {chatMessages.length === 0 && (
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Fai una domanda
                  </h3>
                )}

                {/* Messages */}
                <div className="space-y-3 mb-4">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {msg.content || (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Sto pensando...
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {uncertainSaved && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">
                        {"La tua domanda e' stata inoltrata al team SANTADDEO per una risposta completa."}
                      </p>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>
            </div>

            {/* Lead Capture Gate */}
            {needsLeadCapture && !leadCaptured && (
              <div className="border-t p-5 bg-blue-50">
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-5 w-5 text-blue-600" />
                  <p className="text-sm font-semibold text-foreground">
                    Per continuare, dicci chi sei
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {"Inserisci il tuo nome e la tua email per continuare la conversazione. Un nostro esperto potra' ricontattarti per approfondire."}
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder="Il tuo nome"
                    className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="La tua email"
                    className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => { if (e.key === "Enter") handleLeadSubmit() }}
                  />
                  {leadError && (
                    <p className="text-xs text-red-600">{leadError}</p>
                  )}
                  <Button onClick={handleLeadSubmit} className="w-full bg-blue-600 hover:bg-blue-700">
                    Continua
                  </Button>
                </div>
              </div>
            )}

            {/* Input - hide when lead capture needed */}
            {(!needsLeadCapture || leadCaptured) && (
              <div className="border-t p-4 bg-white">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSend()
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Scrivi una domanda..."
                    className="flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || isLoading}
                    className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 shrink-0"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
