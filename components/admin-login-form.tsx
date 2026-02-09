"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Lock, Eye, EyeOff, Mail, ArrowLeft, User, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

type FormMode = "login" | "register" | "recovery"

const DEV_CREDENTIALS = {
  admin: {
    email: "f.mancini@ibarronci.com",
    password: "Pippolo75@",
  },
  superAdmin: {
    email: "f.mancini@4bid.it",
    password: "Pippolo75@",
  },
}

export default function AdminLoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<FormMode>("login")
  const [isClient, setIsClient] = useState(false)
  const [isDevEnvironment, setIsDevEnvironment] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setIsClient(true)
    const hostname = window.location.hostname
    const isDev =
      hostname === "localhost" ||
      hostname.includes("preview") ||
      hostname.includes("vercel.app") ||
      hostname.includes("vusercontent.net") ||
      process.env.NODE_ENV === "development"
    setIsDevEnvironment(isDev)
  }, [])

  const handleQuickLogin = () => {
    setEmail(DEV_CREDENTIALS.admin.email)
    setPassword(DEV_CREDENTIALS.admin.password)
  }

  const handleQuickLoginSuperAdmin = () => {
    setEmail(DEV_CREDENTIALS.superAdmin.email)
    setPassword(DEV_CREDENTIALS.superAdmin.password)
  }

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

    console.log("[v0] Login started with email:", email)

    const supabase = getSupabase()
    if (!supabase) {
      console.log("[v0] Supabase client is null")
      setError("Errore di configurazione")
      setIsLoading(false)
      return
    }

    console.log("[v0] Supabase client created, attempting signInWithPassword")

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log("[v0] signInWithPassword response:", { data, error: signInError })

      if (signInError) {
        console.log("[v0] Login error:", signInError.message)
        setError("Credenziali non valide")
        setIsLoading(false)
        return
      }

      if (!data.user) {
        console.log("[v0] No user in response")
        setError("Errore durante l'accesso")
        setIsLoading(false)
        return
      }

      console.log("[v0] User authenticated:", data.user.id)

      console.log("[v0] Checking admin_users table...")
      const { data: adminUser, error: adminError } = await supabase
        .from("admin_users")
        .select("*")
        .eq("id", data.user.id)
        .single()

      console.log("[v0] admin_users query result:", { adminUser, adminError })

      if (adminUser) {
        console.log("[v0] Admin user found:", adminUser)
        console.log("[v0] Redirecting to /admin/dashboard...")
        window.location.href = "/admin/dashboard"
        return
      }

      console.log("[v0] User not in admin_users, checking platform_collaborators...")
      const { data: collaborator, error: collaboratorError } = await supabase
        .from("platform_collaborators")
        .select("*")
        .eq("email", data.user.email)
        .single()

      console.log("[v0] platform_collaborators query result:", { collaborator, collaboratorError })

      if (collaborator && collaborator.role === "super_admin" && collaborator.is_active) {
        console.log("[v0] Super admin found:", collaborator)

        // Update last login
        await supabase
          .from("platform_collaborators")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", collaborator.id)

        console.log("[v0] Redirecting to /super-admin...")
        window.location.href = "/super-admin"
        return
      }

      console.log("[v0] User not authorized in admin_users or platform_collaborators")
      setError("Utente non autorizzato")
      await supabase.auth.signOut()
      setIsLoading(false)
    } catch (err) {
      console.error("[v0] Login error:", err)
      setError("Si è verificato un errore durante l'accesso")
      setIsLoading(false)
    }
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
      {isDevEnvironment && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-amber-700 mb-2 font-medium">Accesso rapido (solo dev/preview)</p>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleQuickLogin}
              className="w-full border-green-300 text-green-700 hover:bg-green-100 bg-transparent"
            >
              <Zap className="w-4 h-4 mr-2" />
              Admin Villa I Barronci
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleQuickLoginSuperAdmin}
              className="w-full border-amber-300 text-amber-700 hover:bg-amber-100 bg-transparent"
            >
              <Zap className="w-4 h-4 mr-2" />
              Super Admin
            </Button>
          </div>
        </div>
      )}

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
