import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Zimmer & Suiten - Villa I Barronci Resort & Spa im Chianti",
  description:
    "Entdecken Sie unsere eleganten Zimmer und Suiten mit Panoramablick auf die toskanischen Hügel. Economy-Zimmer, Tuscan Style, Suite, Dependance und Baumhaus.",
  alternates: {
    canonical: "/de/zimmer",
    languages: {
      it: "/camere",
      en: "/en/rooms",
      fr: "/fr/chambres",
    },
  },
}

const rooms = [
  {
    title: "Economy Zimmer",
    description: "Entdecken Sie die magische Schönheit des Chianti mit dem gemütlichen Komfort unserer Economy-Zimmer.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/de/zimmer/economy",
  },
  {
    title: "Economy Zimmer mit privatem Zugang",
    description: "Ein erschwinglicher Aufenthalt mit der Unabhängigkeit eines privaten Zugangs.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/de/zimmer/economy-privat",
  },
  {
    title: "Tuscan Style Zimmer",
    description: "Tauchen Sie ein in den typischen toskanischen Stil mit Eleganz und Komfort.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/de/zimmer/tuscan-style",
  },
  {
    title: "Tuscan Superior Zimmer",
    description: "Mehr Platz und Komfort im raffiniertesten toskanischen Stil.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/de/zimmer/tuscan-superior",
  },
  {
    title: "Suite",
    description: "Geräumige Suiten für einen luxuriösen Aufenthalt im Herzen des Chianti.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/de/zimmer/suite",
  },
  {
    title: "Baumhaus",
    description: "Ein einzigartiges Erlebnis, eingetaucht in die toskanische Natur.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/de/zimmer/baumhaus",
  },
  {
    title: "Dependance",
    description: "Mehr Privatsphäre in einer unabhängigen Struktur.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/de/zimmer/dependance",
  },
  {
    title: "Dependance deLuxe",
    description: "Das Höchste an Komfort und Privatsphäre in unserer Luxus-Dependance.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/de/zimmer/dependance-deluxe",
  },
]

export default function ZimmerPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp"
          alt="Zimmer Villa I Barronci"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Zimmer & Suiten</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            Die ganze Schönheit des Chianti von einem besonderen Ort aus gesehen
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
                    Mehr erfahren
                  </Button>
                </div>
              </Link>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=2"
              target="_blank"
              rel="noopener noreferrer"
            >
              JETZT BUCHEN
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
