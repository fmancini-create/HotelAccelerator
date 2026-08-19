import type { ReactNode } from "react"

import { requireAdminPage } from "@/lib/auth/require-admin-page"

/**
 * Riservata a chi amministra, non concessa per area.
 *
 * La pagina confronta i colleghi fra loro: quante risposte manda ciascuno e quanto
 * fa attendere chi scrive. Non e' un dato che serve a tutti per lavorare, e lasciarla
 * aperta a chiunque abbia l'area statistiche trasformerebbe il cruscotto in una
 * classifica pubblica fra dipendenti. Stessa guardia di /admin/users, che e' l'altra
 * pagina che espone informazioni sulle persone.
 */
export default async function OperatorPerformanceLayout({ children }: { children: ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
