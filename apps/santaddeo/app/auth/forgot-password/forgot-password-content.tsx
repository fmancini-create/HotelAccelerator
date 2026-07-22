"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { useState, useRef, useEffect } from "react"
import { AlertCircle, CheckCircle2 } from "lucide-react"

export default function ForgotPasswordContent() {
  const [email, setEmail] = useState("")
  // Honeypot field (display:none) compilato solo dai bot
  const [hpField, setHpField] = useState("")
  // Honeypot timestamp impostato al mount
  const hpTsRef = useRef<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    hpTsRef.current = Date.now()
  }, [])

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          _hp_field: hpField,
          _hp_ts: hpTsRef.current,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data?.error || "Errore durante l'invio dell'email. Riprova.")
        return
      }

      // Anti-enumeration: il server ritorna sempre success per non rivelare
      // se l'email esiste. Il messaggio mostrato e' generico.
      setSuccess(true)
    } catch {
      setError("Errore di connessione. Riprova.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <img src="/logo-santaddeo.png" alt="SANTADDEO" width={120} height={36} className="mx-auto" />
          </Link>
          <p className="mt-2 text-muted-foreground">Revenue Management System</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Recupera Password</CardTitle>
            <CardDescription>
              Inserisci la tua email e ti invieremo un link per reimpostare la password
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Se l&apos;email e&apos; registrata, riceverai a breve un link per reimpostare la password.
                    Controlla la tua casella di posta (e la cartella spam, per sicurezza).
                  </AlertDescription>
                </Alert>
                <div className="text-center">
                  <Link href="/auth/login" className="text-sm font-medium text-blue-600 hover:text-blue-700 underline">
                    Torna al login
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetRequest}>
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
                      disabled={isLoading}
                      autoComplete="email"
                    />
                  </div>

                  {/* Honeypot: hidden field, bot lo compilano, umani no */}
                  <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }}>
                    <label htmlFor="company_url">Company URL (lascia vuoto)</label>
                    <input
                      type="text"
                      id="company_url"
                      name="company_url"
                      tabIndex={-1}
                      autoComplete="off"
                      value={hpField}
                      onChange={(e) => setHpField(e.target.value)}
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Invio in corso..." : "Invia link di recupero"}
                  </Button>
                </div>

                <div className="mt-6 text-center text-sm">
                  Ricordi la password?{" "}
                  <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-700 underline">
                    Accedi
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
