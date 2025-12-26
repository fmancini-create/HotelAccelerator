"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Building2, ArrowLeft, CheckCircle } from "lucide-react"

export default function RequestAccessPage() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    // Simula invio (in produzione: API call)
    await new Promise((resolve) => setTimeout(resolve, 1000))

    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-4">Richiesta Inviata!</h1>
          <p className="text-muted-foreground mb-8">
            Grazie per il tuo interesse in HotelAccelerator. Ti contatteremo entro 24 ore.
          </p>
          <Link href="/">
            <Button variant="outline">Torna alla Home</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">HotelAccelerator</span>
          </Link>
        </div>
      </header>

      {/* Form */}
      <div className="container mx-auto max-w-lg py-16 px-4">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" />
          Torna alla Home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Richiedi Accesso</h1>
        <p className="text-muted-foreground mb-8">
          Compila il form per richiedere l'accesso a HotelAccelerator. Ti contatteremo per attivare il tuo account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nome *</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Cognome *</Label>
              <Input id="lastName" name="lastName" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefono</Label>
            <Input id="phone" name="phone" type="tel" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hotelName">Nome Struttura *</Label>
            <Input id="hotelName" name="hotelName" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Sito Web Attuale</Label>
            <Input id="website" name="website" type="url" placeholder="https://" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rooms">Numero di Camere</Label>
            <Input id="rooms" name="rooms" type="number" min="1" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Note o Richieste</Label>
            <Textarea id="message" name="message" rows={4} placeholder="Raccontaci di più sulla tua struttura..." />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Invio in corso..." : "Invia Richiesta"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Inviando questo form accetti i nostri Termini di Servizio e la Privacy Policy.
          </p>
        </form>
      </div>
    </div>
  )
}
