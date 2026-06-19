"use client"

import { LayoutGrid, Settings2 } from "lucide-react"
import { getGrantableAreas, type PlatformArea } from "@/lib/platform/areas"
import { Switch } from "@/components/ui/switch"

/**
 * Reusable matrix to grant/revoke PLATFORM AREAS (Inbox, CRM, CMS, ...) to a
 * user or a group. Areas are orthogonal to channel permissions. Baseline areas
 * (Dashboard, Inbox, Profilo, Impostazioni) are always available and not shown
 * here; admin-only areas (Utenti, Moduli, Fatturazione) are never grantable.
 *
 * Controlled component: `value` is the set of granted area keys; `onChange`
 * receives the next set. Unchecking an area removes the grant on save.
 */
export function AreaPermissionsMatrix({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const grantable = getGrantableAreas()
  const selected = new Set(value)

  const operative = grantable.filter((a) => a.group === "operative")
  const config = grantable.filter((a) => a.group === "config")

  function toggle(key: string, on: boolean) {
    const next = new Set(selected)
    if (on) next.add(key)
    else next.delete(key)
    onChange(Array.from(next))
  }

  function renderRow(area: PlatformArea) {
    return (
      <div key={area.key} className="flex items-center justify-between p-3 border rounded-lg">
        <span className="text-sm font-medium">{area.label}</span>
        <Switch
          checked={selected.has(area.key)}
          disabled={disabled}
          onCheckedChange={(v) => toggle(area.key, v)}
          aria-label={`Concedi area ${area.label}`}
        />
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-muted">
          <LayoutGrid className="w-6 h-6 text-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-lg">Aree della piattaforma</h3>
          <p className="text-sm text-muted-foreground">
            Scegli a quali sezioni può accedere. Dashboard, Inbox, Impostazioni e Profilo sono sempre
            disponibili. Le aree riservate agli amministratori non sono concedibili.
          </p>

          <div className="mt-4 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                <LayoutGrid className="w-4 h-4" />
                Operative
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{operative.map(renderRow)}</div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                <Settings2 className="w-4 h-4" />
                Configurazione &amp; contenuti
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{config.map(renderRow)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
