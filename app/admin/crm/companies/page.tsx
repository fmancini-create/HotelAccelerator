import { Building2, Mail, Phone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const companies = [
  { name: "Hotel Aurora", city: "Firenze", category: "4 stelle", rooms: 42, phone: "+39 055 123456", email: "direzione@hotelaurora.it", status: "Qualificato", owner: "Filippo", value: "€ 4.800" },
  { name: "Borgo Toscano", city: "Siena", category: "Resort", rooms: 28, phone: "+39 0577 456789", email: "info@borgotoscano.it", status: "Demo", owner: "Commerciale 1", value: "€ 3.600" },
  { name: "Resort Panorama", city: "Roma", category: "4 stelle", rooms: 67, phone: "+39 06 987654", email: "gm@resortpanorama.it", status: "Nuovo lead", owner: "Commerciale 2", value: "€ 7.200" },
]

export default function CrmCompaniesPage() {
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold tracking-tight">Aziende / Hotel</h1><p className="text-muted-foreground">Anagrafiche commerciali collegate a contatti, opportunità e telefonate.</p></div><Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Struttura", "Città", "Categoria", "Camere", "Contatti", "Stato", "Owner", "Valore potenziale"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y">{companies.map((company) => <tr key={company.name} className="hover:bg-muted/20"><td className="px-4 py-3 font-medium"><span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{company.name}</span></td><td className="px-4 py-3">{company.city}</td><td className="px-4 py-3">{company.category}</td><td className="px-4 py-3">{company.rooms}</td><td className="px-4 py-3"><div className="space-y-1 text-xs"><div className="flex items-center gap-1"><Phone className="h-3 w-3" />{company.phone}</div><div className="flex items-center gap-1"><Mail className="h-3 w-3" />{company.email}</div></div></td><td className="px-4 py-3"><Badge variant="secondary">{company.status}</Badge></td><td className="px-4 py-3">{company.owner}</td><td className="px-4 py-3 font-semibold">{company.value}</td></tr>)}</tbody></table></div><div className="border-t px-4 py-3 text-xs text-muted-foreground">Dati demo locali. La futura implementazione server-side applicherà lo scope tenant.</div></CardContent></Card></div>
}
