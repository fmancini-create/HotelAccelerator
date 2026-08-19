import { CalendarClock, CircleDollarSign } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const stages = [
  { name: "Nuovo Lead", deals: [{ company: "Hotel Firenze", contact: "Giulia Neri", value: "€ 2.400", product: "ST", next: "Oggi" }] },
  { name: "Da contattare", deals: [{ company: "Borgo Chianti", contact: "Luca Conti", value: "€ 1.800", product: "HA", next: "Oggi" }] },
  { name: "Qualificato", deals: [{ company: "Resort Mare", contact: "Paolo Blu", value: "€ 3.600", product: "HP", next: "Domani" }] },
  { name: "Demo fissata", deals: [{ company: "Villa Verde", contact: "Sara Mori", value: "€ 2.900", product: "MB", next: "14 Ago" }] },
  { name: "Proposta", deals: [{ company: "Hotel Centro", contact: "Anna Belli", value: "€ 4.200", product: "ST", next: "15 Ago" }] },
  { name: "Negoziazione", deals: [{ company: "Grand Hotel Roma", contact: "M. Ricci", value: "€ 7.200", product: "HA", next: "16 Ago" }] },
]

export default function CrmPipelinePage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Pipeline</h1><p className="text-muted-foreground">Opportunità commerciali. Per il Superadmin i badge identificano i prodotti 4 BID.</p></div>
      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-4">
          {stages.map((stage) => (
            <section key={stage.name} className="w-[280px] rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{stage.name}</h2><Badge variant="secondary">{stage.deals.length}</Badge></div>
              <div className="space-y-3">
                {stage.deals.map((deal) => (
                  <Card key={deal.company} className="shadow-sm"><CardHeader className="p-4 pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="text-sm">{deal.company}</CardTitle><Badge variant="outline">{deal.product}</Badge></div><p className="text-xs text-muted-foreground">{deal.contact}</p></CardHeader><CardContent className="space-y-2 p-4 pt-1 text-xs"><div className="flex items-center gap-2"><CircleDollarSign className="h-3.5 w-3.5" />{deal.value}</div><div className="flex items-center gap-2 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />Prossima attività: {deal.next}</div></CardContent></Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Vista demo senza persistenza e senza drag & drop: nessun dato viene scritto nel database.</p>
    </div>
  )
}
