import type React from "react"

import { CustomerLicenseBadge } from "@/components/platform/customer-license-badge"
import { PlatformFooter, PlatformFooterBar } from "@/components/platform/platform-footer"
import { SuperAdminCrmQuickNav } from "@/components/platform/super-admin-crm-quick-nav"
import { SuperAdminHeader } from "@/components/platform/super-admin-header"
import { TenantHeader } from "@/components/platform/tenant-header"

export type PlatformShellScope = "tenant" | "platform"

/**
 * Cornice tecnica condivisa, con due contesti di prodotto volutamente distinti.
 *
 * `tenant` governa una singola struttura: menu operativo, TenantSwitcher e
 * stato licenza. `platform` governa HotelAccelerator nel suo complesso: menu
 * Super Admin, dati aggregati e nessun selettore/licenza di un singolo cliente.
 * Condividere il contenitore evita di duplicare footer e comportamento di
 * scrolling senza mischiare le due navigazioni.
 */
export function PlatformShell({
  children,
  scope = "tenant",
}: {
  children: React.ReactNode
  scope?: PlatformShellScope
}) {
  const isPlatform = scope === "platform"

  return (
    <div
      data-platform-shell
      data-platform-scope={scope}
      className="h-[100dvh] flex flex-col bg-muted/40 overflow-hidden"
    >
      {isPlatform ? <SuperAdminHeader /> : <TenantHeader />}

      {isPlatform ? (
        <div className="flex-shrink-0 border-b border-border bg-muted px-3 py-1 sm:px-4">
          <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wide text-foreground">Contesto piattaforma</span>
            <span className="hidden sm:inline">Dati e configurazioni trasversali a tutti i tenant</span>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 border-b border-border bg-white px-3 py-1 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contesto tenant</span>
            <CustomerLicenseBadge />
          </div>
        </div>
      )}

      {isPlatform && <SuperAdminCrmQuickNav />}

      <main className="flex-1 min-h-0 overflow-auto bg-white">
        {children}
        <PlatformFooter />
      </main>
      <PlatformFooterBar />
    </div>
  )
}
