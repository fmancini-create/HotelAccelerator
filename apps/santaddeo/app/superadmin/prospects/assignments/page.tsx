import { AssignmentsClient } from "./assignments-client"

export const metadata = {
  title: "Assegnazioni attive | Santaddeo",
}

export default function AssignmentsPage() {
  return (
    <div className="container py-6 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Assegnazioni attive</h1>
        <p className="text-muted-foreground">
          Monitora le assegnazioni in corso, ordinate per scadenza.
        </p>
      </div>
      <AssignmentsClient />
    </div>
  )
}
