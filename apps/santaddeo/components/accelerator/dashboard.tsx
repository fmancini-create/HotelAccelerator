"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TrendingUp, TrendingDown, Zap, DollarSign, Calendar } from "lucide-react"
import Link from "next/link"
import { PageNavigation } from "@/components/layout/page-navigation"

interface Subscription {
  id: string
  hotel_id: string
  plan_type: "fixed_fee" | "commission"
  algorithm_type: "basic" | "advanced"
  auto_pilot: boolean
  fixed_fee_per_room: number | null
  commission_percentage: number | null
  is_active: boolean
  started_at: string
  hotel: {
    id: string
    name: string
    total_rooms: number
  }
}

export function AcceleratorDashboard({ subscriptions }: { subscriptions: Subscription[] }) {
  const [selectedSubscription, setSelectedSubscription] = useState(subscriptions[0])

  // Stato vuoto (17/07/2026): il super_admin puo' raggiungere la hub anche per
  // strutture SENZA subscription (es. hotel di test). In quel caso subscriptions
  // e' [] e selectedSubscription e' undefined -> evitiamo il crash su
  // selectedSubscription.plan_type mostrando un accesso diretto ai moduli.
  if (!selectedSubscription) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <header className="border-b bg-white">
          <div className="container mx-auto flex h-16 items-center justify-between px-6">
            <div className="flex items-center gap-6">
              <PageNavigation />
              <Link href="/dashboard">
                <img src="/logo-santaddeo.png" alt="SANTADDEO" width={140} height={40} className="h-10 w-auto" />
              </Link>
            </div>
            <Badge variant="outline">Accesso SuperAdmin</Badge>
          </div>
        </header>

        <main className="container mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Hotel Accelerator Dashboard</h1>
            <p className="text-muted-foreground">
              Nessun abbonamento attivo per questa struttura. Come SuperAdmin puoi comunque accedere ai moduli.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/accelerator/pricing", label: "Gestione Prezzi", icon: Zap },
              { href: "/accelerator/pace", label: "Booking Pace", icon: TrendingUp },
              { href: "/accelerator/rate-shopper", label: "Rate Shopper", icon: DollarSign },
              { href: "/accelerator/commercial-balance", label: "Bilancio Commerciale", icon: Calendar },
            ].map((m) => (
              <Link key={m.href} href={m.href}>
                <Card className="transition-colors hover:border-primary">
                  <CardContent className="flex items-center gap-3 pt-6">
                    <m.icon className="h-5 w-5 text-primary" />
                    <span className="font-medium">{m.label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <div className="mt-6">
            <Link href="/accelerator/activate">
              <Button variant="outline">Attiva Hotel Accelerator per questa struttura</Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const monthlyFee =
    selectedSubscription.plan_type === "fixed_fee"
      ? (selectedSubscription.fixed_fee_per_room || 0) * selectedSubscription.hotel.total_rooms
      : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <PageNavigation />
            <Link href="/dashboard">
              <img src="/logo-santaddeo.png" alt="SANTADDEO" width={140} height={40} className="h-10 w-auto" />
            </Link>
          </div>
          <Badge className="bg-purple-600">Hotel Accelerator Attivo</Badge>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Hotel Accelerator Dashboard</h1>
          <p className="text-muted-foreground">Monitora le performance e le raccomandazioni di pricing</p>
        </div>

        {subscriptions.length > 1 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Seleziona Hotel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {subscriptions.map((sub) => (
                  <Button
                    key={sub.id}
                    variant={selectedSubscription.id === sub.id ? "default" : "outline"}
                    onClick={() => setSelectedSubscription(sub)}
                  >
                    {sub.hotel.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Piano Attivo</span>
                <Zap className="h-4 w-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold">
                {selectedSubscription.plan_type === "fixed_fee" ? "Fee Fissa" : "Commissione"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedSubscription.algorithm_type === "basic" ? "Algoritmo Base" : "Algoritmo Avanzato"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Costo Mensile</span>
                <DollarSign className="h-4 w-4 text-green-600" />
              </div>
              <div className="text-2xl font-bold">
                {selectedSubscription.plan_type === "fixed_fee" ? `€${monthlyFee}` : "Variabile"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedSubscription.plan_type === "commission" && "15-20% su incremento"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Revenue Incrementale</span>
                <TrendingUp className="h-4 w-4 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-muted-foreground">--</div>
              <p className="text-xs text-muted-foreground mt-1">Storico insufficiente</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Auto-Pilot</span>
                <Calendar className="h-4 w-4 text-orange-600" />
              </div>
              <div className="text-2xl font-bold">{selectedSubscription.auto_pilot ? "Attivo" : "Manuale"}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedSubscription.auto_pilot ? "Aggiornamento automatico" : "Revisione manuale"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="recommendations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="recommendations">Raccomandazioni</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="settings">Impostazioni</TabsTrigger>
          </TabsList>

          <TabsContent value="recommendations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Raccomandazioni di Prezzo - Prossimi 7 Giorni</CardTitle>
                <CardDescription>
                  Prezzi suggeriti dall'algoritmo{" "}
                  {selectedSubscription.algorithm_type === "basic" ? "base" : "avanzato"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">
                    Le raccomandazioni di prezzo sono disponibili nella pagina Prezzi.
                  </p>
                  <Link href="/accelerator/pricing">
                    <Button className="mt-4">
                      Vai alla Gestione Prezzi
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance">
            <Card>
              <CardHeader>
                <CardTitle>Performance Hotel Accelerator</CardTitle>
                <CardDescription>Confronto prima e dopo l'attivazione</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <TrendingUp className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-2">
                    Le statistiche di performance saranno disponibili dopo almeno 30 giorni di utilizzo.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Il sistema sta raccogliendo dati per calcolare il miglioramento reale dei tuoi KPI.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Impostazioni Sottoscrizione</CardTitle>
                <CardDescription>Gestisci il tuo piano Hotel Accelerator</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold">Modalità Auto-Pilot</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedSubscription.auto_pilot ? "Attivo" : "Disattivato"}
                    </div>
                  </div>
                  <Link href="/accelerator/pricing">
                    <Button variant="outline">Modifica</Button>
                  </Link>
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold">Algoritmo</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedSubscription.algorithm_type === "basic" ? "Base" : "Avanzato"}
                    </div>
                  </div>
                  <Link href="/accelerator/pricing/settings">
                    <Button variant="outline">Configura</Button>
                  </Link>
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold">Piano di Pagamento</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedSubscription.plan_type === "fixed_fee" ? "Fee Fissa" : "Commissione"}
                    </div>
                  </div>
                  <Button variant="outline" disabled>
                    Contatta Supporto
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
