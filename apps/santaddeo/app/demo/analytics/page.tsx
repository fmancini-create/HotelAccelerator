"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealAnalyticsPage from "@/app/dati/analytics/page"

/**
 * Demo Analytics: monta la pagina REALE Analytics (default export), che fa
 * fetch di /api/ui/selected-hotel e /api/dati/analytics. In modalita' demo
 * l'interceptor serve i mock corrispondenti, quindi la demo e' identica al
 * prodotto e si aggiorna automaticamente quando cambia la pagina reale.
 */
export default function DemoAnalyticsPage() {
  return (
    <DemoPage
      title="Analytics"
      narration="Qui hai una visione completa delle performance della struttura: fatturato anno su anno, ADR, occupazione, RevPAR e RevPOR, l'andamento per giorno della settimana e l'incidenza delle cancellazioni. Tutti gli indicatori sono confrontati con l'anno precedente, con la possibilita' di filtrare i dati ad oggi. Tieni presente che Analytics fa parte della suite Accelerator: e' una funzione disponibile attivando il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Analytics" />
      <RealAnalyticsPage />
    </DemoPage>
  )
}
