"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealEventsPage from "@/app/accelerator/events/page"

export default function DemoEventiPage() {
  return (
    <DemoPage
      title="Calendario Eventi"
      narration="In questo calendario raccogli tutto ciò che influenza la domanda: festività nazionali, fiere, eventi locali e ricorrenze dei tuoi mercati. Puoi importare automaticamente le festività dei Paesi da cui arrivano i tuoi ospiti, oppure scegliere nuovi mercati potenziali su cui puntare. Sapere quando i tuoi mercati di provenienza sono in vacanza ti permette di anticipare i picchi di richiesta e impostare i prezzi di conseguenza. È una funzione dell'Accelerator, disponibile con il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Calendario Eventi" />
      <RealEventsPage />
    </DemoPage>
  )
}
