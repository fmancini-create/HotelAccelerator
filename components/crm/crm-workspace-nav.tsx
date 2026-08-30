"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, BrainCircuit, Database, Building2, CalendarDays, KanbanSquare, ListTodo, Phone, Settings, Users } from "lucide-react"

// Ogni sezione dell'area CRM va elencata qui: questa barra e' l'unico indice completo
// del perimetro. Una pagina che esiste ma non compare sembra un pezzo mancante del
// prodotto, anche quando e' raggiungibile da un link altrove.
//
// L'elenco e' sorvegliato da `pnpm check:crm-nav`, che confronta le voci con le
// cartelle reali sotto app/admin/crm nei due versi: una sezione senza voce e una voce
// senza pagina fanno arrossire la prova.
const items = [
  { href: "/admin/crm", label: "Dashboard", icon: BarChart3, exact: true },
  { href: "/admin/crm/intelligence", label: "Vendite IA", icon: BrainCircuit },
  { href: "/admin/crm/contacts", label: "Contatti", icon: Users },
  { href: "/admin/crm/companies", label: "Aziende / Hotel", icon: Building2 },
  { href: "/admin/crm/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/admin/crm/activities", label: "Attività", icon: ListTodo },
  { href: "/admin/crm/calls", label: "Chiamate", icon: Phone },
  { href: "/admin/crm/calendar", label: "Calendario", icon: CalendarDays },
  // "PMS" e' l'etichetta che la dashboard CRM usa già per questa pagina: tenerla
  // identica evita due nomi per la stessa cosa, e fa stare le voci nella barra
  // senza tracimare (misurato a schermo: oltre ~95 caratteri l'ultima viene tagliata).
  //
  // Punta al GESTIONALE, non alla configurazione: il gestionale e' quello che si
  // apre ogni giorno, mentre le credenziali si impostano una volta. La
  // configurazione ora sta fra le Impostazioni (voce "Collegamento gestionale"),
  // e `pnpm check:crm-nav` verifica che ci sia davvero: se qualcuno la togliesse
  // da la', quella pagina resterebbe senza nessuna porta d'ingresso.
  { href: "/admin/crm/pms-sync/gestionale", label: "PMS", icon: Database },
  { href: "/admin/crm/settings", label: "Impostazioni", icon: Settings },
]

export function CrmWorkspaceNav() {
  const pathname = usePathname() || ""
  return (
    <nav data-crm-workspace-nav className="border-b bg-white px-4 sm:px-6" aria-label="Sezioni CRM">
      <div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto py-2">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-ha-brand-soft text-ha-brand-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
