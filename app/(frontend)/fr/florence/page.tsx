import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Florence - 20 minutes de Villa I Barronci | Resort & Spa dans le Chianti",
  description: "Découvrez Florence, le berceau de la Renaissance, à seulement 20 minutes de Villa I Barronci.",
  alternates: { canonical: "/fr/florence", languages: { it: "/firenze", en: "/en/florence", de: "/de/florenz" } },
}

export default function FlorencePage() {
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
          <h1 className="font-serif text-5xl md:text-7xl mb-6">FLORENCE</h1>
          <p className="text-xl md:text-2xl max-w-3xl">
            Le Berceau de la Renaissance, à seulement 20 minutes de Villa I Barronci
          </p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Découvrez Florence</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              Florence, le berceau de la Renaissance, est à seulement 20 minutes de Villa I Barronci. Cette ville
              extraordinaire offre une concentration inégalée d'art, de culture et d'histoire.
            </p>
            <p>
              Visitez la Galerie des Offices, admirez le David de Michel-Ange et promenez-vous sur le Ponte Vecchio.
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
