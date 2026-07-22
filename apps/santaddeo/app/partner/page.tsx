import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, TrendingUp, DollarSign, Target, CheckCircle2, Briefcase, Award } from "lucide-react"
import { PartnerForm } from "@/components/forms/partner-form"
import type { Metadata } from "next"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  // SEO 06/05/2026: title 74→33ch, description 224→152ch
  title: "Programma Partner B2B | SANTADDEO",
  description:
    "Diventa partner SANTADDEO: commissioni ricorrenti portando hotel sulla piattaforma. 20% su registrazioni, 80% su upgrade. Per consulenti hospitality.",
  alternates: { canonical: "https://www.santaddeo.com/partner" },
  openGraph: {
    title: "Programma Partner B2B | SANTADDEO Revenue Management",
    description:
      "Guadagna commissioni ricorrenti portando hotel sulla piattaforma SANTADDEO. 20% su registrazioni, 80% su upgrade. Dashboard partner, materiale marketing e supporto dedicato.",
    url: "https://www.santaddeo.com/partner",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Programma Partner B2B | SANTADDEO Revenue Management",
    description: "Guadagna commissioni ricorrenti portando hotel sulla piattaforma SANTADDEO. 20% su registrazioni, 80% su upgrade. Dashboard partner, materiale marketing e supporto dedicato.",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  }
}

export default function PartnerPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={buildBreadcrumbList([{"name":"Partner","path":"/partner"}])} id="ld-breadcrumb" />
      <Header showAuth={true} size="small" />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-blue-50 py-20">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-4 bg-blue-600">Programma Partner B2B</Badge>
            <h1 className="text-5xl font-bold text-gray-900 mb-6 text-balance">
              Guadagna Aiutando gli Hotel a Crescere
            </h1>
            <p className="text-xl text-muted-foreground mb-8 text-pretty">
              Sei un consulente, revenue manager o gestisci piu strutture? Unisciti al nostro programma partner e
              guadagna commissioni ricorrenti portando SANTADDEO ai tuoi clienti.
            </p>
          </div>
        </div>
      </section>

      {/* Commission Structure */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Struttura Commissioni</h2>
            <p className="text-lg text-muted-foreground">Guadagna su ogni cliente che porti sulla piattaforma</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
            <Card className="border-2 border-green-200 bg-green-50">
              <CardHeader>
                <DollarSign className="h-10 w-10 text-green-600 mb-3" />
                <CardTitle className="text-green-900">Commissione su Registrazione</CardTitle>
                <CardDescription>Per ogni nuovo hotel che registri</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-green-600 mb-4">20%</div>
                <p className="text-sm text-green-800">
                  Ricevi il 20% del valore del primo anno di abbonamento per ogni hotel che porti sulla piattaforma.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-blue-600 mb-3" />
                <CardTitle className="text-blue-900">Commissione su Upgrade</CardTitle>
                <CardDescription>Quando i tuoi clienti attivano servizi premium</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-blue-600 mb-4">80%</div>
                <p className="text-sm text-blue-800">
                  Guadagna l{"'"}80% delle commissioni quando i tuoi clienti attivano Hotel Accelerator o servizi di
                  consulenza.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-12 text-center">
            <Card className="max-w-2xl mx-auto bg-gradient-to-br from-blue-50 to-white border-blue-200">
              <CardContent className="pt-6">
                <Award className="mx-auto h-12 w-12 text-blue-600 mb-4" />
                <h3 className="text-xl font-bold mb-2">Esempio di Guadagno</h3>
                <p className="text-muted-foreground mb-4">
                  Con 10 hotel registrati e 5 che attivano Hotel Accelerator:
                </p>
                <div className="grid gap-4 md:grid-cols-3 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{"€"}2.400</div>
                    <div className="text-sm text-muted-foreground">Registrazioni</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{"€"}4.800</div>
                    <div className="text-sm text-muted-foreground">Upgrade</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{"€"}7.200</div>
                    <div className="text-sm text-muted-foreground">Totale/anno</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Vantaggi del Programma Partner</h2>
            <p className="text-lg text-muted-foreground">Tutto quello che ti serve per avere successo</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            <Card>
              <CardHeader>
                <Users className="h-8 w-8 text-blue-600 mb-2" />
                <CardTitle className="text-lg">Dashboard Partner</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Monitora i tuoi referral, commissioni e performance in tempo reale
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Target className="h-8 w-8 text-green-600 mb-2" />
                <CardTitle className="text-lg">Materiale Marketing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Accesso a presentazioni, brochure e materiali promozionali professionali
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Briefcase className="h-8 w-8 text-blue-600 mb-2" />
                <CardTitle className="text-lg">Supporto Dedicato</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Un account manager dedicato per supportarti nella crescita
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CheckCircle2 className="h-8 w-8 text-orange-600 mb-2" />
                <CardTitle className="text-lg">Formazione Gratuita</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Webinar e training per diventare esperto di revenue management
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <DollarSign className="h-8 w-8 text-green-600 mb-2" />
                <CardTitle className="text-lg">Pagamenti Puntuali</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Commissioni pagate mensilmente, sempre in orario</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Award className="h-8 w-8 text-blue-600 mb-2" />
                <CardTitle className="text-lg">Bonus Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Bonus extra per i partner che raggiungono obiettivi di crescita
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Registration Form */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-2xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Diventa Partner Oggi</h2>
              <p className="text-lg text-muted-foreground">
                Compila il form per ricevere il tuo codice partner e iniziare a guadagnare
              </p>
            </div>
            <PartnerForm />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
