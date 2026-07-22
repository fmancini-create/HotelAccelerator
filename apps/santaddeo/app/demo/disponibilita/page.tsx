"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealRoomsSoldPage from "@/app/dati/rooms-sold/page"

/**
 * Demo Disponibilita: monta la pagina REALE Camere Vendute (default export),
 * che fa fetch di /api/ui/selected-hotel, /api/dati/rooms-sold,
 * /api/dati/production e /api/pms/last-sync. In demo l'interceptor serve i
 * mock corrispondenti.
 */
export default function DemoDisponibilitaPage() {
  return (
    <DemoPage
      title="Disponibilita e Camere Vendute"
      narration="Qui vedi giorno per giorno e per tipologia di camera quante unita' sono state vendute rispetto a quelle disponibili, con la percentuale di occupazione evidenziata a colori. Passando sopra ogni cella ottieni anche la produzione generata. E' la fotografia operativa dell'occupazione che permette di individuare subito i giorni e le tipologie da spingere. La Disponibilita' fa parte della suite Accelerator: e' una funzione disponibile attivando il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Disponibilita" />
      <RealRoomsSoldPage />
    </DemoPage>
  )
}
