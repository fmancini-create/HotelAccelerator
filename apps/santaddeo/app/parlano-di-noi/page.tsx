import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Newspaper, ExternalLink, CalendarDays } from "lucide-react"
import type { Metadata } from "next"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Parlano di noi | SANTADDEO",
  description:
    "La rassegna stampa di SANTADDEO e 4 Bid srl: articoli, citazioni e notizie online che parlano della nostra piattaforma di revenue management alberghiero.",
  alternates: { canonical: "https://www.santaddeo.com/parlano-di-noi" },
  openGraph: {
    title: "Parlano di noi | SANTADDEO",
    description:
      "Rassegna stampa di SANTADDEO e 4 Bid srl: articoli e notizie online sulla nostra piattaforma di revenue management.",
    url: "https://www.santaddeo.com/parlano-di-noi",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Parlano di noi | SANTADDEO",
    description:
      "Rassegna stampa di SANTADDEO e 4 Bid srl: articoli e notizie online sulla nostra piattaforma di revenue management.",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

// Aggiornata dal cron giornaliero; rigenera ogni ora.
export const revalidate = 3600

interface PressMention {
  id: string
  title: string
  url: string
  source: string | null
  snippet: string | null
  published_at: string | null
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
}

async function getMentions(): Promise<PressMention[]> {
  try {
    const supabase = await createServiceRoleClient()
    const { data, error } = await supabase
      .from("press_mentions")
      .select("id, title, url, source, snippet, published_at")
      .eq("is_visible", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(100)
    if (error) {
      console.error("[parlano-di-noi] query error:", error.message)
      return []
    }
    return (data as PressMention[]) ?? []
  } catch (err) {
    console.error("[parlano-di-noi] fetch error:", err instanceof Error ? err.message : err)
    return []
  }
}

export default async function ParlanoDiNoiPage() {
  const mentions = await getMentions()

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={buildBreadcrumbList([{ name: "Parlano di noi", path: "/parlano-di-noi" }])} id="ld-breadcrumb" />
      <Header showAuth={true} size="small" />

      {/* Hero */}
      <section className="bg-gradient-to-br from-teal-50 via-white to-teal-50 py-20">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 bg-teal-600 hover:bg-teal-600">Rassegna stampa</Badge>
            <h1 className="mb-6 text-balance text-4xl font-bold text-gray-900 md:text-5xl">Parlano di noi</h1>
            <p className="text-pretty text-lg text-muted-foreground md:text-xl">
              Articoli, citazioni e notizie online che parlano di SANTADDEO e di 4&nbsp;Bid&nbsp;srl. Questa pagina si
              aggiorna automaticamente ogni giorno.
            </p>
          </div>
        </div>
      </section>

      {/* Lista notizie */}
      <section className="flex-1 bg-white py-16">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-3xl">
            {mentions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                  <Newspaper className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                  <p className="text-lg font-medium text-gray-900">Nessuna notizia al momento</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Non appena verremo citati online, gli articoli compariranno qui automaticamente.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul className="flex flex-col gap-4">
                {mentions.map((m) => {
                  const date = formatDate(m.published_at)
                  return (
                    <li key={m.id}>
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-teal-300 hover:bg-teal-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                      >
                        <div className="flex items-start gap-4">
                          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                            <Newspaper className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h2 className="text-pretty text-lg font-semibold text-gray-900 group-hover:text-teal-800">
                              {m.title}
                            </h2>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              {m.source ? <span className="font-medium text-gray-700">{m.source}</span> : null}
                              {date ? (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                                  {date}
                                </span>
                              ) : null}
                              <span className="inline-flex items-center gap-1 text-teal-700">
                                Leggi l{"'"}articolo
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                              </span>
                            </div>
                          </div>
                        </div>
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
