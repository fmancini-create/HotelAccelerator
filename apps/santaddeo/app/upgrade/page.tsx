import type { Metadata } from "next"
import Link from "next/link"
import {
  Shield,
  Target,
  Calendar,
  TrendingUp,
  BedDouble,
  ListChecks,
  ArrowRight,
  Check,
  Lock,
  AlertTriangle,
  Clock,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "Sblocca Accelerator | SANTADDEO",
  description:
    "Attiva il piano Accelerator per accedere a Guard, Obiettivi, Calendario, Produzione per Canali, Disponibilita e Log invio prezzi.",
  // SEO 06/05/2026: pagina post-login per utenti autenticati. Non deve
  // apparire in SERP (la pagina pubblica equivalente è /upgrade/hotel-accelerator).
  // noindex meta come defense-in-depth (oltre al robots.txt che NON la blocca
  // perche' /upgrade/ resta linkato dalle CTA email).
  robots: { index: false, follow: true },
}

export default function UpgradePage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      {/* HERO */}
      <div className="mb-12 rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-cyan-50 border border-emerald-100 p-8 md:p-12">
        <div className="flex items-start gap-4 mb-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <Sparkles className="h-7 w-7" />
          </div>
          <div>
            <Badge variant="outline" className="mb-2 border-emerald-200 bg-white text-emerald-700">
              Piano Accelerator
            </Badge>
            <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight text-balance">
              Sblocca tutto il potenziale della tua struttura
            </h1>
          </div>
        </div>
        <p className="max-w-3xl text-lg text-muted-foreground leading-relaxed">
          Stai usando solo una parte di SANTADDEO. Con <strong className="text-foreground">Accelerator</strong> attivi 6
          strumenti che ti fanno guadagnare di piu&apos;, lavorare meno e tenere sotto controllo tutte le OTA in tempo reale.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link href="/upgrade/hotel-accelerator">
            <Button size="lg" className="h-12 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full sm:w-auto">
              Scegli il tuo piano
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/landing/guard">
            <Button size="lg" variant="outline" className="h-12 gap-2 w-full sm:w-auto">
              Scopri Guard in dettaglio
            </Button>
          </Link>
        </div>
      </div>

      {/* GUARD HERO - sezione dedicata, focus principale */}
      <div className="mb-12 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 md:p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-red-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-400 ring-1 ring-red-500/30">
              <Shield className="h-7 w-7" />
            </div>
            <div>
              <Badge className="mb-2 bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/20">
                Strumento di punta
              </Badge>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-balance">
                Guard: scopri quando le OTA ti vendono al prezzo sbagliato
              </h2>
            </div>
          </div>
          <p className="text-lg text-slate-300 leading-relaxed mb-8 max-w-3xl">
            Booking.com, Expedia e tutte le altre piattaforme a volte mostrano i tuoi prezzi con ritardo, applicano sconti
            non autorizzati o cachano tariffe vecchie. <strong className="text-white">Guard confronta automaticamente
            ogni prenotazione</strong> con il prezzo che avresti dovuto vendere e ti segnala in tempo reale ogni
            sotto-prezzo.
          </p>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <AlertTriangle className="h-6 w-6 text-red-400 mb-3" />
              <div className="font-bold text-white mb-1">Sotto-prezzo identificato</div>
              <p className="text-sm text-slate-400">Ogni prenotazione ricevuta sotto il tuo prezzo atteso e&apos; segnalata in rosso con la differenza in % e in euro.</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <Clock className="h-6 w-6 text-amber-400 mb-3" />
              <div className="font-bold text-white mb-1">Confronto temporale</div>
              <p className="text-sm text-slate-400">Vedi l&apos;ora esatta in cui e&apos; arrivata la prenotazione e l&apos;ora dell&apos;ultimo prezzo che avevi inviato al PMS.</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <Check className="h-6 w-6 text-emerald-400 mb-3" />
              <div className="font-bold text-white mb-1">Prove documentate</div>
              <p className="text-sm text-slate-400">Esporta i mismatch per contestare le commissioni con le OTA. Niente piu&apos; perdite silenziose.</p>
            </div>
          </div>

          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5 flex items-start gap-3">
            <div className="text-3xl font-black text-emerald-300">3-7%</div>
            <div className="text-sm text-slate-300 leading-relaxed">
              <strong className="text-white">Tipico recovery</strong> di RevPAR ottenuto dalle strutture che attivano Guard
              nei primi 3 mesi, intercettando sotto-prezzi su Booking.com e errori di mappatura tariffe.
            </div>
          </div>
        </div>
      </div>

      {/* ALTRE FEATURE - grid */}
      <div className="mb-12">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 text-balance">E con Accelerator hai anche</h2>
        <p className="text-muted-foreground mb-8">Cinque strumenti aggiuntivi per il controllo totale della tua struttura.</p>

        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            icon={<Target className="h-6 w-6" />}
            color="bg-blue-500/10 text-blue-600"
            title="Obiettivi"
            description="Imposta target di produzione mensili per camera e tariffa. Verifica giorno per giorno se sei in linea con il budget annuo."
            highlights={["Target di camera/notte", "Confronto YoY automatico", "Stati prenotazione personalizzabili"]}
          />
          <FeatureCard
            icon={<Calendar className="h-6 w-6" />}
            color="bg-purple-500/10 text-purple-600"
            title="Calendario"
            description="Una vista mese per mese di tutte le prenotazioni, occupazione, RevPAR e ADR per ogni notte."
            highlights={["Heatmap di occupazione", "Drill-down per giorno", "Filtro multi-camera"]}
          />
          <FeatureCard
            icon={<TrendingUp className="h-6 w-6" />}
            color="bg-orange-500/10 text-orange-600"
            title="Produzione per Canali"
            description="Sapevi che Booking ti porta il 60% della produzione ma il 70% dei reclami? Vedi il vero peso di ogni OTA."
            highlights={["Mix per canale", "Tasso cancellazione per OTA", "Trend trimestrale"]}
          />
          <FeatureCard
            icon={<BedDouble className="h-6 w-6" />}
            color="bg-cyan-500/10 text-cyan-600"
            title="Disponibilita"
            description="Controlla in tempo reale camere occupate, libere e in pulizia. Niente piu&apos; overbooking."
            highlights={["Vista Gantt", "Rooms-sold per data", "Integrazione PMS"]}
          />
          <FeatureCard
            icon={<ListChecks className="h-6 w-6" />}
            color="bg-amber-500/10 text-amber-600"
            title="Log invio prezzi"
            description="Tracciato completo di OGNI prezzo inviato al PMS: data, ora, valore precedente, esito. Audit trail per debugging e contestazioni."
            highlights={["Storia ogni cella", "Retry automatici", "Export CSV"]}
          />
          <FeatureCard
            icon={<Sparkles className="h-6 w-6" />}
            color="bg-emerald-500/10 text-emerald-600"
            title="AutoPilot pricing"
            description="Il pricing engine che aggiorna automaticamente i prezzi su tutti i canali in base alla tua strategia, 24/7."
            highlights={["Algoritmo elastico", "Notify o full auto", "Email su ogni variazione"]}
            badge="incluso"
          />
        </div>
      </div>

      {/* CTA finale */}
      <div className="rounded-3xl bg-foreground text-background p-8 md:p-12 text-center">
        <Lock className="h-10 w-10 mx-auto mb-4 text-background/60" />
        <h2 className="text-2xl md:text-3xl font-bold mb-3 text-balance">Pronto a sbloccare tutto?</h2>
        <p className="text-background/70 mb-6 max-w-xl mx-auto leading-relaxed">
          Setup in 15 minuti, attivazione immediata. Funziona con Scidoo, Bedzzle e altri PMS.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/upgrade/hotel-accelerator">
            <Button size="lg" className="h-12 gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold w-full sm:w-auto">
              Scegli il tuo piano
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/landing/guard">
            <Button size="lg" variant="outline" className="h-12 gap-2 bg-transparent border-background/20 text-background hover:bg-background/10 w-full sm:w-auto">
              Approfondisci Guard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  color,
  title,
  description,
  highlights,
  badge,
}: {
  icon: React.ReactNode
  color: string
  title: string
  description: string
  highlights: string[]
  badge?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
          {icon}
        </div>
        {badge && (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            {badge}
          </Badge>
        )}
      </div>
      <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{description}</p>
      <ul className="space-y-1.5">
        {highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
