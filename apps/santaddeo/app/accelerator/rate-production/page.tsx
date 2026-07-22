"use client"

import { redirect } from "next/navigation"

// Redirect to pricing page - rate-production is deprecated
export default function RateProductionPage() {
  redirect("/accelerator/pricing")
}
