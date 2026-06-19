import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

export default async function CategoriesAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("categories")
  return <>{children}</>
}
