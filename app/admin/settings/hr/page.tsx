import { redirect } from "next/navigation"
import { AdminHeader } from "@/components/admin/admin-header"
import { HrGeofenceSettingsPanel } from "@/components/hr/hr-geofence-settings-panel"
import { requireTenantAdmin } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"

export default async function HrSettingsPage() {
  let allowed = false

  try {
    const identity = await requireTenantAdmin()
    const db = createServiceClient()
    allowed = await isModuleActive(db, identity.propertyId, "hr")
  } catch {
    allowed = false
  }

  if (!allowed) redirect("/admin/settings")

  return (
    <div className="min-h-full bg-muted/40">
      <AdminHeader
        title="HR · Timbratura e posizione"
        subtitle="Configurazione amministrativa della sede, del raggio e delle regole GPS. La gestione operativa dei turni resta separata."
      />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <HrGeofenceSettingsPanel />
      </main>
    </div>
  )
}
