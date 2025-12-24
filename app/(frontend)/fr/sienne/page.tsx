import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sienne - 30 minutes de Villa I Barronci | Resort & Spa dans le Chianti",
  description: "Découvrez Sienne, le joyau médiéval de la Toscane, à seulement 30 minutes.",
  alternates: { canonical: "/fr/sienne", languages: { it: "/siena", en: "/en/siena", de: "/de/siena" } },
}

export default function SiennePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=1920)" }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">SIENNE</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Le Joyau Médiéval de la Toscane, à seulement 30 minutes</p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Découvrez Sienne</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              Sienne, site du patrimoine mondial de l'UNESCO, est une ville médiévale qui a conservé intact son charme
              authentique. Célèbre pour le Palio, la course de chevaux qui a lieu deux fois par an sur la Piazza del
              Campo.
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
