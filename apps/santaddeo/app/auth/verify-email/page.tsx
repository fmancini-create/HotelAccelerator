import { Suspense } from "react"
import VerifyEmailContent from "@/components/auth/verify-email-content"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Verifica Email | SANTADDEO",
  description: "Verifica il tuo indirizzo email per completare la registrazione a SANTADDEO.",
  robots: { index: false, follow: false },
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6">
          <div className="w-full max-w-md text-center">
            <h1 className="text-4xl font-bold text-blue-900">SANTADDEO</h1>
            <p className="mt-4 text-muted-foreground">Caricamento...</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
