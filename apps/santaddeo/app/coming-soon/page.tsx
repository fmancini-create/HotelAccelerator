import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, Zap, Shield, Clock, Users, ArrowRight } from "lucide-react"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { CookieConsent } from "@/components/cookie-consent"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "SANTADDEO - Revenue Management System per Strutture Ricettive",
  description:
    "Massimizza il revenue della tua struttura ricettiva con SANTADDEO. Dashboard KPI in tempo reale, alert intelligenti, pricing dinamico e integrazione PMS. 24 anni di esperienza, 70+ strutture affiancate.",
  keywords: [
    "revenue management",
    "hotel",
    "strutture ricettive",
    "KPI",
    "PMS",
    "occupazione",
    "RevPAR",
    "pricing dinamico",
    "gestione alberghiera",
  ],
  openGraph: {
    title: "SANTADDEO - Revenue Management System",
    description: "Trasforma i dati del tuo PMS in insights chiari per aumentare occupazione e fatturato",
    type: "website",
    locale: "it_IT",
  },
  robots: {
    index: false,
    follow: false,
  },
  alternates: { canonical: "https://www.santaddeo.com" },
}

export default function ComingSoonPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header showAuth={false} />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-blue-50 py-20">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-4 bg-blue-600">La Bussola per il tuo Revenue</Badge>
            <h1 className="text-5xl font-bold text-gray-900 mb-6 text-balance">
              Massimizza il Revenue della tua Struttura con Dati Chiari e Actionable
            </h1>
            <p className="text-xl text-muted-foreground mb-8 text-pretty">
              SANTADDEO è il Revenue Management System che trasforma i dati del tuo PMS in insights chiari e
              raccomandazioni concrete per aumentare occupazione e fatturato.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/request-info">
                <Button size="lg" className="gap-2">
                  Richiedi Informazioni
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="#features">
                <Button size="lg" variant="outline">
                  Scopri di Più
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">In arrivo • Ti contatteremo appena disponibile</p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-white border-y">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">70+</div>
              <div className="text-sm text-muted-foreground">Strutture Affiancate</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">24</div>
              <div className="text-sm text-muted-foreground">Anni di Esperienza</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">+75%</div>
              <div className="text-sm text-muted-foreground">Revenue Medio Clienti</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">24/7</div>
              <div className="text-sm text-muted-foreground">Monitoraggio Automatico</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Tutto quello che ti serve per crescere</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Dashboard intuitiva, alert intelligenti e raccomandazioni personalizzate per ottimizzare ogni aspetto del
              tuo revenue management
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-blue-600 mb-3" />
                <CardTitle>KPI in Tempo Reale</CardTitle>
                <CardDescription>
                  Visualizza RevPAR, RevPOR, occupazione e tutti i KPI fondamentali in un'unica dashboard chiara e
                  personalizzabile
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Zap className="h-10 w-10 text-orange-600 mb-3" />
                <CardTitle>Alert Intelligenti</CardTitle>
                <CardDescription>
                  Ricevi notifiche automatiche quando i tuoi KPI si discostano dalle soglie ottimali, con
                  raccomandazioni concrete
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-green-600 mb-3" />
                <CardTitle>Confronto Storico</CardTitle>
                <CardDescription>
                  Analizza le performance rispetto all'anno precedente e identifica trend e opportunità di crescita
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-purple-600 mb-3" />
                <CardTitle>Integrazione PMS</CardTitle>
                <CardDescription>
                  Connetti il tuo PMS in pochi click. Architettura modulare multi-PMS con adapter dedicati
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Clock className="h-10 w-10 text-blue-600 mb-3" />
                <CardTitle>Storico Completo</CardTitle>
                <CardDescription>
                  Importa e analizza lo storico delle prenotazioni per decisioni basate su dati concreti
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-10 w-10 text-pink-600 mb-3" />
                <CardTitle>Multi-Utente</CardTitle>
                <CardDescription>
                  Gestisci più strutture e crea utenti con permessi personalizzati per il tuo team
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-4">Vuoi saperne di più?</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Lasciaci i tuoi dati e ti contatteremo appena SANTADDEO sarà disponibile per mostrarti come può trasformare
            il tuo business
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/request-info">
              <Button size="lg" variant="secondary" className="gap-2">
                Richiedi Informazioni
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-blue-200">
            Sei un professionista o gestisci più strutture?{" "}
            <Link href="/partner" className="underline font-semibold hover:text-white">
              Scopri il Programma Partner
            </Link>
          </p>
        </div>
      </section>

      {/* Cookie Consent Banner */}
      <CookieConsent />
    </div>
  )
}
