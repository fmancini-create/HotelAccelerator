import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Check, Users, Target } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function ConsultationPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-orange-50 via-white to-orange-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link href="/dashboard" className="text-2xl font-bold text-blue-900">
            SANTADDEO
          </Link>
        </div>
      </header>

      <main className="flex-1 py-12">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-orange-600">Consulenza Revenue Management</Badge>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Parla con un Esperto</h1>
              <p className="text-xl text-muted-foreground">
                I nostri Revenue Manager ti aiuteranno a ottimizzare la strategia della tua struttura
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 mb-12">
              <Card>
                <CardHeader>
                  <Users className="h-8 w-8 text-orange-600 mb-2" />
                  <CardTitle>Consulenza Strategica</CardTitle>
                  <CardDescription>Analisi approfondita e piano d'azione personalizzato</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-600 mt-0.5" />
                      <span className="text-sm">Analisi completa dei KPI</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-600 mt-0.5" />
                      <span className="text-sm">Strategia di pricing personalizzata</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-600 mt-0.5" />
                      <span className="text-sm">Ottimizzazione canali di distribuzione</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Target className="h-8 w-8 text-orange-600 mb-2" />
                  <CardTitle>Supporto Continuo</CardTitle>
                  <CardDescription>Accompagnamento nel raggiungimento degli obiettivi</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-600 mt-0.5" />
                      <span className="text-sm">Monitoraggio performance mensile</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-600 mt-0.5" />
                      <span className="text-sm">Aggiustamenti strategici in tempo reale</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-600 mt-0.5" />
                      <span className="text-sm">Supporto via email e telefono</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Richiedi una Consulenza</CardTitle>
                <CardDescription>Compila il form e ti contatteremo entro 24 ore</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome e Cognome</Label>
                      <Input id="name" placeholder="Mario Rossi" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefono</Label>
                      <Input id="phone" type="tel" placeholder="+39 123 456 7890" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hotel">Nome Struttura</Label>
                    <Input id="hotel" placeholder="Hotel Belvedere" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Descrivi la tua situazione</Label>
                    <Textarea
                      id="message"
                      placeholder="Raccontaci quali sono le tue sfide principali e cosa vorresti migliorare..."
                      rows={5}
                    />
                  </div>

                  <Button type="submit" className="w-full" size="lg">
                    Richiedi Consulenza Gratuita
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="mt-12 text-center">
              <Button variant="outline" asChild>
                <Link href="/dashboard">Torna alla Dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
