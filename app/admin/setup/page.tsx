"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock, Mail, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function AdminSetupPage() {
  const [name, setName] = useState("Filippo Mancini")
  const [email, setEmail] = useState("f.mancini@ibarronci.com")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Validazione email
    if (email !== "f.mancini@ibarronci.com") {
      setError("Solo l'email f.mancini@ibarronci.com può completare il setup iniziale")
      return
    }

    // Validazione password
    if (password.length < 8) {
      setError("La password deve essere almeno 8 caratteri")
      return
    }

    if (password !== confirmPassword) {
      setError("Le password non corrispondono")
      return
    }

    setIsLoading(true)

    try {
      // Cleanup any existing auth users with this email
      console.log("[v0] Cleaning up any existing users...")
      await fetch("/api/admin/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })

      console.log("[v0] Creating new super admin...")
      const response = await fetch("/api/admin/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, name }),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error("[v0] Setup error:", data.error)
        setError(data.error || "Errore durante il setup")
        setIsLoading(false)
        return
      }

      console.log("[v0] Super Admin created successfully!")
      // Successo - reindirizza al login
      alert("Super Admin creato con successo! Ora puoi fare il login.")
      router.push("/admin")
    } catch (err) {
      console.error("[v0] Setup error:", err)
      setError("Si è verificato un errore durante il setup")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-amber-700" />
            </div>
            <h1 className="text-2xl font-serif text-stone-800">Setup Iniziale</h1>
            <p className="text-stone-600 mt-2">Crea il Super Admin</p>
          </div>

          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Nome Completo</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  placeholder="Il tuo nome"
                  required
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
                  placeholder="f.mancini@ibarronci.com"
                  required
                  disabled
                />
              </div>
              <p className="text-xs text-stone-500 mt-1">Solo questa email può completare il setup</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  placeholder="Minimo 8 caratteri"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Conferma Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  placeholder="Ripeti la password"
                  required
                  minLength={8}
                />
              </div>
            </div>

            {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creazione in corso...
                </span>
              ) : (
                "Crea Super Admin"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-amber-700 hover:underline">
              Torna al sito
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
