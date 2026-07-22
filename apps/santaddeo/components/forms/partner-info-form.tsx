"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function PartnerInfoForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    structures_count: "",
    white_label: "no",
    message: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus("idle")
    setErrorMessage("")

    console.log("[v0] Partner info form submission started", formData)

    try {
      const response = await fetch("/api/partner-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      console.log("[v0] Partner info API response status:", response.status)

      const data = await response.json()
      console.log("[v0] Partner info API response data:", data)

      if (!response.ok) {
        throw new Error(data.error || "Errore nell'invio della richiesta")
      }

      setSubmitStatus("success")
      setFormData({
        name: "",
        email: "",
        phone: "",
        company: "",
        structures_count: "",
        white_label: "no",
        message: "",
      })
    } catch (error) {
      console.error("[v0] Partner info submission error:", error)
      setSubmitStatus("error")
      setErrorMessage(error instanceof Error ? error.message : "Errore nell'invio della richiesta")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Richiesta Informazioni Partner</CardTitle>
        <CardDescription>Compila il form per essere ricontattato dal nostro team</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">
              Nome e Cognome <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="Mario Rossi"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="mario.rossi@esempio.it"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              Telefono <span className="text-red-500">*</span>
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              required
              value={formData.phone}
              onChange={handleChange}
              placeholder="+39 333 1234567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">
              Nome Azienda <span className="text-red-500">*</span>
            </Label>
            <Input
              id="company"
              name="company"
              type="text"
              required
              value={formData.company}
              onChange={handleChange}
              placeholder="Gestione Alberghi S.r.l."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="structures_count">
              Quante strutture gestisci? <span className="text-red-500">*</span>
            </Label>
            <Input
              id="structures_count"
              name="structures_count"
              type="text"
              required
              value={formData.structures_count}
              onChange={handleChange}
              placeholder="es. 5 strutture"
            />
          </div>

          <div className="space-y-3">
            <Label>
              Sei interessato ad una versione White Label? <span className="text-red-500">*</span>
            </Label>
            <RadioGroup
              value={formData.white_label}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, white_label: value }))}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="white-label-yes" />
                <Label htmlFor="white-label-yes" className="font-normal cursor-pointer">
                  Sì, vorrei una versione brandizzata con il mio marchio
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="white-label-no" />
                <Label htmlFor="white-label-no" className="font-normal cursor-pointer">
                  No, la versione standard va bene
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="maybe" id="white-label-maybe" />
                <Label htmlFor="white-label-maybe" className="font-normal cursor-pointer">
                  Non so, vorrei maggiori informazioni
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Messaggio (opzionale)</Label>
            <Textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Raccontaci qualcosa in più sulla tua attività..."
              rows={4}
            />
          </div>

          {submitStatus === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {submitStatus === "success" && (
            <Alert className="border-green-200 bg-green-50 text-green-900">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                Grazie per il tuo interesse! Ti contatteremo al più presto per discutere il programma partner.
              </AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Invio in corso...
              </>
            ) : (
              "Invia Richiesta"
            )}
          </Button>

          <p className="text-sm text-muted-foreground text-center">
            Inviando questo form accetti di essere contattato dal team di SANTADDEO
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
