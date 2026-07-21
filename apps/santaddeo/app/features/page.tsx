import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Heart, Brain, Settings, TrendingUp, Cloud, Lightbulb, Plug, ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"
import { groupPmsEntries } from "@/lib/pms-public-catalog"
import { getPublicPmsCatalog } from "@/lib/pms-public-catalog.server"
import { PmsIntegrationsShowcase } from "@/components/pms/pms-integrations-showcase"

export const metadata: Metadata = {
  // SEO 06/05/2026: title 78→55ch, description 235→152ch per evitare troncamento SERP
  title: "Funzionalita Revenue Management System | SANTADDEO",
  description:
    "Funzionalita SANTADDEO: pricing dinamico, dashboard KPI real-time, integrazione PMS, analisi competitiva e report automatici per strutture ricettive.",
  alternates: { canonical: "https://www.santaddeo.com/features" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Funzionalita RMS | SANTADDEO Revenue Management System",
    description: "Revenue Management System con pricing dinamico, dashboard KPI, alert intelligenti e integrazione PMS per strutture ricettive.",
    url: "https://www.santaddeo.com/features",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Funzionalita | SANTADDEO RMS",
    description: "Pricing dinamico e dashboard KPI per hotel e strutture ricettive.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export const dynamic = "force-dynamic"

export default async function FeaturesPage() {
  const pmsEntries = await getPublicPmsCatalog()
  const pmsGroups = groupPmsEntries(pmsEntries)

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={buildBreadcrumbList([{"name":"Funzionalita","path":"/features"}])} id="ld-breadcrumb" />
      <Header showPageNav />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-blue-50 py-12 border-b">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-4 bg-blue-600">Revenue Management System</Badge>
            <h1 className="text-4xl font-bold text-gray-900 mb-4 text-balance">
              Revenue Management System Intelligente per Strutture Ricettive
            </h1>
            <p className="text-lg text-muted-foreground text-pretty">
              SANTADDEO e' il Revenue Management System che non si limita a calcolare prezzi, ma comprende, spiega e adatta 
              ogni decisione alla realta specifica della tua struttura ricettiva
            </p>
          </div>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <div className="prose prose-lg max-w-none">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">La Filosofia di Santaddeo</h2>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                Il nome <strong>Santaddeo</strong> nasce da <strong>San Giuda Taddeo</strong>, l'apostolo conosciuto
                come il protettore delle cause perse.
              </p>

              <div className="bg-blue-50 border-l-4 border-blue-600 p-6 my-8">
                <p className="text-lg text-gray-800 leading-relaxed">
                  Un richiamo simbolico e profondo: così come il santo infonde speranza dove sembra non esserci più via
                  d'uscita, <strong>Santaddeo nasce per ridare forza, visione e risultati concreti</strong> alle
                  strutture ricettive che vogliono risollevarsi e competere in un mercato sempre più complesso.
                </p>
              </div>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                Nel corso degli anni, grazie all'esperienza maturata con oltre 70 strutture, abbiamo capito che molte
                strutture ricettive non avevano bisogno solo di un altro software, ma di uno{" "}
                <strong>strumento intelligente e "consapevole"</strong>, capace di spiegare il perché di ogni scelta.
              </p>

              <h3 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Cosa Rende Santaddeo Unico</h3>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                Ed è proprio qui che Santaddeo si distingue da tutti gli altri RMS (Revenue Management System):
              </p>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold mt-1">
                    1
                  </div>
                  <p className="text-lg text-gray-700 leading-relaxed">
                    <strong>Non si limita a suggerire un prezzo</strong>, ma spiega la logica che sta dietro a ogni
                    decisione.
                  </p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold mt-1">
                    2
                  </div>
                  <p className="text-lg text-gray-700 leading-relaxed">
                    <strong>Non impone regole fisse</strong>, ma consente di personalizzare i parametri giorno per
                    giorno, adattandosi alle caratteristiche uniche di ogni struttura.
                  </p>
                </li>
              </ul>

              <h3 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Perché Ogni Struttura è Diversa</h3>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                Le variabili che determinano il prezzo ottimale di una camera possono essere infinite, e cambiano da
                struttura a struttura, o persino da giorno a giorno nella stessa struttura.
              </p>

              <div className="bg-gray-50 rounded-lg p-6 my-8">
                <h4 className="text-xl font-semibold text-gray-900 mb-4">Un Esempio Concreto:</h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Cloud className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                    <p className="text-gray-700">
                      <strong>Il meteo</strong> può influire fortemente sulle prenotazioni in una destinazione di
                      campagna in inverno, mentre in piena estate il suo impatto tende a zero.
                    </p>
                  </li>
                  <li className="flex items-start gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600 mt-1 flex-shrink-0" />
                    <p className="text-gray-700">
                      <strong>I prezzi dei competitor</strong> possono essere rilevanti solo in occasione di fiere,
                      congressi o eventi, ma irrilevanti in altri momenti dell'anno.
                    </p>
                  </li>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-lg p-8 my-8">
                <h3 className="text-2xl font-bold mb-4">SANTADDEO Interpreta Tutto Questo</h3>
                <p className="text-lg leading-relaxed mb-4">
                  Un sistema che non si limita a calcolare, ma <strong>comprende, spiega e adatta</strong> ogni
                  decisione di prezzo alla realtà specifica di ciascuna struttura.
                </p>
                <p className="text-lg leading-relaxed italic">
                  Una guida, più che un algoritmo. Un alleato per chi, come noi, crede che nessuna causa — e nessuna
                  struttura — sia mai davvero persa.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">I Pilastri di Santaddeo</h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <Brain className="h-10 w-10 text-blue-600 mb-3" />
                  <CardTitle>Intelligenza Adattiva</CardTitle>
                  <CardDescription>
                    Algoritmi che si adattano alle caratteristiche uniche della tua struttura
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <Lightbulb className="h-10 w-10 text-yellow-600 mb-3" />
                  <CardTitle>Spiegazioni Chiare</CardTitle>
                  <CardDescription>Ogni raccomandazione è accompagnata dalla logica che la sostiene</CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <Settings className="h-10 w-10 text-purple-600 mb-3" />
                  <CardTitle>Personalizzazione Totale</CardTitle>
                  <CardDescription>
                    Parametri configurabili giorno per giorno per adattarsi a ogni situazione
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <TrendingUp className="h-10 w-10 text-green-600 mb-3" />
                  <CardTitle>Analisi Predittiva</CardTitle>
                  <CardDescription>Previsioni basate su dati storici e variabili contestuali</CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <Cloud className="h-10 w-10 text-blue-400 mb-3" />
                  <CardTitle>Variabili Contestuali</CardTitle>
                  <CardDescription>
                    Meteo, eventi, competitor: tutto viene considerato nel momento giusto
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <Heart className="h-10 w-10 text-red-600 mb-3" />
                  <CardTitle>Supporto Umano</CardTitle>
                  <CardDescription>
                    Un team di esperti sempre al tuo fianco per guidarti verso il successo
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Gestionali integrati (PMS) — dati dal DB, sincronizzati con /integrazioni */}
      {pmsEntries.length > 0 && (
        <section className="py-16 bg-white border-t">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <div className="mb-8 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Plug className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Gestionali (PMS) integrati</h3>
                  <p className="text-sm text-muted-foreground">
                    SANTADDEO si collega direttamente al gestionale della tua struttura.
                  </p>
                </div>
              </div>

              <PmsIntegrationsShowcase groups={pmsGroups} />

              <div className="mt-8">
                <Link
                  href="/integrazioni"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  Vedi tutte le integrazioni
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  )
}
