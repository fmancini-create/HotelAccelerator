"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, Suspense } from "react"
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react"
import { AppFooter } from "@/components/layout/app-footer"

const PWD_MIN = 8

// Next.js 16 richiede che useSearchParams() sia dentro un Suspense boundary
// per consentire il prerender della pagina. Wrap minimale del componente
// originale, fallback inline (la pagina e' tutta lato client comunque).
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageInner />
    </Suspense>
  )
}

function ResetPasswordPageInner() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // Tre stati: "checking" (in attesa hash processing), "valid" (sessione recovery
  // pronta), "invalid" (timeout o nessuna sessione). Evita race condition con il
  // setTimeout finto-errore della vecchia versione.
  const [sessionState, setSessionState] = useState<"checking" | "valid" | "invalid">("checking")
  const router = useRouter()
  const searchParams = useSearchParams()

  // Se la magic-link include `?setup=1` (welcome venditore) cambiamo copy:
  // prima volta che imposta una password, non un reset di una preesistente.
  const isSetup = searchParams?.get("setup") === "1"
  // `next` indica dove andare dopo il reset. Sanity-check: solo path interni
  // ("/...") per evitare open redirect via querystring.
  const rawNext = searchParams?.get("next") || ""
  const safeNext = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : ""

  useEffect(() => {
    // Verifica sessione recovery via API server-side /api/auth/me, NON via
    // browser client.
    //
    // Storico (bug 03/05/2026): /lib/supabase/client.ts (browser) e
    // /lib/supabase/server.ts (SSR) usavano storageKey diversi
    // ("sb-santaddeo-auth" vs "sb-aeynirkfixurikshxfov-auth-token").
    // Risultato: /auth/confirm scriveva i cookie con la chiave SSR via
    // verifyOtp, ma getSession() del browser client cercava cookie con
    // l'altro prefisso e dichiarava sempre "no session" → l'utente
    // vedeva sempre "Link scaduto" anche con sessione valida.
    //
    // Soluzione: chiamiamo /api/auth/me che usa il client SSR (stessa
    // storageKey del cookie scritto da /auth/confirm). Server-to-server
    // garantito.
    let cancelled = false

    const check = async (): Promise<boolean> => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        })
        if (cancelled) return false
        if (!res.ok) return false
        const j = await res.json().catch(() => ({}))
        return !!j?.user
      } catch {
        return false
      }
    }

    ;(async () => {
      // Tentativo immediato (caso normale: arrivo da /auth/confirm).
      if (await check()) {
        if (!cancelled) setSessionState("valid")
        return
      }
      // Retry dopo 1.2s per gestire eventuale latenza nella propagazione
      // dei cookie (es. flow legacy con fragment #access_token=, dove il
      // browser client deve prima processarlo).
      await new Promise((r) => setTimeout(r, 1200))
      if (cancelled) return
      if (await check()) {
        setSessionState("valid")
        return
      }
      // Ultimo retry dopo altri 2s (margine di sicurezza per reti lente).
      await new Promise((r) => setTimeout(r, 2000))
      if (cancelled) return
      if (await check()) {
        setSessionState("valid")
        return
      }
      setSessionState("invalid")
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Validazione client (allineata al server: PWD_MIN=8 + lettera + numero)
    if (password.length < PWD_MIN) {
      setError(`La password deve essere di almeno ${PWD_MIN} caratteri`)
      setIsLoading(false)
      return
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("La password deve contenere almeno una lettera e un numero")
      setIsLoading(false)
      return
    }
    if (password !== confirmPassword) {
      setError("Le password non coincidono")
      setIsLoading(false)
      return
    }

    try {
      // Chiamata al nostro endpoint server-side: la sessione recovery e' nei
      // cookie httpOnly che il browser invia automaticamente. Server-side
      // valida + esegue updateUser + audit log.
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (data?.code === "no_session") {
          setError(data.error || "Sessione scaduta. Richiedi un nuovo link.")
          setSessionState("invalid")
        } else {
          setError(data?.error || "Errore durante il reset della password")
        }
        return
      }

      setSuccess(true)
      // Se c'e' un `?next=` (es. `/sales` per il welcome agent), dopo il
      // submit della nuova password la sessione recovery e' diventata
      // full session: andiamo direttamente la' senza passare dalla login.
      // Altrimenti torniamo alla pagina di login con l'avviso classico.
      const target = safeNext || "/auth/login?passwordReset=1"
      setTimeout(() => {
        router.push(target)
      }, 1500)
    } catch {
      setError("Errore di connessione. Riprova.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <img src="/logo-santaddeo.png" alt="SANTADDEO" width={120} height={36} className="mx-auto" />
          </Link>
          <p className="mt-2 text-muted-foreground">Revenue Management System</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {isSetup ? "Imposta la tua password" : "Reimposta Password"}
            </CardTitle>
            <CardDescription>
              {isSetup
                ? "Scegli una password personale per accedere al portale venditori SANTADDEO."
                : "Inserisci la tua nuova password"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    {safeNext
                      ? "Password impostata. Ti porto alla tua area..."
                      : "Password reimpostata con successo! Verrai reindirizzato al login..."}
                  </AlertDescription>
                </Alert>
              </div>
            ) : sessionState === "checking" ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
                <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                Verifica del link in corso...
              </div>
            ) : sessionState === "invalid" ? (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Link non valido o scaduto. Richiedi un nuovo link di recupero password.
                  </AlertDescription>
                </Alert>
                <div className="text-center">
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 underline"
                  >
                    Richiedi nuovo link
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="password">Nuova Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        className="pr-10"
                        minLength={PWD_MIN}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={isLoading}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Minimo {PWD_MIN} caratteri, almeno una lettera e un numero.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">Conferma Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isLoading}
                        className="pr-10"
                        minLength={PWD_MIN}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={isLoading}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading
                      ? isSetup
                        ? "Salvataggio in corso..."
                        : "Reimpostazione in corso..."
                      : isSetup
                        ? "Imposta password e accedi"
                        : "Reimposta Password"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
      <AppFooter />
    </div>
  )
}
