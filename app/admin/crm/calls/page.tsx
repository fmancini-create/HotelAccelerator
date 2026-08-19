import { ArrowDownLeft, ArrowUpRight, Clock3, PhoneCall, PhoneMissed, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CrmCallPanel } from "@/components/crm/crm-call-panel"

const calls = [
  { time: "09:42", contact: "Marco Bianchi", company: "Hotel Aurora", number: "+39 055 123456", direction: "Outbound", outcome: "Risposta", duration: "04:18", operator: "Commerciale 1" },
  { time: "09:18", contact: "Laura Rossi", company: "Borgo Toscano", number: "+39 0577 456789", direction: "Inbound", outcome: "Risposta", duration: "02:41", operator: "Commerciale 1" },
  { time: "08:56", contact: "Andrea Verdi", company: "Resort Panorama", number: "+39 06 987654", direction: "Outbound", outcome: "Non risposta", duration: "—", operator: "Commerciale 2" },
]

const stats = [
  ["Chiamate oggi", "18", PhoneCall],
  ["Risposte", "11", Users],
  ["Non risposte", "7", PhoneMissed],
  ["Durata media", "03:26", Clock3],
]

export default function CrmCallsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Chiamate</h1>
        <p className="text-muted-foreground">Postazione telefonica CRM predisposta per l'integrazione 3CX.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value, Icon]) => (
          <Card key={label as string}><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">{label as string}</p><p className="text-2xl font-bold">{value as string}</p></div><Icon className="h-5 w-5 text-muted-foreground" /></CardContent></Card>
        ))}
      </div>
      <CrmCallPanel />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Ora", "Contatto", "Azienda", "Numero", "Direzione", "Esito", "Durata", "Operatore"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
              <tbody className="divide-y">
                {calls.map((call) => <tr key={`${call.time}-${call.number}`} className="hover:bg-muted/20"><td className="px-4 py-3">{call.time}</td><td className="px-4 py-3 font-medium">{call.contact}</td><td className="px-4 py-3">{call.company}</td><td className="px-4 py-3 font-mono text-xs">{call.number}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1">{call.direction === "Inbound" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}{call.direction}</span></td><td className="px-4 py-3"><Badge variant={call.outcome === "Risposta" ? "secondary" : "outline"}>{call.outcome}</Badge></td><td className="px-4 py-3">{call.duration}</td><td className="px-4 py-3">{call.operator}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">Dati demo locali: nessuna scrittura sul database.</div>
        </CardContent>
      </Card>
    </div>
  )
}
