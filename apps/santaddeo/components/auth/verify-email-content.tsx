"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Mail, CheckCircle2, AlertCircle, Info } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useSearchParams } from "next/navigation"


export default function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const fallbackLink = searchParams?.get("fallbackLink") ?? null

  const [isResending, setIsResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const isDev = process.env.NEXT_PUBLIC_APP_ENV === "development" || process.env.NODE_ENV === "development"

  const handleResendEmail = async () => {
    setIsResending(true)
    setResendError(null)
    setResendSuccess(false)

    try {
      // Use our own API to resend verification email via SMTP (not Supabase default)
      const emailParam = searchParams?.get("email") ?? null
      if (!emailParam) {
        setResendError("Impossibile trovare l'email. Riprova la registrazione.")
        return
      }

      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Errore durante l'invio dell'email")
      }

      setResendSuccess(true)
    } catch (error) {
      console.error("[v0] Resend email error:", error)
      setResendError(error instanceof Error ? error.message : "Errore durante l'invio dell'email")
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-blue-900">SANTADDEO</h1>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              <Mail className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Verifica la tua email</CardTitle>
            <CardDescription>
              Ti abbiamo inviato un&apos;email con un link di conferma. Clicca sul link per attivare il tuo account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fallbackLink && (
              <Alert className="bg-amber-50 border-amber-200">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-900">
                  <strong>L&apos;email non e stata inviata.</strong> Puoi comunque verificare il tuo account cliccando
                  direttamente il pulsante qui sotto.
                </AlertDescription>
              </Alert>
            )}

            {fallbackLink && (
              <Button asChild className="w-full">
                <a href={fallbackLink}>Verifica il mio account</a>
              </Button>
            )}

            {isDev && !fallbackLink && (
              <Alert className="bg-amber-50 border-amber-200">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-900">
                  <strong>Ambiente di sviluppo:</strong> Le email potrebbero non essere inviate. Puoi procedere
                  direttamente al{" "}
                  <Link href="/auth/login" className="font-semibold underline hover:text-amber-700">
                    login
                  </Link>{" "}
                  per testare la piattaforma.
                </AlertDescription>
              </Alert>
            )}

            {resendSuccess && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Email inviata con successo! Controlla la tua casella di posta.
                </AlertDescription>
              </Alert>
            )}

            {resendError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{resendError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Non hai ricevuto l&apos;email? Controlla la cartella spam o clicca qui sotto per reinviarla.
              </p>

              <Button
                onClick={handleResendEmail}
                disabled={isResending || resendSuccess}
                variant="outline"
                className="w-full bg-transparent"
              >
                {isResending ? "Invio in corso..." : resendSuccess ? "Email inviata!" : "Reinvia email di conferma"}
              </Button>

              {isDev && (
                <Button asChild variant="default" className="w-full">
                  <Link href="/auth/login">Procedi al Login (Dev Mode)</Link>
                </Button>
              )}

              <div className="text-center">
                <Link href="/auth/sign-up" className="text-sm font-medium text-blue-600 hover:text-blue-700 underline">
                  Torna alla registrazione
                </Link>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-900 font-medium mb-2">Suggerimenti:</p>
              <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                <li>Controlla la cartella spam o posta indesiderata</li>
                <li>Aggiungi {process.env.NEXT_PUBLIC_SMTP_FROM || "noreply@santaddeo.com"} ai contatti</li>
                <li>L&apos;email potrebbe impiegare alcuni minuti ad arrivare</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
