"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save } from "lucide-react"

export function AdminGlobalSettings() {
  const [settings, setSettings] = useState({
    bookingsFrequency: "15",
    availabilityFrequency: "2",
    revenueFrequency: "10",
  })

  const handleSave = async () => {
    // TODO: Implement save settings API call
    alert("Impostazioni salvate con successo!")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Impostazioni Globali</CardTitle>
        <CardDescription>Configura le frequenze di sincronizzazione e le chiavi API globali</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cron Frequencies */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Frequenze Cron</h3>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="bookings">Prenotazioni</Label>
              <Select
                value={settings.bookingsFrequency}
                onValueChange={(value) => setSettings({ ...settings, bookingsFrequency: value })}
              >
                <SelectTrigger id="bookings">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Ogni 5 minuti</SelectItem>
                  <SelectItem value="10">Ogni 10 minuti</SelectItem>
                  <SelectItem value="15">Ogni 15 minuti</SelectItem>
                  <SelectItem value="30">Ogni 30 minuti</SelectItem>
                  <SelectItem value="60">Ogni ora</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="availability">Disponibilità</Label>
              <Select
                value={settings.availabilityFrequency}
                onValueChange={(value) => setSettings({ ...settings, availabilityFrequency: value })}
              >
                <SelectTrigger id="availability">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ogni minuto</SelectItem>
                  <SelectItem value="2">Ogni 2 minuti</SelectItem>
                  <SelectItem value="5">Ogni 5 minuti</SelectItem>
                  <SelectItem value="10">Ogni 10 minuti</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="revenue">Revenue</Label>
              <Select
                value={settings.revenueFrequency}
                onValueChange={(value) => setSettings({ ...settings, revenueFrequency: value })}
              >
                <SelectTrigger id="revenue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Ogni 5 minuti</SelectItem>
                  <SelectItem value="10">Ogni 10 minuti</SelectItem>
                  <SelectItem value="15">Ogni 15 minuti</SelectItem>
                  <SelectItem value="30">Ogni 30 minuti</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Chiavi API Globali</h3>
          <p className="text-sm text-muted-foreground">
            Queste chiavi sono visibili solo ai SuperAdmin e vengono utilizzate per integrazioni di sistema
          </p>

          <div className="space-y-2">
            <Label htmlFor="cron-secret">CRON_SECRET</Label>
            <Input id="cron-secret" type="password" placeholder="••••••••••••••••" disabled />
          </div>
        </div>

        <Button onClick={handleSave} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          Salva Impostazioni
        </Button>
      </CardContent>
    </Card>
  )
}
