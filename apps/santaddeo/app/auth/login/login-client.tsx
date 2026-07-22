"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { useState, useRef, useEffect } from "react"
import { AlertCircle, Eye, EyeOff, Zap, CheckCircle2 } from "lucide-react"
import { AppFooter } from "@/components/layout/app-footer"
import Image from "next/image"
// NOTE: NO top-level import of @/lib/supabase/client
// This prevents v0 bundler from pre-loading @supabase/auth-js which causes GoTrueClient._getUser() side effects
import { useSearchParams, useRouter } from "next/navigation"

export function LoginPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justVerified = searchParams?.get("verified") === "1"
  const inviteAccepted = searchParams?.get("invite_accepted") === "1"
  const inviteToken = searchParams?.get("invite") ?? null
  const inviteHotel = searchParams?.get("invite_hotel") ?? null

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const mountedRef = useRef(true)

  // isDev: Show quick login buttons only in development/preview environments
  // This includes localhost, v0.dev preview, and vercel preview deployments
  // MUST use useState + useEffect to avoid hydration mismatch (server has no window)
  const [isDev, setIsDev] = useState(false)

  useEffect(() => {
    // Compute isDev only on client after mount to prevent hydration mismatch
    // SECURITY: vercel.app is PRODUCTION, never show dev buttons there
    const hostname = window.location.hostname.toLowerCase()
    const isProd = hostname.includes("vercel.app")
    const isDevEnv = (
      hostname === "localhost" ||
      hostname.includes("vusercontent.net")
    ) && !isProd
    setIsDev(isDevEnv)

    return () => {
      mountedRef.current = false
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsPending(true)

    try {
      // Always use browser Supabase client (both production and v0 preview).
      // Server-side Set-Cookie headers don't propagate in v0 sandbox iframe,
      // but the browser Supabase client sets cookies directly in the browser.
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (!mountedRef.current) return

      if (authError) {
        let errorMessage = "Credenziali non valide"
        if (authError.message?.includes("Invalid login credentials")) {
          errorMessage = "Email o password non corretti. Verifica le credenziali o registrati se non hai un account."
        } else if (authError.message?.includes("Email not confirmed")) {
          errorMessage = "Email non ancora verificata. Controlla la tua casella di posta."
        } else if (authError.message) {
          errorMessage = authError.message
        }
        setError(errorMessage)
        setIsPending(false)
        return
      }

      if (!data.user) {
        setError("Risposta non valida dal server")
        setIsPending(false)
        return
      }

      fetch("/api/auth/post-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id }),
      }).catch(() => {})

      if (inviteToken) {
        try {
          const acceptRes = await fetch("/api/team/invite/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: inviteToken }),
          })
          await acceptRes.json()
        } catch {
          // Invite accept failed, user can retry from dashboard
        }
      }

      // Determine the correct landing page server-side. Users who are BOTH a
      // sales agent AND have tenant (property) access are sent to the workspace
      // selector (/auth/choose-profile); everyone else goes straight to their area.
      let destination = "/dashboard"
      try {
        // Passiamo l'access token nell'header: subito dopo il login i cookie
        // server potrebbero non essere ancora propagati (race), quindi il token
        // garantisce che /resolve-landing identifichi l'utente in modo affidabile.
        const accessToken = data.session?.access_token
        const res = await fetch("/api/auth/resolve-landing", {
          cache: "no-store",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        })
        if (res.ok) {
          const data = await res.json()
          if (data?.path) destination = data.path
        }
      } catch {
        // fallback to /dashboard
      }

      // Use window.location for a full page load so the middleware picks up the
      // session cookies set by the browser Supabase client.
      window.location.href = destination
    } catch (err) {
      if (!mountedRef.current) return
      console.error("Login error:", err)
      setError("Errore di connessione al server")
      setIsPending(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    setIsPending(true)
    try {
      // Use the server-side /auth/google route for Google OAuth.
      // This ensures PKCE code_verifier is stored in httpOnly cookies
      // (not localStorage), which prevents bad_oauth_state errors.
      window.location.href = "/auth/google"
    } catch (err) {
      console.error("[v0] Google login error:", err)
      setError("Errore durante l'accesso con Google")
      setIsPending(false)
    }
  }

  const handleQuickLogin = (testEmail: string, testPassword: string) => {
    // Set the email and password in the form
    setEmail(testEmail)
    setPassword(testPassword)
    
    // Trigger the regular form submission after state update
    // Use setTimeout to wait for React to flush the state
    setTimeout(() => {
      const form = document.querySelector('form')
      if (form) form.submit()
    }, 0)
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
            <CardTitle className="text-2xl">Accedi</CardTitle>
            <CardDescription>Inserisci le tue credenziali per accedere al sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {inviteToken && (
              <Alert className="mb-4 border-blue-200 bg-blue-50">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  Hai un invito per <strong>{inviteHotel ? decodeURIComponent(inviteHotel) : "una nuova struttura"}</strong>. Accedi con le tue credenziali per accettarlo automaticamente.
                </AlertDescription>
              </Alert>
            )}
            {inviteAccepted && (
              <Alert className="mb-4 border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Invito accettato con successo! La nuova struttura e' stata aggiunta al tuo account. Accedi con le tue credenziali.
                </AlertDescription>
              </Alert>
            )}
            {justVerified && (
              <Alert className="mb-4 border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Registrazione completata con successo! Accedi con le credenziali appena create.
                </AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleLogin}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@hotel.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isPending}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      disabled={isPending}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Accesso in corso..." : "Accedi"}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">oppure</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 py-2 w-full rounded-md border border-input bg-transparent text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  {isPending ? "Accesso in corso..." : "Accedi con Google"}
                </button>

              </div>

              <div className="mt-4 text-center text-sm">
                <Link href="/auth/forgot-password" className="font-medium text-blue-600 hover:text-blue-700 underline">
                  Password dimenticata?
                </Link>
              </div>

              <div className="mt-6 text-center text-sm">
                Non hai un account?{" "}
                <Link href="/auth/sign-up" className="font-medium text-blue-600 hover:text-blue-700 underline">
                  Registrati
                </Link>
              </div>
            </form>

            {/* Dev bypass: skip login entirely, dashboard uses dev user */}
            {isDev && (
              <div className="space-y-2 pt-4 mt-4 border-t border-border">
                <p className="text-xs text-muted-foreground text-center mb-2 font-semibold">
                  Dev Bypass (no auth needed)
                </p>
                
                <button
                  type="button"
                  onClick={() => {
                    // In sandbox, middleware + dashboard-content bypass auth entirely.
                    // No need to login with Supabase - just navigate to dashboard.
                    window.location.href = "/dashboard"
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors w-full"
                >
                  <Zap className="h-3 w-3" />
                  Vai alla Dashboard (Dev User)
                </button>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
      <AppFooter />
    </div>
  )
}
