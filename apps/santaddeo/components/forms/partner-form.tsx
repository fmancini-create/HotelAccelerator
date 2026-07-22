"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, ArrowRight, AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"

export function PartnerForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    companyName: "",
    vatNumber: "",
    numClients: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/ui/me`)
      const data = await response.json()

      if (data.profile?.email === formData.email) {
        setError("Esiste gia un account con questa email. Effettua il login.")
        setIsLoading(false)
        return
      }

      setSuccess(true)

      setTimeout(() => {
        router.push(
          `/auth/sign-up?email=${encodeURIComponent(formData.email)}&firstName=${encodeURIComponent(formData.firstName)}&lastName=${encodeURIComponent(formData.lastName)}&type=consultant&companyName=${encodeURIComponent(formData.companyName)}&vatNumber=${encodeURIComponent(formData.vatNumber)}`,
        )
      }, 2000)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Errore durante la registrazione")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-900">
          Richiesta inviata con successo! Ti stiamo reindirizzando alla registrazione...
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrazione Partner</CardTitle>
        <CardDescription>Inserisci i tuoi dati per iniziare</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nome *</Label>
              <Input
                id="firstName"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Cognome *</Label>
              <Input
                id="lastName"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefono *</Label>
            <Input
              id="phone"
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Ragione Sociale *</Label>
            <Input
              id="companyName"
              required
              placeholder="Es: Studio Consulenza SRL"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vatNumber">Partita IVA *</Label>
            <Input
              id="vatNumber"
              required
              placeholder="Es: 12345678901"
              value={formData.vatNumber}
              onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Nome Attivita (opzionale)</Label>
            <Input
              id="company"
              placeholder="Es: Revenue Consulting"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="numClients">Numero di Hotel/Clienti che Gestisci</Label>
            <Input
              id="numClients"
              type="number"
              value={formData.numClients}
              onChange={(e) => setFormData({ ...formData, numClients: e.target.value })}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? "Invio in corso..." : "Richiedi Codice Partner"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Cliccando su &quot;Richiedi Codice Partner&quot; accetti i termini e condizioni del programma partner
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
