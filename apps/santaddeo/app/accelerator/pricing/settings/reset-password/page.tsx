"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle2, Lock, KeyRound } from "lucide-react"

export default function ResetSettingsPasswordPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")
  
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState("")
  const [hotelName, setHotelName] = useState("")
  
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  
  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenError("Token mancante")
      setValidating(false)
      setLoading(false)
      return
    }
    
    async function validateToken() {
      try {
        const res = await fetch(`/api/accelerator/settings-password/validate-token?token=${token}`)
        const data = await res.json()
        
        if (res.ok && data.valid) {
          setTokenValid(true)
          setHotelName(data.hotel_name || "")
        } else {
          setTokenError(data.error || "Token non valido o scaduto")
        }
      } catch {
        setTokenError("Errore di connessione")
      } finally {
        setValidating(false)
        setLoading(false)
      }
    }
    
    validateToken()
  }, [token])
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    
    if (!newPassword || newPassword.length < 4) {
      setError("La password deve essere di almeno 4 caratteri")
      return
    }
    
    if (newPassword !== confirmPassword) {
      setError("Le password non coincidono")
      return
    }
    
    setSaving(true)
    
    try {
      const res = await fetch("/api/accelerator/settings-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      })
      
      const data = await res.json()
      
      if (res.ok) {
        setSuccess(true)
      } else {
        setError(data.error || "Errore nel reset della password")
      }
    } catch {
      setError("Errore di connessione")
    } finally {
      setSaving(false)
    }
  }
  
  if (loading || validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Verifica token in corso...</p>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Link non valido</CardTitle>
            <CardDescription>{tokenError}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Il link potrebbe essere scaduto o già stato utilizzato. 
              Richiedi un nuovo link di reset dalla pagina impostazioni.
            </p>
            <Button onClick={() => router.push("/accelerator/pricing/settings")}>
              Torna alle impostazioni
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <CardTitle>Password reimpostata!</CardTitle>
            <CardDescription>
              La nuova password per le impostazioni di pricing è stata salvata con successo.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push("/accelerator/pricing/settings")}>
              Vai alle impostazioni
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
            <KeyRound className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle>Reimposta password</CardTitle>
          <CardDescription>
            Imposta una nuova password per proteggere le impostazioni di pricing
            {hotelName && <span className="block mt-1 font-medium text-foreground">{hotelName}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nuova password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Inserisci nuova password"
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Conferma password"
                  className="pl-10"
                />
              </div>
            </div>
            
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Salvataggio..." : "Reimposta password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
