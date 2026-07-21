"use client"

/**
 * Toggle netto/lordo IVA mostrato nell'header condiviso.
 * Visibile solo nelle pagine KPI che fanno lo scorporo lato server.
 * Cambia la vista PERSONALE (localStorage), non l'impostazione del tenant.
 */

import { usePathname } from "next/navigation"
import { useVatView } from "@/lib/contexts/vat-view-context"
import { cn } from "@/lib/utils"

// Pagine con KPI economici scorporabili (vedi route server con vatView).
// NB: /dati/production NON e' qui: la sua route non fa scorporo. La produzione
// fiscale scorporata sta in /api/dashboard/production (card della Dashboard).
const VAT_PAGES = [
  "/dashboard",
  "/dati/analytics",
  "/dati/objectives",
  "/accelerator/trend",
  "/accelerator/pace",
]

export function VatViewToggle({ className }: { className?: string }) {
  const pathname = usePathname()
  const { effectiveView, tenantDefault, setVatView, ready } = useVatView()

  const onVatPage = VAT_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))
  if (!onVatPage || !ready) return null

  const isNet = effectiveView === "net"

  // Quando l'utente sceglie la stessa modalita' del default tenant, azzeriamo
  // l'override (torna a "nessun param", riusa la cache del default).
  const choose = (view: "gross" | "net") => {
    setVatView(view === tenantDefault ? null : view)
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-input bg-background p-0.5 text-xs font-medium",
        className,
      )}
      role="group"
      aria-label="Visualizzazione IVA importi"
      title="Mostra gli importi IVA inclusa (lordo) o IVA esclusa (netto). Preferenza personale, non cambia l'impostazione della struttura."
    >
      <button
        type="button"
        onClick={() => choose("gross")}
        aria-pressed={!isNet}
        className={cn(
          "rounded px-2 py-1 transition-colors",
          !isNet ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Lordo
      </button>
      <button
        type="button"
        onClick={() => choose("net")}
        aria-pressed={isNet}
        className={cn(
          "rounded px-2 py-1 transition-colors",
          isNet ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Netto
      </button>
    </div>
  )
}
