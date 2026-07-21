import type { Metadata } from "next"
import { Suspense } from "react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { BookCallClient } from "./book-call-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Prenota una call | SANTADDEO",
  description: "Scegli un orario per la tua call dimostrativa con il team SANTADDEO.",
  robots: { index: false, follow: false },
}

export default async function PrenotaCallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <div className="flex min-h-screen flex-col">
      <Header showAuth={false} />
      <main className="flex-1 bg-muted/30 py-12">
        <div className="container mx-auto px-6">
          <Suspense fallback={null}>
            <BookCallClient token={token} />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  )
}
