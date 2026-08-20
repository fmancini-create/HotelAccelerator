import Link from "next/link"
import { ListChecks } from "lucide-react"
import { CrmNotAvailable } from "@/components/crm/crm-not-available"

/**
 * Attività commerciali.
 *
 * COSA C'ERA PRIMA: quattro impegni inventati con ora, referente e stato —
 * "Richiamare Hotel Toscana, oggi 10:30", "Demo Santaddeo — Borgo Chianti, oggi
 * 15:00" — e in fondo "Dati demo locali". Il guaio: erano scritti "Oggi", quindi
 * ogni giorno la pagina presentava impegni odierni che nessuno aveva preso.
 *
 * PERCHE' NON L'HO RIEMPITA CON DATI VERI: non esiste una tabella di attivita'
 * commerciali. Ho verificato anche il candidato che sembrava adatto,
 * `conversation_activity_log`: registra eventi delle CONVERSAZIONI (25 righe),
 * non richiami o appuntamenti presi da una persona. Usarlo qui avrebbe
 * ribattezzato "attività commerciale" qualcosa che non lo è.
 *
 * Le telefonate, invece, sono reali e hanno gia' la loro pagina: il rimando qui
 * sotto porta la', invece di lasciare la sezione muta.
 */
export default function CrmActivitiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attività</h1>
        <p className="text-muted-foreground text-pretty">Richiami, dimostrazioni e solleciti della squadra commerciale.</p>
      </div>

      <CrmNotAvailable
        icon={ListChecks}
        titolo="Nessuna attività registrata"
        cosaFarebbe="Questa sezione raccoglierà i richiami e gli appuntamenti da fare, con la persona che se ne occupa e lo stato di ognuno."
        cosaManca="Per ora non c'è un archivio dove annotarli: nel database non esiste una tabella di attività commerciali, e l'unico registro simile riguarda gli eventi delle conversazioni, non gli impegni presi da una persona."
      >
        Le telefonate già avvenute sono in{" "}
        <Link href="/admin/crm/calls" className="underline">
          Telefonate
        </Link>
        .
      </CrmNotAvailable>
    </div>
  )
}
