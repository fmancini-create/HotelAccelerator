"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Loader2 } from "lucide-react"

export function RequestInfoForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formLoadTime] = useState(() => Date.now())

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    
    // Honeypot check - if filled, it's a bot
    const honeypot = formData.get("website")
    if (honeypot) {
      // Fake success to not alert the bot
      setTimeout(() => {
        setIsSuccess(true)
        setIsSubmitting(false)
      }, 1500)
      return
    }
    
    const data = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      hotel_name: formData.get("hotel_name"),
      message: formData.get("message"),
      _formLoadTime: formLoadTime, // Anti-bot: track how fast form was filled
    }

    console.log("[v0] Submitting form with data:", { ...data, message: data.message ? "..." : null })

    try {
      const response = await fetch("/api/request-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      console.log("[v0] Response status:", response.status)

      const result = await response.json()
      console.log("[v0] Response data:", result)

      if (!response.ok) {
        throw new Error(result.error || "Errore nell'invio della richiesta")
      }

      setIsSuccess(true)
    } catch (err) {
      console.error("[v0] Form submission error:", err)
      setError(err instanceof Error ? err.message : "Si è verificato un errore")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Richiesta Inviata!</h3>
          <p className="text-muted-foreground">
            Grazie per il tuo interesse. Ti contatteremo al più presto per mostrarti SANTADDEO.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>I tuoi dati</CardTitle>
        <CardDescription>Compila il form per essere ricontattato dal nostro team</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Honeypot field - hidden from humans, visible to bots */}
          <div className="absolute -left-[9999px] opacity-0 h-0 overflow-hidden" aria-hidden="true">
            <Label htmlFor="website">Website (leave empty)</Label>
            <Input 
              id="website" 
              name="website" 
              type="text" 
              tabIndex={-1} 
              autoComplete="off"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name">Nome e Cognome *</Label>
            <Input id="name" name="name" required placeholder="Mario Rossi" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" required placeholder="mario.rossi@example.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefono *</Label>
            <Input id="phone" name="phone" type="tel" required placeholder="+39 333 1234567" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hotel_name">Nome Struttura *</Label>
            <Input id="hotel_name" name="hotel_name" required placeholder="Hotel Esempio" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Messaggio (opzionale)</Label>
            <Textarea
              id="message"
              name="message"
              rows={4}
              placeholder="Raccontaci qualcosa sulla tua struttura e le tue esigenze..."
            />
          </div>

          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{error}</div>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Invio in corso...
              </>
            ) : (
              "Invia Richiesta"
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Inviando questo form accetti di essere contattato dal team di SANTADDEO
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
