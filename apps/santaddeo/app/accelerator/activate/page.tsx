import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { AcceleratorActivationForm } from "@/components/accelerator/activation-form"
import Link from "next/link"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Attiva Hotel Accelerator - SANTADDEO",
  description: "Configura il tuo piano e inizia a ottimizzare le tariffe della tua struttura.",
}

async function getActivateData() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const baseUrl = appUrl
    ? appUrl.startsWith("http") ? appUrl : `https://${appUrl}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"

  const res = await fetch(`${baseUrl}/api/ui/accelerator/activate`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })

  if (!res.ok) {
    const data = await res.json()
    if (data.redirect) {
      return { redirect: data.redirect }
    }
    return { error: data.error }
  }

  return res.json()
}

export default async function ActivateAcceleratorPage() {
  const data = await getActivateData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  if (data.error) {
    redirect("/auth/login")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/logo-santaddeo.png"
              alt="SANTADDEO"
              width={140}
              height={32}
            />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-12 bg-gradient-to-b from-muted/40 to-background">
          <div className="container mx-auto px-6 text-center">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
              Hotel Accelerator
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl mb-3 text-balance">
              Attiva Hotel Accelerator
            </h1>
            <p className="mx-auto max-w-2xl text-muted-foreground leading-relaxed text-pretty">
              Configura il tuo piano e inizia a ottimizzare le tariffe della tua struttura.
              Scegli la struttura, il piano di pagamento e le preferenze di algoritmo.
            </p>
          </div>
        </section>

        {/* Form */}
        <section className="py-8 pb-16">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl">
              <AcceleratorActivationForm
                hotels={data.hotels}
                defaultFee={data.defaultFee}
                defaultCommission={data.defaultCommission}
              />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-6">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          {"SANTADDEO - Revenue Management System"}
        </div>
      </footer>
    </div>
  )
}
