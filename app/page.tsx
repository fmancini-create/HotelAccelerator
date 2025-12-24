import type React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Building2, Zap, BarChart3, MessageSquare, Globe, Shield } from "lucide-react"

export const metadata = {
  title: "HotelAccelerator - Piattaforma SaaS per Hotel",
  description:
    "HotelAccelerator è la piattaforma SaaS che aiuta gli hotel a gestire prenotazioni, comunicazioni e marketing in modo intelligente.",
}

export default function PlatformHomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">HotelAccelerator</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/request-access">
              <Button>Richiedi Accesso</Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline">Login</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            La piattaforma che <span className="text-primary">accelera</span> il tuo hotel
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Gestisci prenotazioni, comunicazioni e marketing da un'unica dashboard intelligente. Zero complessità,
            massimi risultati.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/request-access">
              <Button size="lg" className="w-full sm:w-auto">
                Inizia Gratuitamente
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="w-full sm:w-auto bg-transparent">
              Guarda Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-muted/50">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">Tutto ciò che serve al tuo hotel</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<MessageSquare className="h-10 w-10" />}
              title="Inbox Unificata"
              description="Email, WhatsApp e chat in un'unica vista. Rispondi ai clienti da qualsiasi canale."
            />
            <FeatureCard
              icon={<Zap className="h-10 w-10" />}
              title="AI Assistant"
              description="Risposte automatiche intelligenti che capiscono le richieste e suggeriscono azioni."
            />
            <FeatureCard
              icon={<BarChart3 className="h-10 w-10" />}
              title="Smart Messages"
              description="Messaggi automatici basati sul comportamento dei visitatori sul tuo sito."
            />
            <FeatureCard
              icon={<Globe className="h-10 w-10" />}
              title="Sito Web Incluso"
              description="Sito web professionale ottimizzato per SEO e conversioni, senza costi aggiuntivi."
            />
            <FeatureCard
              icon={<Shield className="h-10 w-10" />}
              title="Multi-Tenant"
              description="Ogni struttura ha il suo spazio isolato con dominio personalizzato."
            />
            <FeatureCard
              icon={<Building2 className="h-10 w-10" />}
              title="Facile da Usare"
              description="Interfaccia pensata per albergatori, non per tecnici. Operativo in 30 secondi."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold mb-4">Pronto a far crescere il tuo hotel?</h2>
          <p className="text-muted-foreground mb-8">
            Unisciti agli hotel che hanno già scelto HotelAccelerator per gestire le loro prenotazioni.
          </p>
          <Link href="/request-access">
            <Button size="lg">Richiedi Accesso</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-muted-foreground" />
            <span className="text-muted-foreground">HotelAccelerator</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} HotelAccelerator. Tutti i diritti riservati.
          </p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="bg-background rounded-lg p-6 border">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}
