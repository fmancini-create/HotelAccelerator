"use client"

/**
 * TenantSwitcher
 *
 * Renders a tenant selector in the admin header.
 *  - super_admin: dropdown with all properties, can switch freely
 *  - tenant_admin (single property): shows the property name as a read-only
 *    badge for context (no selection, no menu)
 *  - role "none": renders nothing (hidden)
 *
 * Source of truth: GET /api/platform/me. Switch action: POST /api/platform/switch-tenant.
 * After a successful switch the browser performs a full reload. This is an
 * intentional security boundary: Next.js router.refresh() preserves Client
 * Component state, which can otherwise keep rows from the previous tenant on
 * screen even after the active-property cookie has changed.
 */

import { useState } from "react"
import useSWR from "swr"
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

type PlatformMe = {
  role: "super_admin" | "tenant_admin" | "member" | "none"
  email?: string
  name?: string
  tenants: Array<{ id: string; name: string; subdomain: string | null }>
  activePropertyId: string | null
}

const fetcher = async (url: string): Promise<PlatformMe> => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) return { role: "none", tenants: [], activePropertyId: null }
  return res.json()
}

export function TenantSwitcher() {
  const { data, isLoading } = useSWR<PlatformMe>("/api/platform/me", fetcher, {
    revalidateOnFocus: false,
  })
  const [switching, setSwitching] = useState(false)
  const [open, setOpen] = useState(false)

  if (isLoading || !data || data.role === "none") return null

  const selected = data.tenants.find((t) => t.id === data.activePropertyId) ?? null

  if (data.role === "tenant_admin" || data.role === "member") {
    const active = selected ?? data.tenants[0]
    if (!active) return null
    return (
      <div
        className="flex h-8 max-w-9 items-center gap-2 rounded-md bg-[#f3f4f6] px-2 text-xs text-[#374151] sm:max-w-[220px] sm:px-3"
        title={active.subdomain || active.name}
        aria-label={`Tenant attivo: ${active.name}`}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
        <span className="hidden max-w-[180px] truncate font-medium sm:inline">{active.name}</span>
      </div>
    )
  }

  const handleSwitch = async (propertyId: string) => {
    if (propertyId === data.activePropertyId || switching) return
    setSwitching(true)
    try {
      const res = await fetch("/api/platform/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ propertyId }),
      })
      if (!res.ok) {
        console.error("[v0] switch-tenant failed", await res.text())
        return
      }
      setOpen(false)
      window.location.reload()
    } finally {
      setSwitching(false)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 border-[#d1d5db] bg-white px-2 text-xs font-medium text-[#1f2937] hover:bg-[#f9fafb] sm:gap-2 sm:px-3"
          aria-label={selected ? `Seleziona tenant. Attivo: ${selected.name}` : "Seleziona tenant"}
          disabled={switching}
        >
          {switching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Building2 className="h-3.5 w-3.5 text-[#6b7280]" />
          )}
          <span className="hidden max-w-[180px] truncate sm:inline">{selected?.name ?? "Scegli la struttura"}</span>
          <ChevronsUpDown className="h-3 w-3 text-[#9ca3af]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[75] w-64 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-[#6b7280]">
          Tenant disponibili ({data.tenants.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {data.tenants.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-[#6b7280]">Nessun tenant disponibile</div>
        )}
        {data.tenants.map((tenant) => {
          const isActive = tenant.id === data.activePropertyId
          return (
            <DropdownMenuItem
              key={tenant.id}
              onClick={() => handleSwitch(tenant.id)}
              className="flex cursor-pointer items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{tenant.name}</div>
                {tenant.subdomain && <div className="truncate text-[11px] text-[#6b7280]">{tenant.subdomain}</div>}
              </div>
              {isActive && <Check className="h-4 w-4 shrink-0 text-[#0b57d0]" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
