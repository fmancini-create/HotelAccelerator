"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealGuardPage from "@/app/dati/guard/page"

/**
 * Demo Guard: monta la pagina REALE Price Guard (default export), che fa
 * fetch di /api/ui/me, /api/ui/selected-hotel, /api/guard/config,
 * /api/guard/check e /api/rates (lo scan iniziale e' una POST no-op in demo).
 * In demo l'interceptor serve i mock corrispondenti.
 */
export default function DemoGuardPage() {
  return (
    <DemoPage
      title="Price Guard"
      narration="Il Price Guard confronta automaticamente il prezzo a cui ogni prenotazione e' stata venduta con il prezzo che avresti dovuto avere a listino in quel momento. Quando una camera viene venduta sotto-prezzo - per un errore di tariffa, un canale disallineato o una tariffa multipla - il sistema lo segnala con un alert, cosi' puoi intervenire e proteggere il tuo fatturato. Imposti tu la tolleranza percentuale e la finestra temporale di controllo. Il Guard fa parte della suite Accelerator: e' una funzione disponibile attivando il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Guard" />
      <RealGuardPage />
    </DemoPage>
  )
}
