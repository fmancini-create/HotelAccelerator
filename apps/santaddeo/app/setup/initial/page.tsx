"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertCircle, Building2, MapPin, Bed, Key, CalendarIcon, Download, CheckCircle2 } from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { cn } from "@/lib/utils"

export default function InitialSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState(0)

  const [hotelData, setHotelData] = useState({
    name: "Hotel Belvedere",
    totalRooms: "25",
    address: "Via Roma 1",
    city: "Firenze",
    country: "Italia",
  })

  const [pmsData, setPmsData] = useState({
    scidooApiKey: "",
  })

  const [importDate, setImportDate] = useState<Date>(new Date(2024, 0, 1)) // 01-01-2024

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!hotelData.name || !hotelData.totalRooms) {
      setError("Compila tutti i campi obbligatori")
      return
    }
    setError(null)
    setStep(2)
  }

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pmsData.scidooApiKey) {
      setError("Inserisci l'API Key di Scidoo")
      return
    }
    setError(null)
    setStep(3)
  }

  const handleImport = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Simula l'importazione dei dati
      console.log("[v0] Starting data import from", format(importDate, "dd/MM/yyyy"))

      // Simula il progresso
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        setImportProgress(i)
      }

      setStep(4)
    } catch (error) {
      console.error("[v0] Import error:", error)
      setError("Errore durante l'importazione dei dati")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-blue-900">SANTADDEO</h1>
          <p className="mt-2 text-muted-foreground">Installazione Iniziale</p>
        </div>

        {/* Step 1: Dati Hotel */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Passo 1: Dati della Struttura</CardTitle>
              <CardDescription>Inserisci i dettagli della tua struttura</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleStep1Submit}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="hotelName" className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Nome Hotel *
                    </Label>
                    <Input
                      id="hotelName"
                      type="text"
                      required
                      value={hotelData.name}
                      onChange={(e) => setHotelData({ ...hotelData, name: e.target.value })}
                      placeholder="Hotel Belvedere"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="totalRooms" className="flex items-center gap-2">
                      <Bed className="h-4 w-4" />
                      Numero Totale Camere *
                    </Label>
                    <Input
                      id="totalRooms"
                      type="number"
                      required
                      min="1"
                      value={hotelData.totalRooms}
                      onChange={(e) => setHotelData({ ...hotelData, totalRooms: e.target.value })}
                      placeholder="25"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="address" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Indirizzo
                    </Label>
                    <Input
                      id="address"
                      type="text"
                      value={hotelData.address}
                      onChange={(e) => setHotelData({ ...hotelData, address: e.target.value })}
                      placeholder="Via Roma 1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="city">Città</Label>
                      <Input
                        id="city"
                        type="text"
                        value={hotelData.city}
                        onChange={(e) => setHotelData({ ...hotelData, city: e.target.value })}
                        placeholder="Firenze"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="country">Paese</Label>
                      <Input
                        id="country"
                        type="text"
                        value={hotelData.country}
                        onChange={(e) => setHotelData({ ...hotelData, country: e.target.value })}
                      />
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full">
                    Continua
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Configurazione PMS */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Passo 2: Configurazione PMS</CardTitle>
              <CardDescription>Configura l'integrazione con Scidoo</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleStep2Submit}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="scidooApiKey" className="flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      API Key Scidoo *
                    </Label>
                    <Input
                      id="scidooApiKey"
                      type="password"
                      required
                      value={pmsData.scidooApiKey}
                      onChange={(e) => setPmsData({ ...pmsData, scidooApiKey: e.target.value })}
                      placeholder="Inserisci la tua API Key di Scidoo"
                    />
                    <p className="text-xs text-muted-foreground">
                      Puoi trovare la tua API Key nel pannello di amministrazione di Scidoo
                    </p>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                      Indietro
                    </Button>
                    <Button type="submit" className="flex-1">
                      Continua
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Importazione Dati */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Passo 3: Importazione Dati Storici</CardTitle>
              <CardDescription>Seleziona la data di inizio per lo scarico dei dati</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label>Data di Inizio Importazione</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !importDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {importDate ? format(importDate, "dd MMMM yyyy", { locale: it }) : "Seleziona una data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={importDate}
                        onSelect={(date) => date && setImportDate(date)}
                        initialFocus
                        locale={it}
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Verranno importati tutti i dati dal {format(importDate, "dd/MM/yyyy")} ad oggi
                  </p>
                </div>

                <Alert>
                  <Download className="h-4 w-4" />
                  <AlertDescription>
                    L'importazione iniziale potrebbe richiedere alcuni minuti. Verranno scaricati:
                    <ul className="mt-2 ml-4 list-disc text-sm">
                      <li>Prenotazioni e cancellazioni</li>
                      <li>Disponibilità e prezzi</li>
                      <li>Categorie camere</li>
                      <li>Dati storici di occupazione e revenue</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {isLoading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Importazione in corso...</span>
                      <span>{importProgress}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-500"
                        style={{ width: `${importProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(2)}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    Indietro
                  </Button>
                  <Button onClick={handleImport} disabled={isLoading} className="flex-1">
                    {isLoading ? "Importazione..." : "Avvia Importazione"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Completato */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                Installazione Completata!
              </CardTitle>
              <CardDescription>La tua struttura è stata configurata con successo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-6">
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">Dati importati con successo:</p>
                      <ul className="ml-4 list-disc text-sm">
                        <li>1.247 prenotazioni</li>
                        <li>89 cancellazioni</li>
                        <li>12 categorie camere</li>
                        <li>365 giorni di dati storici</li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-4">
                        Periodo: {format(importDate, "dd/MM/yyyy")} - {format(new Date(), "dd/MM/yyyy")}
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>

                <Button onClick={() => router.push("/dashboard")} className="w-full">
                  Vai alla Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
