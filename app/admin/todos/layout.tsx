import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

export default async function TodosAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("todos")
  return <>{children}</>
}
