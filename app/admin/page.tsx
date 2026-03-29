"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Lock, Mail } from "lucide-react"

export default function AdminPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const hostname = window.location.hostname
      const isDevOrPreview =
        hostname.includes("vercel.run") ||
        hostname.includes("localhost") ||
        hostname.includes("127.0.0.1") ||
        hostname.includes("vusercontent.net")

      if (isDevOrPreview) {
        router.replace("/admin/dashboard")
        return
      }

      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          // User is authenticated, check if they are in admin_users
          const { data: adminData } = await supabase
            .from("admin_users")
            .select("id")
            .eq("id", user.id)
            .single()

          if (adminData) {
            router.replace("/admin/dashboard")
            return
          } else {
            // Not an admin user - sign out
            await supabase.auth.signOut()
          }
        }
      } catch (err) {
        console.error("Auth check error:", err)
      }

      // Not authenticated - show login form
      setChecking(false)
    }

    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError("Email o password non validi")
        setIsLoading(false)
        return
      }

      // Check if user is in admin_users
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: adminData } = await supabase
          .from("admin_users")
          .select("id")
          .eq("id", user.id)
          .single()

        if (adminData) {
          router.replace("/admin/dashboard")
        } else {
          await supabase.auth.signOut()
          setError("Account non autorizzato come admin")
          setIsLoading(false)
        }
      }
    } catch (err) {
      setError("Errore durante il login")
      setIsLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Admin Login</h1>
          <p className="text-sm text-muted-foreground">Accedi al pannello di amministrazione</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Accesso in corso..." : "Accedi"}
          </Button>
        </form>


      </div>
    </div>
  )
}


