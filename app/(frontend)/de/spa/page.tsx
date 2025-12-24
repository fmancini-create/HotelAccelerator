import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Namaste Entspannungsbereich - Villa I Barronci Resort & Spa",
  description:
    "Regenerieren Sie Körper und Geist, umgeben von Chianti-Hügeln. Massagen, Behandlungen und Wellness-Pfade in der Villa I Barronci.",
  alternates: {
    canonical: "/de/spa",
    languages: {
      it: "/spa",
      en: "/en/spa",
      fr: "/fr/spa",
    },
  },
}

export default function SpaPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp"
          alt="Namaste Entspannungsbereich"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Namaste Entspannungsbereich</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            Regenerieren Sie Körper und Geist, umgeben von Chianti-Hügeln
          </p>
        </div>
      </section>

      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <div className="prose prose-lg max-w-none text-muted-foreground space-y-6 mb-12">
          <p className="text-xl">
            Der Namaste Entspannungsbereich wurde geschaffen, um unseren Gästen die Möglichkeit zu bieten, Körper und
            Geist in einer Atmosphäre absoluter Ruhe zu regenerieren, umgeben von den Chianti-Hügeln.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2 className="text-3xl font-serif text-foreground mb-6">Massagen und Behandlungen</h2>
            <p className="text-muted-foreground mb-6">
              Entdecken Sie unsere personalisierten Behandlungen für Ihr Wohlbefinden. Unsere spezialisierten
              Mitarbeiter führen Sie auf einem Weg zu tiefer Entspannung und Regeneration.
            </p>
            <ul className="space-y-3 text-muted-foreground">
              <li>• Entspannende Massagen</li>
              <li>• Gesichts- und Körperbehandlungen</li>
              <li>• Personalisierte Wellness-Pfade</li>
              <li>• Aromatherapie</li>
            </ul>
          </div>

          <div className="relative h-[400px] rounded-lg overflow-hidden">
            <Image
              src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp"
              alt="Spa-Behandlung"
              fill
              className="object-cover"
            />
          </div>
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=2"
              target="_blank"
              rel="noopener noreferrer"
            >
              BEHANDLUNG BUCHEN
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
