import Link from "next/link"
import { KanbanSquare } from "lucide-react"
import { CrmNotAvailable } from "@/components/crm/crm-not-available"

/**
 * Pipeline commerciale.
 *
 * COSA C'ERA PRIMA: sei colonne con sei trattative inventate — "Grand Hotel
 * Roma € 7.200", "Villa Verde € 2.900" e altre — complete di referente, importo
 * e prossima attività. In fondo una riga dichiarava "Vista demo senza
 * persistenza". Il rischio non era la riga in fondo: erano gli importi, che in
 * una pagina intitolata "Pipeline" si leggono come previsioni di incasso.
 *
 * PERCHE' NON L'HO RIEMPITA CON DATI VERI: non ce ne sono. Misurato sul
 * database: nessuna tabella per trattative o opportunita' — le tabelle
 * commerciali esistenti sono `contacts` e `phone_calls`. Non esiste alcun campo
 * da cui ricavare uno stato di avanzamento, un valore o una fase.
 *
 * PERCHE' NON HO CREATO LA TABELLA: le fasi di vendita, i campi di una
 * trattativa e il significato di "valore" sono decisioni del committente, non
 * mie. Inventarne una forma qui vorrebbe dire imporre un modello che poi
 * andrebbe migrato al primo confronto.
 */
export default function CrmPipelinePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-muted-foreground text-pretty">Le opportunità commerciali per fase di avanzamento.</p>
      </div>

      <CrmNotAvailable
        icon={KanbanSquare}
        titolo="Nessuna trattativa registrata"
        cosaFarebbe="Questa sezione mostrerà le opportunità commerciali divise per fase, con il referente e il valore di ognuna."
        cosaManca="Per ora l'archivio delle trattative non esiste: nel database ci sono i contatti e le telefonate, ma nessuna tabella dove registrare un'opportunità, la sua fase o il suo valore. Le fasi da usare e i campi da tenere sono decisioni da concordare prima di crearla."
      >
        Nel frattempo i contatti e il loro punteggio commerciale sono in{" "}
        <Link href="/admin/crm" className="underline">
          Contatti
        </Link>
        .
      </CrmNotAvailable>
    </div>
  )
}
