import type { ReactNode } from "react"
import { DemoProviders } from "@/components/sales/demo/demo-providers"

/**
 * Layout della DEMO venditori.
 *
 * Monta i provider demo (interceptor fetch + HotelProvider con hotel finto)
 * per l'intera sezione /demo, cosi' ogni pagina puo' riusare i
 * componenti REALI del prodotto alimentati da dati mock.
 */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoProviders>{children}</DemoProviders>
}
