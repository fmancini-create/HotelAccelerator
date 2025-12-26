import { AdminHeader } from "@/components/admin/admin-header"
import { DemandCalendar } from "@/components/admin/demand-calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, BarChart3 } from "lucide-react"

export default function DemandTrackingPage() {
  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <AdminHeader title="Calendario Domanda" subtitle="Monitora le date più cercate dai tuoi potenziali ospiti" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calendario principale */}
          <div className="lg:col-span-2">
            <DemandCalendar />
          </div>

          {/* Sidebar con info */}
          <div className="space-y-4">
            <Card className="bg-white border-[#e8e0d8]">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-[#5c4a3a]">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  Come funziona
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[#8b7355] space-y-2">
                <p>
                  Il calendario mostra l&apos;intensità della domanda basata sulle ricerche dei tuoi potenziali ospiti.
                </p>
                <p>
                  <strong className="text-[#5c4a3a]">Verde</strong> = Bassa domanda
                </p>
                <p>
                  <strong className="text-[#5c4a3a]">Giallo</strong> = Domanda media
                </p>
                <p>
                  <strong className="text-[#5c4a3a]">Arancione</strong> = Alta domanda
                </p>
                <p>
                  <strong className="text-[#5c4a3a]">Rosso</strong> = Domanda molto alta
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-[#e8e0d8]">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-[#5c4a3a]">
                  <Calendar className="h-5 w-5 text-green-600" />
                  Sorgenti Tracciate
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[#8b7355] space-y-1">
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
