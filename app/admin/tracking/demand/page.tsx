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
              <CardContent className="text-sm text-ha-brand-soft-foreground space-y-1">
                <p>• Ricerche sul sito web</p>
                <p>• Richieste via chat</p>
                <p>• Email ricevute</p>
                <p>• Messaggi WhatsApp</p>
                <p>• Chiamate telefoniche (VoIP)</p>
                <p>• Script embed su altri siti</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
