import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Restaurant da Tiberio - Villa I Barronci Resort & Spa",
  description:
    "Cuisine toscane et méditerranéenne avec des produits km zéro et biologiques au Restaurant da Tiberio à San Casciano Val di Pesa.",
  alternates: {
    canonical: "/fr/restaurant",
    languages: {
      it: "/ristorante",
      en: "/en/restaurant",
      de: "/de/restaurant",
    },
  },
}

export default function RestaurantPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0033-copia.webp"
          alt="Restaurant da Tiberio"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Restaurant da Tiberio</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            Vos vacances en Toscane ont trouvé leur meilleure cuisine
          </p>
        </div>
      </section>

      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-8">
          Restaurant da Tiberio, à Villa I Barronci
        </h2>

        <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
          <p>
            Sur la <strong>terrasse panoramique de Villa I Barronci Resort & Spa</strong>, vous aurez l'occasion de
            déguster à la fois la <strong>cuisine toscane</strong> et le meilleur de la{" "}
            <strong>cuisine méditerranéenne</strong> : le restaurant "da Tiberio à San Casciano" est{" "}
            <strong>ouvert tous les jours en été</strong> ; en <strong>hiver, il ferme le mardi</strong>.
          </p>

          <p>
            Le restaurant da Tiberio à San Casciano propose une cuisine méditerranéenne avec des produits km zéro et
            strictement biologiques, avec des légumes provenant en partie du H-orto de Grace. Les plats et recettes de
            l'expression toscane la plus typique sont revisités de manière moderne pour mettre encore plus en valeur la
            qualité absolue des produits et matières premières, tous bio et km 0, comme notre viande provenant de fermes
            certifiées ou les légumes biologiques à km 0.
          </p>

          <p>
            Nos chefs prendront également soin de préparer, sur demande, des menus spéciaux pour des régimes
            spécifiques, intolérances ou allergies.
          </p>

          <p>
            La carte des vins vise également à mettre en valeur l'excellence territoriale, avec une sélection des
            étiquettes toscanes les plus prestigieuses : Chianti Classico, Chianti Riserva et Supertuscans comme
            Tignanello, Solaia et Sassicaia. La cave est complétée par le Brunello di Montalcino, le Nobile di
            Montepulciano et une petite sélection de blancs.
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a href="https://datiberio.com" target="_blank" rel="noopener noreferrer">
              VISITER LE SITE DU RESTAURANT
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
