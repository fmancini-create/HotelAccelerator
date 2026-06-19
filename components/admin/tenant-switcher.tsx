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
 * After a successful switch the whole app is re-rendered (router.refresh + mutate)
 * so every SWR cache (scoped by tenant) reloads against the new property_id.
 */

import { useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { useRouter } from "next/navigation"
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
  if (!res.ok) {
    // For 401 we still return a "none" shape so the UI can render without errors.
    return { role: "none", tenants: [], activePropertyId: null }
  }
  return res.json()
}

export function TenantSwitcher() {
  const router = useRouter()
  const { data, isLoading, mutate } = useSWR<PlatformMe>("/api/platform/me", fetcher, {
    revalidateOnFocus: false,
  })
  const [switching, setSwitching] = useState(false)
  const [open, setOpen] = useState(false)

  if (isLoading || !data || data.role === "none") {
    return null
  }

  const active = data.tenants.find((t) => t.id === data.activePropertyId) || data.tenants[0]

  // Tenant admin or non-admin member on a single property: show a read-only
  // badge for context (only super_admins get the full switcher below).
  if (data.role === "tenant_admin" || data.role === "member") {
    if (!active) return null
    return (
      <div
        className="flex items-center gap-2 px-3 h-8 rounded-md bg-[#f3f4f6] text-[#374151] text-xs"
        title={active.subdomain || active.name}
        aria-label={`Tenant attivo: ${active.name}`}
      >
        <Building2 className="h-3.5 w-3.5 text-[#6b7280]" />
        <span className="truncate max-w-[180px] font-medium">{active.name}</span>
      </div>
    )
  }

  // Super admin: full switcher.
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
      await mutate()
      // Invalidate every SWR cache (most keys are tenant-scoped).
      await globalMutate(() => true, undefined, { revalidate: true })
      router.refresh()
      setOpen(false)
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
          className="h-8 gap-2 text-xs font-medium border-[#d1d5db] text-[#1f2937] bg-white hover:bg-[#f9fafb]"
          aria-label="Seleziona tenant"
          disabled={switching}
        >
          {switching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Building2 className="h-3.5 w-3.5 text-[#6b7280]" />
          )}
          <span className="truncate max-w-[180px]">{active?.name || "Seleziona tenant"}</span>
          <ChevronsUpDown className="h-3 w-3 text-[#9ca3af]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-[#6b7280] font-medium">
          Tenant disponibili ({data.tenants.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {data.tenants.length === 0 && (
          <div className="px-2 py-4 text-xs text-[#6b7280] text-center">Nessun tenant disponibile</div>
        )}
        {data.tenants.map((tenant) => {
          const isActive = tenant.id === data.activePropertyId
          return (
            <DropdownMenuItem
              key={tenant.id}
              onClick={() => handleSwitch(tenant.id)}
              className="flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{tenant.name}</div>
                {tenant.subdomain && (
                  <div className="text-[11px] text-[#6b7280] truncate">{tenant.subdomain}</div>
                )}
              </div>
              {isActive && <Check className="h-4 w-4 text-[#0b57d0] shrink-0" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
