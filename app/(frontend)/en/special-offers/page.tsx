import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { Button } from "@/components/ui/button"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Special Offers - Villa I Barronci Resort & Spa",
  description: "Discover our special offers and packages for an unforgettable stay in the heart of Chianti.",
  alternates: {
    canonical: "/en/special-offers",
    languages: { it: "/offerte-speciali", de: "/de/sonderangebote", fr: "/fr/offres-speciales" },
  },
}

export default function SpecialOffersPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2023/08/Villa-I-Barronci-Panoramica.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">SPECIAL OFFERS</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Exclusive Packages for Your Tuscan Getaway</p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Our Packages</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed mb-12">
            <p>
              At Villa I Barronci, we have designed exclusive packages to make your stay even more special. From
              romantic getaways to wellness experiences, there's a perfect offer for everyone.
            </p>
            <p>
              Contact us to discover all our current promotions and tailor-made packages. Our team is ready to create
              the perfect Tuscan experience for you.
            </p>
          </div>
          <div className="flex justify-center">
            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg" asChild>
              <a
                href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=1"
                target="_blank"
                rel="noopener noreferrer"
              >
                VIEW OFFERS
              </a>
            </Button>
          </div>
        </div>
      </section>
      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
