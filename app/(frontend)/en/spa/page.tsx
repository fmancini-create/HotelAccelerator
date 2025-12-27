import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Namaste Relax Area - Villa I Barronci Resort & Spa",
  description:
    "Regenerate body and mind surrounded by Chianti hills. Massages, treatments and wellness paths at Villa I Barronci.",
  alternates: {
    canonical: "/en/spa",
    languages: {
      it: "/spa",
      de: "/de/spa",
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
          src="/images/design-mode/villa-i-barronci-web-0011.webp"
          alt="Namaste Relax Area"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Namaste Relax Area</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            Regenerate body and mind surrounded by Chianti hills
          </p>
        </div>
      </section>

      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <div className="prose prose-lg max-w-none text-muted-foreground space-y-6 mb-12">
          <p className="text-xl">
            Namaste Relax Area was created to offer our guests the opportunity to regenerate body and mind in an
            atmosphere of absolute tranquility, surrounded by the Chianti hills.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2 className="text-3xl font-serif text-foreground mb-6">Massages and Treatments</h2>
            <p className="text-muted-foreground mb-6">
              Discover our personalized treatments designed for your well-being. Our specialized operators will guide
              you on a path of deep relaxation and regeneration.
            </p>
            <ul className="space-y-3 text-muted-foreground">
              <li>• Relaxing massages</li>
              <li>• Face and body treatments</li>
              <li>• Personalized wellness paths</li>
              <li>• Aromatherapy</li>
            </ul>
          </div>

          <div className="relative h-[400px] rounded-lg overflow-hidden">
            <Image
              src="/images/design-mode/villa-i-barronci-web-0011.webp"
              alt="Spa Treatment"
              fill
              className="object-cover"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-12">
          <div className="relative h-[400px] rounded-lg overflow-hidden order-2 md:order-1">
            <Image
              src="/images/design-mode/villa-i-barronci-web-0044.webp"
              alt="Relaxation Area"
              fill
              className="object-cover"
            />
          </div>

          <div className="order-1 md:order-2">
            <h2 className="text-3xl font-serif text-foreground mb-6">Relax Area</h2>
            <p className="text-muted-foreground mb-6">
              Our relax area is designed to offer you moments of pure tranquility. Let yourself be enveloped by the
              serene atmosphere and enjoy the panoramic view of the Tuscan hills.
            </p>
            <ul className="space-y-3 text-muted-foreground">
              <li>• Relax area with panoramic view</li>
              <li>• Tea room with organic products</li>
              <li>• Emotional showers</li>
              <li>• Reading area</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=1"
              target="_blank"
              rel="noopener noreferrer"
            >
              BOOK YOUR TREATMENT
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
