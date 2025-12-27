import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Rooms & Suites - Villa I Barronci Resort & Spa in Chianti",
  description:
    "Discover our elegant rooms and suites with panoramic views of Tuscan hills. Economy rooms, Tuscan Style, Suite, Dependance and Tree House.",
  alternates: {
    canonical: "/en/rooms",
    languages: {
      it: "/camere",
      de: "/de/zimmer",
      fr: "/fr/chambres",
    },
  },
}

const rooms = [
  {
    title: "Economy Room",
    description: "Explore the magical beauty of Chianti with the cozy comfort of our Economy rooms.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/en/rooms/economy",
  },
  {
    title: "Economy Room with Private Access",
    description: "An affordable stay with the independence of private access.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/en/rooms/economy-private",
  },
  {
    title: "Tuscan Style Room",
    description: "Immerse yourself in typical Tuscan style with elegance and comfort.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/en/rooms/tuscan-style",
  },
  {
    title: "Tuscan Superior Room",
    description: "More space and comfort in the most refined Tuscan style.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/en/rooms/tuscan-superior",
  },
  {
    title: "Suite",
    description: "Spacious suites for a luxury stay in the heart of Chianti.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/en/rooms/suite",
  },
  {
    title: "Tree House",
    description: "A unique experience immersed in Tuscan nature.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/en/rooms/tree-house",
  },
  {
    title: "Dependance",
    description: "Greater privacy in an independent structure.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/en/rooms/dependance",
  },
  {
    title: "Dependance deLuxe",
    description: "The ultimate in comfort and privacy in our luxury dependance.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/en/rooms/dependance-deluxe",
  },
]

export default function RoomsPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="/images/design-mode/villa-i-barronci-web-0011.webp"
          alt="Rooms Villa I Barronci"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Rooms & Suites</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            All the beauty of Chianti seen from a special place
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
                    Learn More
                  </Button>
                </div>
              </Link>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=1"
              target="_blank"
              rel="noopener noreferrer"
            >
              BOOK NOW
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
