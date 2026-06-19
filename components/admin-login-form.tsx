"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Lock, Eye, EyeOff, Mail, ArrowLeft, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { authorizeUser } from "@/lib/auth/authorize-user"

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

type FormMode = "login" | "register" | "recovery"

// Hostnames where the v0 preview / local dev should skip real auth. NOTE: this
// intentionally excludes "vercel.app" so production-like deploys are never bypassed.
function isDevOrPreviewHost(): boolean {
  if (typeof window === "undefined") return false
  const h = window.location.hostname
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.includes("vercel.run") ||
    h.includes("vusercontent.net")
  )
}

export default function AdminLoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [mode, setMode] = useState<FormMode>("login")
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    // Surface the "unauthorized" outcome from the Google OAuth callback.
    const params = new URLSearchParams(window.location.search)
    if (params.get("error") === "unauthorized") {
      setError("Questo account Google non è autorizzato ad accedere.")
    } else if (params.get("error") === "oauth") {
      setError("Accesso con Google non riuscito. Riprova.")
    }
  }, [])

  const getSupabase = () => {
    if (!isClient) return null
    return createClient()
  }

  const resetForm = () => {
    setError("")
    setSuccess("")
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    // DEV/PREVIEW BYPASS: the v0 preview has no real session, so go straight in.
    if (isDevOrPreviewHost()) {
      window.location.href = "/admin/dashboard"
      return
    }

    const supabase = getSupabase()
    if (!supabase) {
      setError("Errore di configurazione")
      setIsLoading(false)
      return
    }

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError || !data.user) {
        setError("Credenziali non valide")
        setIsLoading(false)
        return
      }

      const result = await authorizeUser(supabase, data.user)

      if (result.authorized) {
        window.location.href = result.destination
        return
      }

      setError("Utente non autorizzato")
      await supabase.auth.signOut()
      setIsLoading(false)
    } catch (err) {
      console.error("[v0] Login error:", err)
      setError("Si è verificato un errore durante l'accesso")
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError("")

    // In dev/preview there is no real OAuth session; skip straight to the app.
    if (isDevOrPreviewHost()) {
      window.location.href = "/admin/dashboard"
      return
    }

    const supabase = getSupabase()
    if (!supabase) {
      setError("Errore di configurazione")
      return
    }

    setGoogleLoading(true)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (oauthError) {
      setError("Accesso con Google non riuscito. Riprova.")
      setGoogleLoading(false)
    }
    // On success the browser is redirected to Google, so no further state needed.
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    const supabase = getSupabase()
    if (!supabase) {
      setError("Errore di configurazione")
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError("La password deve essere di almeno 6 caratteri")
      setIsLoading(false)
      return
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/admin`,
          data: {
            name: name || email.split("@")[0],
          },
        },
      })

      if (signUpError) {
        setError(`Errore: ${signUpError.message}`)
        setIsLoading(false)
        return
      }

      if (data.user) {
        setSuccess("Registrazione completata! Controlla la tua email per confermare l'account.")
      }

      setIsLoading(false)
    } catch (err) {
      console.error("[v0] Registration error:", err)
      setError("Si è verificato un errore durante la registrazione")
      setIsLoading(false)
    }
  }

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    const supabase = getSupabase()
    if (!supabase) {
      setError("Errore di configurazione")
      setIsLoading(false)
      return
    }

    if (!email) {
      setError("Inserisci la tua email")
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      })

      if (error) {
        setError(`Errore: ${error.message}`)
        setIsLoading(false)
        return
      }

      setSuccess("Ti abbiamo inviato un'email con le istruzioni per reimpostare la password")
      setIsLoading(false)
    } catch (err) {
      console.error("[v0] Password recovery error:", err)
      setError("Si è verificato un errore")
      setIsLoading(false)
    }
  }

  if (!isClient) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="w-6 h-6 border-2 border-amber-700 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (mode === "register") {
    return (
      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Nome</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pl-10"
              placeholder="Il tuo nome"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              placeholder="La tua email"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-10"
              placeholder="Minimo 6 caratteri"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">{success}</div>}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Registrazione...
            </span>
          ) : (
            "Registrati"
          )}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode("login")
            resetForm()
          }}
          className="w-full text-sm text-stone-600 hover:text-stone-800 flex items-center justify-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Torna al login
        </button>
      </form>
    )
  }

  if (mode === "recovery") {
    return (
      <form onSubmit={handlePasswordRecovery} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              placeholder="La tua email"
              required
            />
          </div>
          <p className="text-xs text-stone-500 mt-1">Inserisci l'email associata al tuo account</p>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">{success}</div>}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Invio in corso...
            </span>
          ) : (
            "Invia email di recupero"
          )}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode("login")
            resetForm()
          }}
          className="w-full text-sm text-stone-600 hover:text-stone-800 flex items-center justify-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Torna al login
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
            placeholder="La tua email"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10 pr-10"
            placeholder="La tua password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Accesso in corso...
          </span>
        ) : (
          "Accedi"
        )}
      </Button>

      <div className="relative flex items-center py-1" aria-hidden="true">
        <div className="flex-grow border-t border-stone-200" />
        <span className="mx-3 text-xs text-stone-400">oppure</span>
        <div className="flex-grow border-t border-stone-200" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full bg-transparent"
        onClick={handleGoogleLogin}
        disabled={googleLoading || isLoading}
      >
        {googleLoading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
            Reindirizzamento...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <GoogleIcon className="w-5 h-5" />
            Continua con Google
          </span>
        )}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setMode("register")
            resetForm()
          }}
          className="text-amber-700 hover:underline"
        >
          Registrati
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("recovery")
            resetForm()
          }}
          className="text-stone-600 hover:underline"
        >
          Password dimenticata?
        </button>
      </div>
    </form>
  )
}
