import type React from "react"

import { SuperAdminCrmNav } from "@/components/super-admin/superadmin-crm-nav"

export default function SuperAdminCrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <SuperAdminCrmNav />
      {children}
    </div>
  )
}
