"use client"

import { useState } from "react"
import { MotivationalSplash } from "@/components/motivational-splash"
import { Button } from "@/components/ui/button"
import { RotateCcw, User, BarChart3 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export default function DemoSplashPage() {
  const [showSplash, setShowSplash] = useState(true)
  const [key, setKey] = useState(0)
  const [userName, setUserName] = useState("Marco")
  const [usePerformanceData, setUsePerformanceData] = useState(true)
  
  // Dati di performance simulati
  const mockPerformanceData = {
    occupancyRate: 72,
    revpar: 85,
    adr: 118,
    bookingsToday: 5,
    revenueToday: 1250,
    weekTrend: "up" as const,
    pendingActions: 3,
    lowOccupancyDays: 4,
    highDemandDays: 2,
  }

  const handleReplay = () => {
    setKey(prev => prev + 1)
    setShowSplash(true)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      {showSplash && (
        <MotivationalSplash 
          key={key}
          duration={4000} 
          onComplete={() => setShowSplash(false)}
          userName={userName || undefined}
          performanceData={usePerformanceData ? mockPerformanceData : undefined}
        />
      )}

      {!showSplash && (
        <div className="text-center space-y-8 max-w-2xl">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-foreground">Demo Completata!</h1>
            <p className="text-muted-foreground">
              Questa animazione apparira' ogni volta che un utente accede alla dashboard.
              Il messaggio cambia casualmente e puo' essere personalizzato con il nome utente e i dati della struttura.
            </p>
          </div>
          
          {/* Configurazione Demo */}
          <div className="p-6 bg-muted/50 rounded-lg text-left space-y-4">
            <h3 className="font-semibold">Configura Demo:</h3>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="userName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Nome Utente
                </Label>
                <Input 
                  id="userName"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Inserisci nome..."
                />
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Usa dati performance
                </Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch 
                    checked={usePerformanceData}
                    onCheckedChange={setUsePerformanceData}
                  />
                  <span className="text-sm text-muted-foreground">
                    {usePerformanceData ? "Messaggi contestuali attivi" : "Solo messaggi generici"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Button onClick={handleReplay} size="lg" className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Rivedi l'animazione
          </Button>

          <div className="p-6 bg-muted/50 rounded-lg text-left">
            <h3 className="font-semibold mb-3">Caratteristiche:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• <strong>22+ messaggi motivazionali</strong> diversi organizzati per categoria</li>
              <li>• <strong>Personalizzazione con nome utente</strong> per maggiore coinvolgimento</li>
              <li>• <strong>Messaggi contestuali</strong> basati sui dati della struttura (occupazione, trend, azioni)</li>
              <li>• <strong>Inviti all'azione</strong> specifici (controlla tariffe, analizza dati, ottimizza)</li>
              <li>• Animazione stellare/cosmica di sfondo</li>
              <li>• Durata configurabile (default 4 secondi)</li>
              <li>• Click per saltare l'animazione</li>
            </ul>
            
            <h3 className="font-semibold mt-6 mb-3">Categorie messaggi:</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• <span className="text-emerald-500">Motivazionali</span> - Incoraggiamento generale</li>
              <li>• <span className="text-blue-500">Azioni</span> - Suggerimenti operativi specifici</li>
              <li>• <span className="text-amber-500">Insight</span> - Consigli e best practice</li>
              <li>• <span className="text-purple-500">Celebrazioni</span> - Riconoscimento successi</li>
              <li>• <span className="text-red-500">Performance</span> - Basati su dati reali della struttura</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
