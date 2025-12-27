import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Restaurant da Tiberio - Villa I Barronci Resort & Spa",
  description:
    "Tuscan and Mediterranean cuisine with km zero and organic products at Restaurant da Tiberio in San Casciano Val di Pesa.",
  alternates: {
    canonical: "/en/restaurant",
    languages: {
      it: "/ristorante",
      de: "/de/restaurant",
      fr: "/fr/restaurant",
    },
  },
}

export default function RestaurantPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="/images/design-mode/villa-i-barronci-web-0033-copia.webp"
          alt="Restaurant da Tiberio"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Restaurant da Tiberio</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">Your Tuscan vacation has found its best cuisine</p>
        </div>
      </section>

      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-8">
          Restaurant da Tiberio, at Villa I Barronci
        </h2>

        <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
          <p>
            On the <strong>panoramic terrace of Villa I Barronci Resort & Spa</strong> you will have the opportunity to
            taste both <strong>Tuscan cuisine</strong> and the best of <strong>Mediterranean cuisine</strong>: the
            restaurant "da Tiberio in San Casciano" is <strong>open every day in summer</strong>; in{" "}
            <strong>winter it closes on Tuesdays</strong>.
          </p>

          <p>
            The restaurant, da Tiberio in San Casciano, offers Mediterranean cuisine with km zero and strictly organic
            products, with vegetables partly from Grace's H-orto. The dishes and recipes of the most typical Tuscan
            expression are revisited in a modern key to further enhance the absolute quality of products and raw
            materials, all organic and km 0, like our meat from certified farms or organic vegetables at km 0.
          </p>

          <p>
            Our chefs will also take care to prepare, upon request, special menus for specific diets, intolerances or
            allergies.
          </p>

          <p>
            The wine list also aims to enhance territorial excellence, with a selection of the most prestigious Tuscan
            labels: Chianti Classico, Chianti Riserva and Supertuscans like Tignanello, Solaia and Sassicaia. The cellar
            is completed by Brunello di Montalcino, Nobile di Montepulciano and a small selection of whites.
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a href="https://datiberio.com" target="_blank" rel="noopener noreferrer">
              VISIT RESTAURANT WEBSITE
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
