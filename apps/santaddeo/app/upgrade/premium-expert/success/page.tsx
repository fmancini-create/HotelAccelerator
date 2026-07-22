"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, PartyPopper, MessageSquare, ArrowRight, Loader2 } from "lucide-react"
import confetti from "canvas-confetti"

export default function PremiumExpertSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function verifyPayment() {
      if (!sessionId) {
        setLoading(false)
        return
      }
      try {
        const res = await fetch(`/api/addon/verify?session_id=${sessionId}`)
        const data = await res.json()
        if (data.verified) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#10b981", "#059669", "#047857"],
          })
        }
      } catch {
        // Fallback: show success anyway (webhook handles the real activation)
      } finally {
        setLoading(false)
      }
    }
    verifyPayment()
  }, [sessionId])

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-6">
      <Card className="max-w-lg w-full shadow-xl border-0">
        <CardHeader className="text-center">
          {loading ? (
            <div className="mx-auto w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
            </div>
          ) : (
            <div className="mx-auto w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4 animate-bounce">
              <PartyPopper className="h-10 w-10 text-emerald-600" />
            </div>
          )}
          <CardTitle className="text-3xl text-emerald-700">
            {loading ? "Elaborazione..." : "Benvenuto in Premium Expert!"}
          </CardTitle>
          <CardDescription className="text-base">
            {loading 
              ? "Stiamo attivando il tuo abbonamento..."
              : "Il tuo abbonamento Premium Expert e' stato attivato con successo."
            }
          </CardDescription>
        </CardHeader>

        {!loading && (
          <CardContent className="space-y-4">
            <div className="bg-emerald-50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-medium">Inoltro conversazioni attivo</p>
                  <p className="text-sm text-muted-foreground">Puoi ora inoltrare le tue conversazioni AI all'esperto</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-medium">Supporto prioritario</p>
                  <p className="text-sm text-muted-foreground">Risposta garantita entro 24-48 ore lavorative</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-medium">Report mensile</p>
                  <p className="text-sm text-muted-foreground">Riceverai un report di performance ogni mese</p>
                </div>
              </div>
            </div>

            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-2">Cosa vuoi fare ora?</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => router.push("/dashboard")}
                  variant="outline"
                  className="gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Parla con Taddeo
                </Button>
                <Button
                  onClick={() => router.push("/dashboard")}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  Vai alla Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        )}

        {loading && (
          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              Attendere prego...
            </p>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
