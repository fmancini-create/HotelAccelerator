import { NewLeadForm } from "./new-lead-form"
import { resolveCurrentAgentIdentity } from "@/lib/sales/current-agent"

export const dynamic = "force-dynamic"
export const metadata = { title: "Nuovo lead - Sales SANTADDEO" }

export default async function NewLeadPage() {
  const { agentName, agentEmail } = await resolveCurrentAgentIdentity()
  return (
    <div className="container mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Inserisci un nuovo lead</h2>
        <p className="text-sm text-muted-foreground">
          Compila i dati del potenziale cliente. Il sistema invia automaticamente una mail di
          presentazione SANTADDEO con un link tracciato: quando il lead si registra, la
          struttura viene associata a te.
        </p>
      </div>
      <NewLeadForm agentName={agentName} agentEmail={agentEmail} />
    </div>
  )
}
