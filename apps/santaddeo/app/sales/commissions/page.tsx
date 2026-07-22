import { CommissionsClient } from "./commissions-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Commissioni - Sales SANTADDEO" }

export default function CommissionsPage() {
  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Commissioni</h2>
          <p className="text-sm text-muted-foreground">
            Storico delle commissioni maturate sulle strutture associate al tuo profilo.
          </p>
        </div>
      </div>
      <CommissionsClient />
    </div>
  )
}
