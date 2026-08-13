import { CalendarClock, CheckCircle2, Phone, Presentation, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const activities = [
  { title: "Richiamare Hotel Toscana", type: "Chiamata", when: "Oggi 10:30", owner: "Commerciale 1", status: "Da fare", Icon: Phone },
  { title: "Demo Santaddeo — Borgo Chianti", type: "Demo", when: "Oggi 15:00", owner: "Filippo", status: "Confermata", Icon: Presentation },
  { title: "Follow-up proposta Hotel Centro", type: "Follow-up", when: "Oggi 16:30", owner: "Commerciale 2", status: "Da fare", Icon: RotateCcw },
  { title: "Contattare nuovo lead Resort Mare", type: "Chiamata", when: "Domani 09:30", owner: "Commerciale 1", status: "Pianificata", Icon: CalendarClock },
]

export default function CrmActivitiesPage() {
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold tracking-tight">Attività</h1><p className="text-muted-foreground">Follow-up, demo e richiami della squadra commerciale.</p></div><div className="space-y-3">{activities.map(({ title, type, when, owner, status, Icon }) => <Card key={title}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4" /></div><div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{type} · {when} · {owner}</p></div></div><Badge variant={status === "Confermata" ? "secondary" : "outline"}><CheckCircle2 className="mr-1 h-3 w-3" />{status}</Badge></CardContent></Card>)}</div><p className="text-xs text-muted-foreground">Dati demo locali, nessuna persistenza.</p></div>
}
