"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Lock, Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // null = ancora in verifica, true/false = esito presenza sessione di recovery
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const router = useRouter()

  // Aprire il link di recupero crea una sessione Supabase valida a tutti gli
  // effetti, anche se la password non è stata ancora cambiata. Senza signOut,
  // /admin trova quella sessione, chiama authorizeUser e reindirizza alla
  // dashboard: l'utente entrerebbe senza aver mai completato il recupero.
  // Va quindi chiusa PRIMA di tornare al login.
  const handleBackToLogin = async () => {
    if (isLeaving) return
    setIsLeaving(true)

    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch (err) {
      // Se non c'è nessuna sessione da chiudere (link scaduto) signOut può
      // fallire: non è un problema, l'obiettivo è comunque uscire.
      console.error("[v0] signOut on cancel failed:", err)
    }

    // replace (non push) per non lasciare la pagina di reset nella cronologia,
    // e ricarica completa così /admin rivaluta l'auth da zero.
    window.location.replace("/admin")
  }

  useEffect(() => {
    const supabase = createClient()

    // Il client (@supabase/ssr, PKCE) scambia automaticamente il code/hash
    // presente nell'URL del link di recupero e crea la sessione. Verifichiamo
    // che ci sia, così possiamo mostrare un messaggio chiaro se il link è
    // scaduto o assente invece di far fallire updateUser con errore generico.
    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true)
      }
    })

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setHasRecoverySession((prev) => (prev === null ? Boolean(data.session) : prev))
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    if (password.length < 8) {
      setError("La password deve essere di almeno 8 caratteri")
      setIsLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError("Le password non corrispondono")
      setIsLoading(false)
      return
    }

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) {
        setError("Errore nel reimpostare la password. Il link potrebbe essere scaduto.")
        setIsLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push("/admin")
      }, 3000)
    } catch (err) {
      console.error("Reset password error:", err)
      setError("Si è verificato un errore")
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-full bg-muted flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-ha-success-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-ha-success-soft-foreground" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Password reimpostata!</h1>
            <p className="text-muted-foreground">
              La tua password è stata aggiornata con successo. Verrai reindirizzato tra pochi istanti...
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (hasRecoverySession === false) {
    return (
      <div className="min-h-full bg-muted flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-ha-warning-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-ha-warning-soft-foreground" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Link non valido</h1>
            <p className="text-muted-foreground mb-6">
              Il link di recupero è scaduto o non è valido. Richiedine uno nuovo dalla pagina di accesso.
            </p>
            <button
              type="button"
              onClick={handleBackToLogin}
              disabled={isLeaving}
              className="inline-flex items-center justify-center w-full h-10 rounded-md bg-ha-warning text-white text-sm font-medium hover:bg-ha-warning disabled:opacity-60"
            >
              {isLeaving ? "Uscita in corso..." : "Torna al login"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-ha-warning-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-ha-warning-soft-foreground" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">Reimposta Password</h1>
            <p className="text-muted-foreground mt-2">Inserisci la tua nuova password</p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nuova Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  placeholder="Minimo 8 caratteri"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Conferma Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  placeholder="Ripeti la password"
                  required
                />
              </div>
            </div>

            {error && <div className="bg-ha-error-soft text-ha-error-soft-foreground p-3 rounded-lg text-sm">{error}</div>}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Salvataggio...
                </span>
              ) : (
                "Reimposta Password"
              )}
            </Button>

            <button
              type="button"
              onClick={handleBackToLogin}
              disabled={isLeaving}
              className="block w-full text-center text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {isLeaving ? "Uscita in corso..." : "Annulla e torna al login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
