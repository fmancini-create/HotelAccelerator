import { RequestInfoForm } from "@/components/forms/request-info-form"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import type { Metadata } from "next"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  title: "Richiedi Informazioni | SANTADDEO Revenue Management",
  // SEO 06/05/2026: description 199→139ch
  description:
    "Richiedi info su SANTADDEO. Scopri come il nostro Revenue Management System ottimizza le tariffe e massimizza il revenue della tua struttura.",
  alternates: { canonical: "https://www.santaddeo.com/request-info" },
  openGraph: {
    title: "Contattaci | SANTADDEO Revenue Management System",
    description: "Richiedi informazioni su SANTADDEO. Il team di 4 BID ti contattera per una consulenza personalizzata.",
    url: "https://www.santaddeo.com/request-info",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contattaci | SANTADDEO Revenue Management System",
    description: "Richiedi informazioni su SANTADDEO. Il team di 4 BID ti contattera per una consulenza personalizzata.",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  }
}

export default function RequestInfoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={buildBreadcrumbList([{"name":"Richiedi info","path":"/request-info"}])} id="ld-breadcrumb" />
      <Header showAuth={false} />
      <main className="flex-1 py-20 bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-2xl">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Richiedi Informazioni</h1>
              <p className="text-lg text-muted-foreground">
                Compila il form e ti contatteremo appena possibile per mostrarti come SANTADDEO può aiutare la tua
                struttura
              </p>
            </div>
            <RequestInfoForm />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
