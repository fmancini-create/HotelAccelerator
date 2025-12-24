import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Siena - 30 Minuten von Villa I Barronci | Resort & Spa im Chianti",
  description: "Entdecken Sie Siena, das mittelalterliche Juwel der Toskana, nur 30 Minuten entfernt.",
  alternates: { canonical: "/de/siena", languages: { it: "/siena", en: "/en/siena", fr: "/fr/sienne" } },
}

export default function SienaPage() {
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
          <h1 className="font-serif text-5xl md:text-7xl mb-6">SIENA</h1>
          <p className="text-xl md:text-2xl max-w-3xl">
            Das mittelalterliche Juwel der Toskana, nur 30 Minuten entfernt
          </p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Entdecken Sie Siena</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <p>
              Siena, UNESCO-Weltkulturerbe, ist eine mittelalterliche Stadt, die ihren authentischen Charme bewahrt hat.
              Berühmt für den Palio, das zweimal jährlich auf der Piazza del Campo stattfindende Pferderennen.
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
