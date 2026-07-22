import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, TrendingUp, Users, Award } from "lucide-react"
import type { Metadata } from "next"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  title: "Chi Siamo - 4 BID, 24 Anni di Revenue Management | SANTADDEO",
  // SEO 06/05/2026: description ridotta a <160ch (era 224)
  description:
    "SANTADDEO nasce da 4 BID, azienda italiana con 24 anni nel revenue management alberghiero. Oltre 70 strutture affiancate tra hotel, agriturismi e resort.",
  alternates: { canonical: "https://www.santaddeo.com/about" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Chi Siamo | SANTADDEO - Revenue Management System",
    description: "24 anni di esperienza nel revenue management alberghiero. Oltre 70 strutture affiancate. Il team dietro il Revenue Management System SANTADDEO.",
    url: "https://www.santaddeo.com/about",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chi Siamo | SANTADDEO",
    description: "24 anni di esperienza nel revenue management. Oltre 70 strutture affiancate.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={buildBreadcrumbList([{"name":"Chi siamo","path":"/about"}])} id="ld-breadcrumb" />
      <Header showPageNav />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-blue-50 py-12 border-b">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-4 bg-blue-600">La Nostra Storia</Badge>
            <h1 className="text-4xl font-bold text-gray-900 mb-4 text-balance">Chi Siamo</h1>
            <p className="text-lg text-muted-foreground text-pretty">
              Dal 2012 al fianco degli hotel italiani per ottimizzare revenue e performance
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <div className="prose prose-lg max-w-none">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">La Nostra Storia</h2>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                <strong>4 Bid S.r.l.</strong> nasce nel 2012 con il progetto <strong>Hotelbid</strong>, un innovativo
                sistema di prenotazione basato sull'offerta nascosta, che generava una trattativa riservata tra cliente
                e struttura: un modello win-win, capace di far risparmiare i viaggiatori e al tempo stesso eliminare le
                commissioni per gli hotel, a differenza delle tradizionali OTA.
              </p>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                Da allora abbiamo concentrato tutta la nostra esperienza nel mondo dell'ospitalità e delle nuove
                tecnologie, affiancando nel tempo <strong>oltre 70 strutture ricettive</strong> in tutta Italia.
              </p>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                Il nostro obiettivo è sempre stato uno:{" "}
                <strong>aiutare gli imprenditori dell'hotellerie a migliorare le performance economiche</strong>,
                ottimizzando la gestione dei ricavi e semplificando i processi decisionali.
              </p>

              <div className="bg-blue-50 border-l-4 border-blue-600 p-6 my-8">
                <p className="text-lg text-gray-800 leading-relaxed italic">
                  I risultati parlano da soli — in molti casi gli incrementi di fatturato sono stati così significativi
                  da trasformare la vita di chi gestisce queste strutture.
                </p>
              </div>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                Grazie a questa lunga esperienza, abbiamo sviluppato{" "}
                <strong>algoritmi proprietari e formule matematiche avanzate</strong> che oggi costituiscono il cuore di{" "}
                <strong>Santaddeo</strong>: un sistema intelligente capace di supportare il Revenue Manager
                nell'individuazione del miglior prezzo di vendita per ogni camera, ogni giorno dell'anno.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">I Nostri Numeri</h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <Building2 className="h-10 w-10 text-blue-600 mx-auto mb-3" />
                  <div className="text-3xl font-bold text-gray-900 mb-2">70+</div>
                  <div className="text-sm text-muted-foreground">Strutture Affiancate</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <TrendingUp className="h-10 w-10 text-green-600 mx-auto mb-3" />
                  <div className="text-3xl font-bold text-gray-900 mb-2">+75%</div>
                  <div className="text-sm text-muted-foreground">Incremento Medio Revenue</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <Users className="h-10 w-10 text-purple-600 mx-auto mb-3" />
                  <div className="text-3xl font-bold text-gray-900 mb-2">24</div>
                  <div className="text-sm text-muted-foreground">Anni di Esperienza</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <Award className="h-10 w-10 text-orange-600 mx-auto mb-3" />
                  <div className="text-3xl font-bold text-gray-900 mb-2">Multi-PMS</div>
                  <div className="text-sm text-muted-foreground">Architettura Scalabile</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
