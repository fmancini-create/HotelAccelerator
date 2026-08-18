import type { ReactNode } from "react"

import { requireAreaPage } from "@/lib/auth/area-access"

// La guardia sta nel layout, come nelle altre aree del progetto: metterla nella
// page.tsx lascerebbe scoperte eventuali sotto-rotte.
export default async function AnalyticsSourcesLayout({ children }: { children: ReactNode }) {
  // Chiave "tracking", non "analytics": quest'ultima NON esiste nel catalogo
  // delle aree (verificato in lib/platform/nav.ts) e avrebbe prodotto una guardia
  // che non protegge nulla o che blocca tutti. "tracking" e' la chiave che governa
  // le statistiche, la stessa del pannello visitatori.
  await requireAreaPage("tracking")
  return <>{children}</>
}
