import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Espace Détente Namaste - Villa I Barronci Resort & Spa",
  description:
    "Régénérez corps et esprit entouré des collines du Chianti. Massages, soins et parcours bien-être à Villa I Barronci.",
  alternates: {
    canonical: "/fr/spa",
    languages: {
      it: "/spa",
      en: "/en/spa",
      de: "/de/spa",
    },
  },
}

export default function SpaPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="/images/design-mode/villa-i-barronci-web-0011.webp"
          alt="Espace Détente Namaste"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Espace Détente Namaste</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            Régénérez corps et esprit entouré des collines du Chianti
          </p>
        </div>
      </section>

      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <div className="prose prose-lg max-w-none text-muted-foreground space-y-6 mb-12">
          <p className="text-xl">
            L'Espace Détente Namaste a été créé pour offrir à nos hôtes la possibilité de régénérer corps et esprit dans
            une atmosphère de tranquillité absolue, entourés des collines du Chianti.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2 className="text-3xl font-serif text-foreground mb-6">Massages et Soins</h2>
            <p className="text-muted-foreground mb-6">
              Découvrez nos soins personnalisés conçus pour votre bien-être. Nos opérateurs spécialisés vous guideront
              sur un chemin de relaxation profonde et de régénération.
            </p>
            <ul className="space-y-3 text-muted-foreground">
              <li>• Massages relaxants</li>
              <li>• Soins visage et corps</li>
              <li>• Parcours bien-être personnalisés</li>
              <li>• Aromathérapie</li>
            </ul>
          </div>

          <div className="relative h-[400px] rounded-lg overflow-hidden">
            <Image
              src="/images/design-mode/villa-i-barronci-web-0011.webp"
              alt="Soin Spa"
              fill
              className="object-cover"
            />
          </div>
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=3"
              target="_blank"
              rel="noopener noreferrer"
            >
              RÉSERVER VOTRE SOIN
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
