import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { ViatorWidget } from "@/components/viator-widget"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Book Experiences - Villa I Barronci Resort & Spa",
  description: "Book unique experiences in Tuscany: wine tours, cooking classes, hot air balloon rides and much more.",
  alternates: {
    canonical: "/en/book-experiences",
    languages: { it: "/prenota-esperienze", de: "/de/erlebnisse-buchen", fr: "/fr/reserver-experiences" },
  },
}

export default function BookExperiencesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-[50vh] w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1523528283115-9bf9b1699245?w=1920)" }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">BOOK EXPERIENCES</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Unforgettable Tuscan Adventures</p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Discover Tuscany</h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
            Book unique experiences directly from our resort. Wine tours, cooking classes, hot air balloon rides and
            much more await you.
          </p>
          <ViatorWidget />
        </div>
      </section>
      <Footer />
    </div>
  )
}
