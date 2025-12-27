import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Restaurant da Tiberio - Villa I Barronci Resort & Spa",
  description:
    "Toskanische und mediterrane Küche mit Km-Null- und Bio-Produkten im Restaurant da Tiberio in San Casciano Val di Pesa.",
  alternates: {
    canonical: "/de/restaurant",
    languages: {
      it: "/ristorante",
      en: "/en/restaurant",
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
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            Ihr Toskana-Urlaub hat seine beste Küche gefunden
          </p>
        </div>
      </section>

      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-8">
          Restaurant da Tiberio, in der Villa I Barronci
        </h2>

        <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
          <p>
            Auf der <strong>Panoramaterrasse der Villa I Barronci Resort & Spa</strong> haben Sie die Möglichkeit,
            sowohl <strong>toskanische Küche</strong> als auch das Beste der <strong>mediterranen Küche</strong> zu
            genießen: Das Restaurant "da Tiberio in San Casciano" ist <strong>im Sommer täglich geöffnet</strong>; im{" "}
            <strong>Winter ist dienstags geschlossen</strong>.
          </p>

          <p>
            Das Restaurant da Tiberio in San Casciano bietet mediterrane Küche mit Km-Null- und streng biologischen
            Produkten, mit Gemüse teilweise aus Grace's H-orto. Die Gerichte und Rezepte des typischsten toskanischen
            Ausdrucks werden in einer modernen Interpretation neu interpretiert, um die absolute Qualität der Produkte
            und Rohstoffe, alle bio und km 0, wie unser Fleisch von zertifizierten Farmen oder Bio-Gemüse bei km 0, noch
            mehr hervorzuheben.
          </p>

          <p>
            Unsere Köche werden auch auf Anfrage spezielle Menüs für bestimmte Diäten, Unverträglichkeiten oder
            Allergien zubereiten.
          </p>

          <p>
            Auch die Weinkarte zielt darauf ab, territoriale Exzellenz hervorzuheben, mit einer Auswahl der
            renommiertesten toskanischen Etiketten: Chianti Classico, Chianti Riserva und Supertuscans wie Tignanello,
            Solaia und Sassicaia. Den Keller vervollständigen Brunello di Montalcino, Nobile di Montepulciano und eine
            kleine Auswahl an Weißweinen.
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a href="https://datiberio.com" target="_blank" rel="noopener noreferrer">
              ZUR RESTAURANT-WEBSITE
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
