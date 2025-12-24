import { Suspense } from "react"
import EmailInboxClient from "./email-inbox-client"

export default function EmailInboxPage() {
  return (
    <Suspense fallback={null}>
      <EmailInboxClient />
    </Suspense>
  )
}
