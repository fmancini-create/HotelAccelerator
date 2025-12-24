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
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center">
      <div className="animate-pulse text-[#8b7355]">Caricamento...</div>
    </div>
  )
}
