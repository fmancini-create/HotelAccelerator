import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Sparkles,
  ArrowRight,
  Bot,
  Clock,
  Languages,
  Brain,
  MessageCircle,
  Settings,
  Zap,
} from "lucide-react"
import { PlatformFooter } from "@/components/platform-footer"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"

export const metadata: Metadata = {
  title: "AI Assistant per Hotel - Chatbot Intelligente 24/7 | HotelAccelerator",
  description:
    "AI Assistant per hotel che risponde agli ospiti 24/7. Risposte automatiche intelligenti, analisi intento, suggerimenti personalizzati. Multilingua, configurabile, sempre disponibile.",
  keywords: [
    "ai hotel",
    "chatbot hotel",
    "intelligenza artificiale hotel",
    "assistente virtuale hotel",
    "ai customer service hotel",
    "automazione risposte hotel",
    "bot prenotazioni hotel",
    "ai concierge",
  ],
  openGraph: {
    title: "AI Assistant - Il Tuo Concierge Digitale 24/7 | HotelAccelerator",
    description: "AI che risponde agli ospiti 24/7. Multilingua, intelligente, sempre disponibile.",
    type: "website",
  },
  alternates: {
    canonical: "https://hotelaccelerator.com/features/ai-assistant",
  },
}

const features = [
  {
    icon: Clock,
    title: "Disponibile 24/7",
    description: "Risponde agli ospiti anche di notte, weekend e festivi. Nessuna attesa, risposte immediate.",
  },
  {
    icon: Languages,
    title: "Multilingua Nativo",
    description: "Parla italiano, inglese, tedesco, francese, spagnolo. Riconosce la lingua automaticamente.",
  },
  {
    icon: Brain,
    title: "Analisi Intento",
    description: "Capisce cosa vuole l'ospite: info, prenotazione, reclamo. Indirizza alla risposta giusta.",
  },
  {
    icon: MessageCircle,
    title: "Suggerimenti Smart",
    description: "Propone upselling contestuale: upgrade camera, spa, esperienze. Aumenta il revenue.",
  },
  {
    icon: Settings,
    title: "Completamente Configurabile",
    description: "Imposta tono di voce, orari, argomenti. Disattivabile per canale o fascia oraria.",
  },
  {
    icon: Bot,
    title: "Handoff Umano",
    description: "Riconosce quando serve un operatore e passa la conversazione senza interruzioni.",
  },
]

const conversations = [
  {
    user: "Avete camere disponibili per il weekend?",
    ai: "Certo! Per questo weekend abbiamo disponibilità nella nostra Suite Superior con vista panoramica. Vuoi che ti invii i dettagli e il link per prenotare?",
  },
  {
    user: "A che ora è la colazione?",
    ai: "La colazione è servita dalle 7:30 alle 10:30 nel nostro ristorante al piano terra. Offriamo anche colazione in camera su richiesta. Posso aiutarti con altro?",
  },
]

export default function AIAssistantLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "HotelAccelerator AI Assistant",
            applicationCategory: "BusinessApplication",
            description: "AI Assistant per hotel con risposte automatiche 24/7",
            operatingSystem: "Web",
          }),
        }}
      />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <HotelAcceleratorMark className="h-8 w-8" priority />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Accedi
              </Button>
            </Link>
            <Link href="/request-access">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Richiedi Demo
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <Link href="/" className="mx-auto mb-6 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowRight className="h-4 w-4 rotate-180" />
              Torna alla home
            </Link>
            <div className="mx-auto flex w-fit items-center gap-2 px-4 py-2 rounded-full bg-ha-brand-soft border border-ha-brand/20 text-sm text-ha-brand mb-8">
              <Sparkles className="h-4 w-4" />
              AI Assistant
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-6 text-balance">
              Il concierge che non dorme mai
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              <strong>Risposte automatiche intelligenti 24/7</strong>. Analisi intento, suggerimenti personalizzati,
              multilingua. Il tuo team sempre supportato.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/request-access">
                <Button size="lg" className="h-14 gap-2 rounded-full bg-ha-brand px-8 text-lg font-semibold text-ha-brand-foreground hover:bg-ha-brand/90">
                  Prova l'AI Assistant
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Demo Conversation */}
          <div className="max-w-xl mx-auto rounded-2xl border border-border bg-secondary/50 p-6">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border">
              <Bot className="h-6 w-6 text-ha-brand" />
              <span className="font-medium">AI Assistant Demo</span>
            </div>
            <div className="space-y-4">
              {conversations.map((conv, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="bg-muted rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%]">
                      <p className="text-sm">{conv.user}</p>
                    </div>
                  </div>
                  <div className="flex">
                    <div className="bg-ha-brand-soft rounded-2xl rounded-tl-sm px-4 py-2 max-w-[80%]">
                      <p className="text-sm">{conv.ai}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Intelligenza artificiale al servizio dell'ospitalità
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <article key={feature.title} className="p-6 rounded-2xl bg-secondary/50 border border-border">
                <div className="w-12 h-12 rounded-xl bg-ha-brand-soft flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-ha-brand" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24 px-4 bg-card/[0.02]">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-secondary/50 border border-border text-center">
              <div className="text-4xl font-bold text-ha-brand mb-2">24/7</div>
              <div className="text-muted-foreground">Sempre disponibile</div>
            </div>
            <div className="p-6 rounded-2xl bg-secondary/50 border border-border text-center">
              <div className="text-4xl font-bold text-ha-brand mb-2">&lt;3s</div>
              <div className="text-muted-foreground">Tempo di risposta</div>
            </div>
            <div className="p-6 rounded-2xl bg-secondary/50 border border-border text-center">
              <div className="text-4xl font-bold text-ha-brand mb-2">5+</div>
              <div className="text-muted-foreground">Lingue supportate</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-b from-ha-brand/20 to-ha-brand-soft border border-ha-brand/20">
            <Zap className="h-12 w-12 text-ha-brand mx-auto mb-6" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Attiva il tuo AI Assistant</h2>
            <p className="text-muted-foreground mb-8">Configurazione assistita, training sui tuoi contenuti incluso.</p>
            <Link href="/request-access">
              <Button size="lg" className="h-14 gap-2 rounded-full bg-ha-brand px-8 text-lg font-semibold text-ha-brand-foreground hover:bg-ha-brand/90">
                Richiedi Demo Gratuita
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <PlatformFooter />
    </div>
  )
}
