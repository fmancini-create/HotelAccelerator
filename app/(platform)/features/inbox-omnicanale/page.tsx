import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  MessageSquare,
  ArrowRight,
  Mail,
  Phone,
  MessagesSquare,
  Bot,
  Clock,
  Users,
  Building2,
  Inbox,
} from "lucide-react"
import { PlatformFooter } from "@/components/platform-footer"

export const metadata: Metadata = {
  title: "Inbox Omnicanale per Hotel - Email, WhatsApp, Chat | HotelAccelerator",
  description:
    "Gestisci tutte le comunicazioni del tuo hotel in un'unica inbox: Email, WhatsApp, Telegram, Chat. Rispondi da un solo posto, assegna a team, usa template. -50% tempo di risposta.",
  keywords: [
    "inbox omnicanale hotel",
    "gestione messaggi hotel",
    "whatsapp business hotel",
    "chat hotel",
    "comunicazione unificata hotel",
    "telegram hotel",
    "messaggistica hotel",
    "customer service hotel",
  ],
  openGraph: {
    title: "Inbox Omnicanale - Mai Più Messaggi Persi | HotelAccelerator",
    description: "Email, WhatsApp, Telegram, Chat in un'unica inbox. -50% tempo di risposta.",
    type: "website",
  },
  alternates: {
    canonical: "https://hotelaccelerator.com/features/inbox-omnicanale",
  },
}

const channels = [
  { icon: Mail, name: "Email", description: "Gmail, Outlook, IMAP" },
  { icon: MessagesSquare, name: "WhatsApp", description: "WhatsApp Business API" },
  { icon: MessageSquare, name: "Chat", description: "Widget per il sito" },
  { icon: Phone, name: "Telegram", description: "Bot Telegram integrato" },
]

const features = [
  {
    icon: Inbox,
    title: "Inbox Unificata",
    description:
      "Tutti i messaggi in un unico posto. Non saltare più tra email, WhatsApp, chat. Vista conversazione completa.",
  },
  {
    icon: Users,
    title: "Assegnazione Team",
    description: "Assegna conversazioni a receptionist, booking, management. Gestisci carichi di lavoro.",
  },
  {
    icon: Bot,
    title: "Risposte Rapide",
    description: "Template per domande frequenti. Risparmia tempo con risposte pre-impostate personalizzabili.",
  },
  {
    icon: Clock,
    title: "SLA e Priorità",
    description: "Imposta tempi di risposta target. Visualizza urgenze, evita messaggi dimenticati.",
  },
]

export default function InboxOmnichannelLandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "HotelAccelerator Inbox Omnicanale",
            applicationCategory: "BusinessApplication",
            description: "Inbox omnicanale per hotel con Email, WhatsApp, Chat e Telegram",
            operatingSystem: "Web",
          }),
        }}
      />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-7 w-7 text-white" />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                Accedi
              </Button>
            </Link>
            <Link href="/request-access">
              <Button size="sm" className="bg-white text-black hover:bg-gray-200">
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
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
              <ArrowRight className="h-4 w-4 rotate-180" />
              Torna alla home
            </Link>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-sm text-purple-400 mb-8">
              <MessageSquare className="h-4 w-4" />
              Inbox Omnicanale
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 text-balance">Mai più messaggi persi</h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
              <strong>Email, WhatsApp, Telegram e Chat</strong> in un'unica inbox. Rispondi da un solo posto, -50% tempo
              di risposta, 0 messaggi dimenticati.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/request-access">
                <Button size="lg" className="bg-purple-500 text-white hover:bg-purple-600 gap-2">
                  Prova l'Inbox
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Channels */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-12 border-y border-white/10">
            {channels.map((channel) => (
              <div key={channel.name} className="text-center p-4 rounded-xl bg-white/5">
                <channel.icon className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                <div className="font-medium">{channel.name}</div>
                <div className="text-xs text-gray-500">{channel.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Gestione messaggi semplice e potente</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature) => (
              <article key={feature.title} className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-4 bg-white/[0.02]">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Risultati che contano</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <div className="text-4xl font-bold text-purple-400 mb-2">-50%</div>
              <div className="text-gray-400">Tempo di risposta</div>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <div className="text-4xl font-bold text-purple-400 mb-2">0</div>
              <div className="text-gray-400">Messaggi persi</div>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <div className="text-4xl font-bold text-purple-400 mb-2">+40%</div>
              <div className="text-gray-400">Soddisfazione ospiti</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-b from-purple-500/20 to-purple-500/5 border border-purple-500/20">
            <MessageSquare className="h-12 w-12 text-purple-400 mx-auto mb-6" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Centralizza le tue comunicazioni</h2>
            <p className="text-gray-400 mb-8">Demo gratuita con collegamento al tuo WhatsApp Business.</p>
            <Link href="/request-access">
              <Button size="lg" className="bg-purple-500 text-white hover:bg-purple-600 gap-2">
                Richiedi Demo Gratuita
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <PlatformFooter />
    </div>
  )
}
