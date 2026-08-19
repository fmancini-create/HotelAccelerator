import type { ReactNode } from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

/**
 * Il registro delle telefonate e' un'area CONCEDIBILE, non riservata agli
 * amministratori: le chiamate senza risposta servono a chi sta alla reception.
 * La configurazione del centralino resta invece in Canali, dietro
 * `requireAdminPage`.
 *
 * Nascondere la voce dal menu non basta: senza questa guardia bastava digitare
 * l'indirizzo per aprire la pagina.
 */
export default async function CallsLayout({ children }: { children: ReactNode }) {
  await requireAreaPage("calls")
  return <>{children}</>
}
