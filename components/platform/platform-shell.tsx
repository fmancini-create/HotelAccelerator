/**
 * PlatformShell
 *
 * Struttura comune a tutte le pagine interne (admin):
 *   [ PlatformHeader    ]  altezza fissa: navigazione, tenant, utente
 *   [ license row       ]  opzionale, non sovrapposta all'header
 *   [ <main>            ]  flex-1, gestisce il proprio scorrimento
 *       ...contenuto
 *       [ PlatformFooter ] footer completo, SCORRE COL CONTENUTO
 *   [ PlatformFooterBar ]  barra sottile fissata, solo pagine a tutta altezza
 *
 * Perche' il footer completo sta DENTRO <main> e non sotto di esso: la
 * struttura e' una colonna rigida di 100dvh, quindi tutto cio' che si trova
 * fuori da <main> sottrae altezza al contenuto. Un footer alto in quella
 * posizione restringerebbe l'area di lavoro di ogni pagina. Dentro l'area che
 * scorre, invece, si comporta come nelle pagine pubbliche: sta in fondo al
 * contenuto e lo si raggiunge scorrendo.
 *
 * Le pagine in stile Gmail (Inbox) occupano da sole tutta l'altezza e non
 * devono avere nulla sotto: per quelle il footer completo si toglie di mezzo e
 * subentra la barra sottile fissata. I due componenti si escludono a vicenda
 * leggendo la stessa regola, quindi nessuna pagina resta senza footer.
 *
 * Resta di proposito un componente server, cosi' il layout radice dell'area
 * admin non trascina l'intero sottoalbero in "use client".
 */

import type React from "react"
import { PlatformHeader } from "@/components/platform/platform-header"
import { CustomerLicenseBadge } from "@/components/platform/customer-license-badge"
import { PlatformFooter, PlatformFooterBar } from "@/components/platform/platform-footer"

export function PlatformShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-platform-shell className="h-[100dvh] flex flex-col bg-muted/40 overflow-hidden">
      <PlatformHeader />
      <div className="flex-shrink-0 border-b border-border bg-white px-3 py-1 sm:px-4">
        <div className="flex justify-end">
          <CustomerLicenseBadge />
        </div>
      </div>
      <main className="flex-1 min-h-0 overflow-auto bg-white">
        {children}
        <PlatformFooter />
      </main>
      <PlatformFooterBar />
    </div>
  )
}
