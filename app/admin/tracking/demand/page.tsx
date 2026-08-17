import { AdminHeader } from "@/components/admin/admin-header"
import { DemandCalendar } from "@/components/admin/demand-calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, BarChart3 } from "lucide-react"

export default function DemandTrackingPage() {
  return (
    <div className="min-h-full bg-muted">
      <AdminHeader title="Calendario Domanda" subtitle="Monitora le date più cercate dai tuoi potenziali ospiti" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calendario principale */}
          <div className="lg:col-span-2">
            <DemandCalendar />
          </div>

          {/* Sidebar con info */}
          <div className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                  <BarChart3 className="h-5 w-5 text-ha-info-soft-foreground" />
                  Come funziona
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-ha-brand-soft-foreground space-y-2">
                <p>
                  Il calendario mostra l&apos;intensità della domanda basata sulle ricerche dei tuoi potenziali ospiti.
                </p>
                <p>
                  <strong className="text-foreground">Verde</strong> = Bassa domanda
                </p>
                <p>
                  <strong className="text-foreground">Giallo</strong> = Domanda media
                </p>
                <p>
                  <strong className="text-foreground">Arancione</strong> = Alta domanda
                </p>
                <p>
                  <strong className="text-foreground">Rosso</strong> = Domanda molto alta
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                  <Calendar className="h-5 w-5 text-ha-success-soft-foreground" />
                  Sorgenti Tracciate
                </CardTitle>
              </CardHeader>
              {/* Si elencano le sorgenti LETTE davvero. L'elenco precedente
                  prometteva "ricerche sul sito web" e "script embed su altri
                  siti": nessuno dei due viene scritto da nessuna parte (la
                  tabella `events` e' a zero righe), quindi la pagina dichiarava
                  una copertura che non ha - e un operatore che non vede
                  comparire le ricerche del sito lo legge come un guasto, non
                  come una funzione assente. */}
              <CardContent className="text-sm text-ha-brand-soft-foreground space-y-1">
                <p>• Email ricevute</p>
                <p>• Messaggi WhatsApp</p>
                <p>• Chat e Telegram</p>
                <p>• Chiamate telefoniche (solo i dati della chiamata)</p>
                <p className="pt-2 text-xs">
                  Quali di queste leggere lo decide la scheda{" "}
                  <strong className="text-foreground">Cervello</strong> di ogni gruppo di lavoro.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
