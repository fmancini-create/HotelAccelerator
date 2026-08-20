/**
 * Area riservata: cosa ha imparato l'agente guardando lavorare nel gestionale.
 *
 * PERCHE' UNA PAGINA A PARTE. L'elenco stava dentro la pagina del gestionale,
 * che serve a LAVORARE ed e' aperta a chi ha il CRM. Ma questo elenco e' il
 * registro di COME lavora il personale: ricostruisce i gesti ripetuti di una
 * persona al lavoro. Non e' un dato operativo come un altro, e non deve stare
 * accanto agli strumenti di tutti i giorni.
 *
 * CHI ENTRA. L'amministratore sempre; chiunque altro solo se e' capogruppo E
 * l'area "pms_learning" gli e' stata concessa. Le due condizioni sono in E: con
 * una O, concedere l'area a un membro qualsiasi aprirebbe una pagina pensata
 * per i responsabili, e concedere aree e' un'operazione di tutti i giorni.
 *
 * La regola NON e' scritta qui. Vive nel catalogo delle aree
 * (`requiresGroupLead`) e viene applicata da `getMemberEffectiveAreas`, cioe'
 * dalla stessa funzione che alimenta il menu: cosi' il menu non puo' mostrare
 * una voce che questa guardia poi rifiuta.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { requireAreaPage } from "@/lib/auth/area-access"
import { ProcedureImparate } from "@/components/crm/procedure-imparate"

export const metadata: Metadata = {
  title: "Apprendimento agente",
  description: "Le procedure che l'agente ha imparato osservando il lavoro nel gestionale.",
}

export default async function ApprendimentoAgentePage() {
  await requireAreaPage("pms_learning")

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin/crm/pms-sync/gestionale"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Torna al gestionale
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Apprendimento agente</h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {
            "Le procedure che si ripetono nel gestionale, con quante volte sono state viste e cosa l'agente puo' farne. Area riservata a chi risponde del lavoro: amministratori e capigruppo autorizzati."
          }
        </p>
      </header>

      <ProcedureImparate />
    </main>
  )
}
