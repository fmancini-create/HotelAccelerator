import { Suspense } from "react"
import { DomainsClient } from "./domains-client"

export default function DomainsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Caricamento...</div>
        </div>
      }
    >
      <DomainsClient />
    </Suspense>
  )
}
