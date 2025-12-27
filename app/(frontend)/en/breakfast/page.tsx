import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Breakfast - Villa I Barronci Resort & Spa",
  description:
    "Rich Italian breakfast with local and organic products. Fresh pastries, cold cuts, cheeses and fruit in the Chianti hills.",
  alternates: {
    canonical: "/en/breakfast",
    languages: {
      it: "/breakfast",
      de: "/de/fruhstuck",
      fr: "/fr/petit-dejeuner",
    },
  },
}

export default function BreakfastPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="/images/design-mode/villa-i-barronci-web-0033-copia.webp"
          alt="Breakfast at Villa I Barronci"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Breakfast</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">Start the day with the flavors of Tuscany</p>
        </div>
      </section>

      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-8">Italian Breakfast at Villa I Barronci</h2>

        <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
          <p>
            Our <strong>rich breakfast buffet</strong> offers a wide selection of fresh, local, and organic products to
            start your day in the best possible way.
          </p>

          <p>
            Every morning you will find <strong>fresh pastries</strong>, artisan bread,{" "}
            <strong>local cold cuts and cheeses</strong>, seasonal fruit, yogurt, cereals and much more. Our coffee is
            an Italian espresso with freshly ground beans.
          </p>

          <p>Upon request, we also prepare eggs cooked to your liking, pancakes and other specialties.</p>
        </div>

        <div className="mt-12 flex justify-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&lang=1"
              target="_blank"
              rel="noopener noreferrer"
            >
              BOOK YOUR STAY
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
