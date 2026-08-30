import type React from "react"
import { BillingCommercialDiscountBanner } from "@/components/admin/billing-commercial-discount-banner"

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BillingCommercialDiscountBanner />
      {children}
    </>
  )
}
