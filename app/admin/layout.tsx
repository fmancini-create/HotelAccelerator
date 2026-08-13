import type React from "react"
import type { Metadata } from "next"
import { PlatformShell } from "@/components/platform/platform-shell"
import { ClientToaster } from "@/components/admin/client-toaster"

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | HotelAccelerator Admin",
  },
  description: "Dashboard amministrativa HotelAccelerator",
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Il <Toaster> non era montato in nessun punto dell'area admin: le pagine
  // che chiamano toast.success/error non mostravano NULLA. Montato qui una
  // sola volta (due contenitori mostrerebbero avvisi doppi).
  return (
    <PlatformShell>
      {children}
      <ClientToaster />
    </PlatformShell>
  )
}
