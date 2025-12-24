import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Florence - 20 minutes from Villa I Barronci | Resort & Spa in Chianti",
  description:
    "Discover Florence, the cradle of the Renaissance, just 20 minutes from Villa I Barronci. Art, culture and history await you.",
  alternates: { canonical: "/en/florence", languages: { it: "/firenze", de: "/de/florenz", fr: "/fr/florence" } },
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
            The Cradle of the Renaissance, just 20 minutes from Villa I Barronci
          </p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Discover Florence</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              Florence, the cradle of the Renaissance, is just 20 minutes from Villa I Barronci. This extraordinary city
              offers an unparalleled concentration of art, culture and history.
            </p>
            <p>
              Visit the Uffizi Gallery, admire Michelangelo's David, stroll across the Ponte Vecchio and get lost in the
              charming streets of the historic center. Florence is a city that never ceases to amaze.
            </p>
            <p>
              From Villa I Barronci, you can easily reach Florence by car or use our transfer service. After a day of
              exploring, return to the tranquility of our resort to relax by the pool or enjoy dinner at our restaurant.
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
