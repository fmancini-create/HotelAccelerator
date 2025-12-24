import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Florenz - 20 Minuten von Villa I Barronci | Resort & Spa im Chianti",
  description: "Entdecken Sie Florenz, die Wiege der Renaissance, nur 20 Minuten von Villa I Barronci entfernt.",
  alternates: { canonical: "/de/florenz", languages: { it: "/firenze", en: "/en/florence", fr: "/fr/florence" } },
}

export default function FlorenzPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1543429258-0b17b5e6b8ae?w=1920)" }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">FLORENZ</h1>
          <p className="text-xl md:text-2xl max-w-3xl">
            Die Wiege der Renaissance, nur 20 Minuten von Villa I Barronci
          </p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Entdecken Sie Florenz</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              Florenz, die Wiege der Renaissance, ist nur 20 Minuten von Villa I Barronci entfernt. Diese
              außergewöhnliche Stadt bietet eine unvergleichliche Konzentration von Kunst, Kultur und Geschichte.
            </p>
            <p>
              Besuchen Sie die Uffizien, bewundern Sie Michelangelos David und schlendern Sie über den Ponte Vecchio.
            </p>
          </div>
        </div>
      </section>
      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
