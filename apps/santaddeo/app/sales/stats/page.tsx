import { StatsClient } from "./stats-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Statistiche - Sales SANTADDEO" }

export default function StatsPage() {
  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Statistiche</h2>
        <p className="text-sm text-muted-foreground">
          Analisi performance personali: conversioni, attività, MRR portato e
          commissioni.
        </p>
      </div>
      <StatsClient />
    </div>
  )
}
