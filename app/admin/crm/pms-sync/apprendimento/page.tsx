import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { requireAreaPage } from "@/lib/auth/area-access"

export const metadata: Metadata = {
  title: "Apprendimento agente",
  description: "Governance delle procedure apprese osservando il lavoro nel gestionale.",
}

export default async function ApprendimentoAgentePage() {
  await requireAreaPage("pms_learning")
  redirect("/admin/knowledge#pms-learning")
}
