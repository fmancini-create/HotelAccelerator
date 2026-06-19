import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

export default async function GalleryAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("gallery")
  return <>{children}</>
}
