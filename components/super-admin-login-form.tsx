"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Lock, Eye, EyeOff, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

export default function SuperAdminLoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setIsClient(true)
  }, [])

  const getSupabase = () => {
    if (!isClient) return null
    return createClient()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    console.log("[v0] Super Admin login started with email:", email)

    const supabase = getSupabase()
    if (!supabase) {
      console.log("[v0] Supabase client is null")
      setError("Errore di configurazione")
      setIsLoading(false)
      return
    }

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
      console.log("[v0] Checking platform_collaborators table...")

      const { data: collaborator, error: collaboratorError } = await supabase
        .from("platform_collaborators")
        .select("*")
        .eq("email", data.user.email)
        .single()

      console.log("[v0] platform_collaborators query result:", { collaborator, collaboratorError })

      if (collaboratorError || !collaborator) {
        console.log("[v0] User not a platform collaborator:", collaboratorError?.message)
        setError("Accesso non autorizzato. Solo i super admin della piattaforma possono accedere.")
        await supabase.auth.signOut()
        setIsLoading(false)
        return
      }

      if (collaborator.role !== "super_admin") {
        console.log("[v0] User is not super admin:", collaborator.role)
        setError("Accesso non autorizzato. Ruolo super admin richiesto.")
        await supabase.auth.signOut()
        setIsLoading(false)
        return
      }

      if (!collaborator.is_active) {
        console.log("[v0] User account is suspended")
        setError("Account sospeso. Contatta l'amministratore di sistema.")
        await supabase.auth.signOut()
        setIsLoading(false)
        return
      }

      console.log("[v0] Super admin authorized:", collaborator)
      console.log("[v0] Redirecting to /super-admin...")

      await supabase
        .from("platform_collaborators")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", collaborator.id)

      // Redirect to super admin dashboard
      window.location.href = "/super-admin"
    } catch (err) {
      console.error("[v0] Login error:", err)
      setError("Si è verificato un errore durante l'accesso")
      setIsLoading(false)
    }
  }

  if (!isClient) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-1">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
            placeholder="La tua email"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-1">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10 pr-10 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
            placeholder="La tua password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-3 rounded-lg text-sm">{error}</div>
      )}

      <Button
        type="submit"
        className="w-full bg-amber-500 hover:bg-amber-600 text-neutral-900 font-medium"
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
            Accesso in corso...
          </span>
        ) : (
          "Accedi come Super Admin"
        )}
      </Button>

      <p className="text-xs text-neutral-500 text-center mt-4">
        Solo i super amministratori della piattaforma possono accedere
      </p>
    </form>
  )
}
