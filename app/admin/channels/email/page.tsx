import { Suspense } from "react"
import EmailChannelsClient from "./email-channels-client"

export default function EmailChannelsPage() {
  return (
    <Suspense fallback={<EmailChannelsLoading />}>
      <EmailChannelsClient />
    </Suspense>
  )
}

function EmailChannelsLoading() {
  return (
    <div className="min-h-screen bg-muted flex items-center justify-center">
      <div className="animate-pulse text-ha-brand-soft-foreground">Caricamento...</div>
    </div>
  )
}
