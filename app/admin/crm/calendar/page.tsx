import { CalendarDays, Clock3, Phone, Presentation } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const days = [
  { day: "Giovedì 13", events: [{ time: "10:30", title: "Richiamo Hotel Toscana", Icon: Phone }, { time: "15:00", title: "Demo Santaddeo — Borgo Chianti", Icon: Presentation }] },
  { day: "Venerdì 14", events: [{ time: "09:30", title: "Primo contatto Resort Mare", Icon: Phone }, { time: "16:00", title: "Demo HotelAccelerator — Villa Verde", Icon: Presentation }] },
  { day: "Lunedì 17", events: [{ time: "11:00", title: "Follow-up Grand Hotel Roma", Icon: Phone }] },
]

export default function CrmCalendarPage() {
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold tracking-tight">Calendario CRM</h1><p className="text-muted-foreground">Agenda commerciale per richiami, demo e follow-up.</p></div><div className="grid gap-4 lg:grid-cols-3">{days.map((day) => <Card key={day.day}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" />{day.day}</CardTitle></CardHeader><CardContent className="space-y-3">{day.events.map(({ time, title, Icon }) => <div key={`${time}-${title}`} className="rounded-lg border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{time}</div><div className="mt-2 flex items-start gap-2 text-sm font-medium"><Icon className="mt-0.5 h-4 w-4" />{title}</div></div>)}</CardContent></Card>)}</div><p className="text-xs text-muted-foreground">Vista demo locale. L'integrazione con calendario e attività reali verrà collegata in uno step successivo.</p></div>
}
