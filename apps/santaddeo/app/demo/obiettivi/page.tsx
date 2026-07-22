"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealObjectivesPage from "@/app/dati/objectives/page"

/**
 * Demo Obiettivi: monta la pagina REALE Obiettivi di Revenue (default export),
 * che fa fetch di /api/ui/selected-hotel e /api/dati/objectives. In demo
 * l'interceptor serve i mock corrispondenti.
 */
export default function DemoObiettiviPage() {
  return (
    <DemoPage
      title="Obiettivi di Revenue"
      narration="Questa è la tabella dei tuoi obiettivi di revenue. Per ogni mese imposti il budget di produzione e la percentuale di invenduto previsionale, e il sistema calcola in automatico delta budget, RevPAR, RevPOR, coefficiente revenue, occupazione e camere ancora da vendere, sempre confrontati con l'anno precedente. È lo strumento con cui tu e il tuo revenue manager pianificate e tenete sotto controllo il raggiungimento degli obiettivi. Gli Obiettivi fanno parte della suite Accelerator: sono una funzione disponibile attivando il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Obiettivi" />
      <RealObjectivesPage />
    </DemoPage>
  )
}
