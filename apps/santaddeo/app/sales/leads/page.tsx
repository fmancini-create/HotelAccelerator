import Link from "next/link"
import { LeadsListClient } from "./leads-list-client"
import { ProspectSearch } from "@/components/sales/prospect-search"
import { MyAssignmentRequests } from "@/components/sales/my-assignment-requests"
import { resolveCurrentAgentIdentity } from "@/lib/sales/current-agent"

export const dynamic = "force-dynamic"
export const metadata = { title: "Lead - Sales SANTADDEO" }

export default async function LeadsPage() {
  const { agentName, agentEmail } = await resolveCurrentAgentIdentity()
  return (
    <div className="container mx-auto max-w-7xl px-6 py-8 space-y-8">
      {/*
        Sezione "Cerca strutture nel database" — permette al venditore di
        trovare strutture gia' presenti su SANTADDEO e richiedere al super
        admin l'assegnazione. Posizionata sopra la tabella lead per essere
        sempre visibile come call-to-action principale.
      */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Cerca strutture nel database</h2>
          <p className="text-sm text-muted-foreground">
            Trova un hotel o struttura ricettiva nel database SANTADDEO e richiedi
            l&apos;assegnazione al super admin.
          </p>
        </div>
        <ProspectSearch />
        <MyAssignmentRequests />
      </section>

      <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">I tuoi lead</h2>
            <p className="text-sm text-muted-foreground">
              Stato dei potenziali clienti che hai contattato.
            </p>
          </div>
          <Link
            href="/sales/leads/new"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Nuovo lead
          </Link>
        </div>
        <LeadsListClient agentName={agentName} agentEmail={agentEmail} />
      </section>
    </div>
  )
}
