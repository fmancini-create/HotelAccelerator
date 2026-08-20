import type { Metadata } from "next"
import { CalendarDays } from "lucide-react"
import { requireAreaPage } from "@/lib/auth/area-access"
import { CrmNotAvailable } from "@/components/crm/crm-not-available"

export const metadata: Metadata = {
  title: "Calendario | CRM",
}

export const dynamic = "force-dynamic"

export default async function CrmCalendarPage() {
  await requireAreaPage("crm")

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendario</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Appuntamenti e promemoria commerciali della struttura.
        </p>
      </header>

      {/*
        La versione precedente mostrava sei appuntamenti inventati (demo, richiami,
        follow-up con nomi di hotel mai esistiti).
        Non c'e' una fonte da cui leggerli: la tabella `events` esiste ma raccoglie il
        tracciamento di navigazione del sito (session_id, page_url, referrer) e a oggi
        ha 0 righe, quindi usarla qui significherebbe attribuirle un significato che
        non ha.
      */}
      <CrmNotAvailable
        icon={CalendarDays}
        titolo="Nessun calendario commerciale collegato"
        cosaFarebbe="Qui compariranno gli appuntamenti presi con i contatti: richiami programmati, dimostrazioni e scadenze delle offerte, con il responsabile di ciascuno."
        cosaManca="Manca la fonte dati: non esiste una tabella di appuntamenti commerciali. La tabella `events` del database raccoglie il tracciamento di navigazione del sito, non appuntamenti, quindi non viene usata qui."
      >
        I turni del personale non compaiono in questa pagina: hanno un modulo proprio in Risorse umane e sono
        organizzazione interna, non attività commerciale.
      </CrmNotAvailable>
    </div>
  )
}
