"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

export default function ActivateSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const sessionId = searchParams?.get("session_id")
    const hotelId = searchParams?.get("hotel_id")

    if (!sessionId || !hotelId) {
      setStatus("error")
      setMessage("Parametri mancanti")
      return
    }

    // Verify payment and activate subscription
    async function verifyAndActivate() {
      try {
        const res = await fetch("/api/accelerator/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, hotelId }),
        })

        const data = await res.json()

        if (res.ok && data.success) {
          setStatus("success")
          setMessage("Hotel Accelerator attivato con successo!")
        } else {
          setStatus("error")
          setMessage(data.error || "Errore durante la verifica del pagamento")
        }
      } catch (err) {
        console.error("[v0] Verify payment error:", err)
        setStatus("error")
        setMessage("Errore di connessione")
      }
    }

    verifyAndActivate()
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-muted/40 to-background p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          {status === "loading" && (
            <>
              <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin mb-4" />
              <CardTitle>Verifica in corso...</CardTitle>
              <CardDescription>Stiamo verificando il pagamento e attivando Hotel Accelerator</CardDescription>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-4" />
              <CardTitle className="text-green-600">Attivazione Completata!</CardTitle>
              <CardDescription>{message}</CardDescription>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-red-600 mb-4" />
              <CardTitle className="text-red-600">Errore</CardTitle>
              <CardDescription>{message}</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === "success" && (
            <>
              <p className="text-sm text-muted-foreground">
                Il tuo abbonamento Hotel Accelerator è ora attivo. Puoi iniziare a configurare le tue strategie di pricing.
              </p>
              <Button asChild className="w-full">
                <Link href="/accelerator/dashboard">Vai alla Dashboard</Link>
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <p className="text-sm text-muted-foreground">
                Se hai completato il pagamento, contatta il supporto. Altrimenti riprova.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" asChild className="flex-1">
                  <Link href="/upgrade/hotel-accelerator">Riprova</Link>
                </Button>
                <Button asChild className="flex-1">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
