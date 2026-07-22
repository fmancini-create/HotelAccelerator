import { DemoPage } from "@/components/sales/demo/demo-page"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/page-header"

const bookings = [
  { id: "BK-2451", guest: "Marco Bianchi", room: "Suite Vista Mare", checkin: "12 giu", checkout: "15 giu", channel: "Booking.com", amount: 920, status: "confirmed" },
  { id: "BK-2450", guest: "Julia Schmidt", room: "Deluxe Doppia", checkin: "13 giu", checkout: "18 giu", channel: "Sito diretto", amount: 1150, status: "confirmed" },
  { id: "BK-2449", guest: "Pierre Dubois", room: "Classic Matrimoniale", checkin: "14 giu", checkout: "16 giu", channel: "Expedia", amount: 380, status: "pending" },
  { id: "BK-2448", guest: "Anna Rossi", room: "Superior Tripla", checkin: "15 giu", checkout: "20 giu", channel: "Airbnb", amount: 875, status: "confirmed" },
  { id: "BK-2447", guest: "James Wilson", room: "Suite Vista Mare", checkin: "16 giu", checkout: "19 giu", channel: "Booking.com", amount: 920, status: "cancelled" },
  { id: "BK-2446", guest: "Sofia Esposito", room: "Deluxe Doppia", checkin: "17 giu", checkout: "21 giu", channel: "Sito diretto", amount: 920, status: "confirmed" },
  { id: "BK-2445", guest: "Hiroshi Tanaka", room: "Classic Matrimoniale", checkin: "18 giu", checkout: "22 giu", channel: "Expedia", amount: 760, status: "confirmed" },
  { id: "BK-2444", guest: "Elena Conti", room: "Superior Tripla", checkin: "19 giu", checkout: "23 giu", channel: "Booking.com", amount: 700, status: "confirmed" },
]

const statusMap = {
  confirmed: { label: "Confermata", className: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100" },
  pending: { label: "In attesa", className: "bg-amber-100 text-amber-900 hover:bg-amber-100" },
  cancelled: { label: "Cancellata", className: "bg-rose-100 text-rose-900 hover:bg-rose-100" },
}

export default function DemoBookingsPage() {
  return (
    <DemoPage
      title="Prenotazioni"
      narration="Qui trovi tutte le prenotazioni della tua struttura, da qualsiasi canale: Booking, Expedia, Airbnb, il tuo sito diretto. Puoi filtrare per data, canale, stato, cercare per nome ospite. Cliccando su una prenotazione vedi tutti i dettagli, scarichi documenti, gestisci servizi extra e modifiche. Ogni movimento si sincronizza in tempo reale con il channel manager e il P.M.S."
    >
      <PageHeader title="Prenotazioni" description="Tutte le prenotazioni di Hotel Santaddeo, da ogni canale" />
      <div className="container mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cerca per ospite, ID, camera..." className="pl-9" />
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" /> Filtri
          </Button>
          <div className="ml-auto text-sm text-muted-foreground">{bookings.length} prenotazioni</div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Ospite</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Camera</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Check-in</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Check-out</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Canale</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Importo</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Stato</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const st = statusMap[b.status as keyof typeof statusMap]
                  return (
                    <tr key={b.id} className="border-t hover:bg-muted/30 cursor-pointer">
                      <td className="px-4 py-3 font-mono text-xs">{b.id}</td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{b.guest}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{b.room}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{b.checkin}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{b.checkout}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{b.channel}</td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">€ {b.amount}</td>
                      <td className="px-4 py-3"><Badge className={st.className}>{st.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Confermate (mese)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">142</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">In attesa</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">8</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Cancellation rate</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">4.2%</div></CardContent>
          </Card>
        </div>
      </div>
    </DemoPage>
  )
}
