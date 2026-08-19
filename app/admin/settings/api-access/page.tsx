import { Suspense } from "react"
import { ApiAccessClient } from "./api-access-client"

export default function ApiAccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-background flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Caricamento...</div>
        </div>
      }
    >
      <ApiAccessClient />
    </Suspense>
  )
}
