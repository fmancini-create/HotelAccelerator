import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Badge } from "@/components/ui/badge"
import { Plug } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"
import { groupPmsEntries } from "@/lib/pms-public-catalog"
import { getPublicPmsCatalog } from "@/lib/pms-public-catalog.server"
import { PmsIntegrationsShowcase } from "@/components/pms/pms-integrations-showcase"

export const metadata: Metadata = {
  title: "Gestionali PMS Integrati | SANTADDEO",
  description:
    "Scopri i gestionali (PMS) integrati con SANTADDEO: Scidoo, Bedzzle, 5stelle, Cloudbeds, Mews, Octorate, Opera, Passepartout e molti altri. Elenco sempre aggiornato.",
  alternates: { canonical: "https://www.santaddeo.com/integrazioni" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Gestionali PMS Integrati | SANTADDEO",
    description:
      "L'elenco aggiornato dei gestionali integrati con SANTADDEO, dai sistemi connessi a quelli in arrivo.",
    url: "https://www.santaddeo.com/integrazioni",
    type: "website",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Gestionali PMS Integrati | SANTADDEO",
    description: "L'elenco aggiornato dei gestionali integrati con SANTADDEO.",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export const dynamic = "force-dynamic"

export default async function IntegrazioniPage() {
  const entries = await getPublicPmsCatalog()
  const groups = groupPmsEntries(entries)
  const connectedCount = groups.connected.length

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={buildBreadcrumbList([{ name: "Integrazioni", path: "/integrazioni" }])} id="ld-breadcrumb" />
      <Header showPageNav />

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-blue-50 py-12 border-b">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-4 bg-blue-600">Integrazioni PMS</Badge>
            <h1 className="text-4xl font-bold text-gray-900 mb-4 text-balance">
              I Gestionali Integrati con SANTADDEO
            </h1>
            <p className="text-lg text-muted-foreground text-pretty">
              SANTADDEO si collega direttamente al gestionale (PMS) della tua struttura per sincronizzare prenotazioni,
              tariffe e disponibilità. Verifica se il tuo è già collegabile.
            </p>
          </div>
        </div>
      </section>

      {/* Elenco */}
      <section className="py-16 bg-white flex-1">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <div className="mb-8 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Plug className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Gestionali (PMS) integrati</h2>
                <p className="text-sm text-muted-foreground">
                  {connectedCount > 0
                    ? `${connectedCount} gestionali già connessi e operativi, più altri in arrivo.`
                    : "Elenco in aggiornamento."}
                </p>
              </div>
            </div>

            {entries.length === 0 ? (
              <p className="text-muted-foreground">
                L&apos;elenco delle integrazioni è temporaneamente non disponibile. Riprova più tardi o{" "}
                <Link href="/request-info" className="text-blue-600 hover:underline">
                  contattaci
                </Link>{" "}
                per verificare il tuo gestionale.
              </p>
            ) : (
              <PmsIntegrationsShowcase groups={groups} />
            )}

            <div className="mt-12 rounded-lg bg-blue-50 border border-blue-100 p-6 text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Non trovi il tuo gestionale?</h3>
              <p className="text-muted-foreground mb-4">
                Aggiungiamo nuove integrazioni di continuo. Scrivici e verifichiamo insieme la fattibilità.
              </p>
              <Link
                href="/request-info"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Richiedi informazioni
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
