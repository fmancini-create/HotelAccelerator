"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealPacePage from "@/app/accelerator/pace/page"

export default function DemoPacePage() {
  return (
    <DemoPage
      title="Booking Pace"
      narration="Il Booking Pace ti dice se stai vendendo più velocemente dell'anno scorso. Per ogni notte futura vedi le camere e il ricavo già a libro (on-the-books), confrontati con lo stesso momento dell'anno precedente a parità di anticipo (STLY). Trovi il pickup degli ultimi 7, 14 e 30 giorni e la curva di prenotazione: se la linea dell'anno corrente sta sopra quella tratteggiata dell'anno scorso, stai anticipando le vendite. Una lettura automatica traduce i numeri in una frase chiara, così capisci subito se meno camere ma a prezzo più alto significano comunque più ricavo. È uno strumento dell'Accelerator, disponibile con il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Booking Pace" />
      <RealPacePage />
    </DemoPage>
  )
}
