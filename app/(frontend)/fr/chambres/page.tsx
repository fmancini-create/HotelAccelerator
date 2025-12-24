import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Chambres & Suites - Villa I Barronci Resort & Spa dans le Chianti",
  description:
    "Découvrez nos chambres et suites élégantes avec vue panoramique sur les collines toscanes. Chambres Economy, Tuscan Style, Suite, Dependance et Maison dans les arbres.",
  alternates: {
    canonical: "/fr/chambres",
    languages: {
      it: "/camere",
      en: "/en/rooms",
      de: "/de/zimmer",
    },
  },
}

const rooms = [
  {
    title: "Chambre Economy",
    description: "Explorez la beauté magique du Chianti avec le confort chaleureux de nos chambres Economy.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/fr/chambres/economy",
  },
  {
    title: "Chambre Economy avec accès privé",
    description: "Un séjour abordable avec l'indépendance d'un accès privé.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/fr/chambres/economy-prive",
  },
  {
    title: "Chambre Tuscan Style",
    description: "Plongez dans le style toscan typique avec élégance et confort.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/fr/chambres/tuscan-style",
  },
  {
    title: "Chambre Tuscan Superior",
    description: "Plus d'espace et de confort dans le style toscan le plus raffiné.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/fr/chambres/tuscan-superior",
  },
  {
    title: "Suite",
    description: "Suites spacieuses pour un séjour de luxe au cœur du Chianti.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/fr/chambres/suite",
  },
  {
    title: "Maison dans les arbres",
    description: "Une expérience unique immergée dans la nature toscane.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/fr/chambres/maison-arbre",
  },
  {
    title: "Dependance",
    description: "Plus d'intimité dans une structure indépendante.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/fr/chambres/dependance",
  },
  {
    title: "Dependance deLuxe",
    description: "Le summum du confort et de l'intimité dans notre dependance de luxe.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/fr/chambres/dependance-deluxe",
  },
]

export default function ChambresPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp"
          alt="Chambres Villa I Barronci"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Chambres & Suites</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            Toute la beauté du Chianti vue d'un endroit spécial
          </p>
        </div>
      </section>

      <section className="py-16 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rooms.map((room) => (
            <Card key={room.title} className="overflow-hidden group cursor-pointer hover:shadow-lg transition-shadow">
              <Link href={room.href}>
                <div className="relative h-64">
                  <Image
                    src={room.image || "/placeholder.svg"}
                    alt={room.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-2xl font-serif text-foreground mb-3">{room.title}</h3>
                  <p className="text-muted-foreground mb-4">{room.description}</p>
                  <Button variant="outline" className="w-full bg-transparent">
                    En savoir plus
                  </Button>
                </div>
              </Link>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=3"
              target="_blank"
              rel="noopener noreferrer"
            >
              RÉSERVER MAINTENANT
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
