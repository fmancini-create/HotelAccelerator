import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"

const rooms = [
  {
    title: "Camera Economy",
    description: "Esplora la magica bellezza del Chianti con il comfort accogliente delle nostre camere Economy.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/camere/economy",
  },
  {
    title: "Camera Economy con accesso privato",
    description: "Un soggiorno economico con l'indipendenza di un accesso privato.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/camere/economy-privato",
  },
  {
    title: "Camera Tuscan Style",
    description: "Immergiti nello stile tipico toscano con eleganza e comfort.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/camere/tuscan-style",
  },
  {
    title: "Camera Tuscan Superior",
    description: "Maggiore spazio e comfort nello stile toscano più raffinato.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/camere/tuscan-superior",
  },
  {
    title: "Suite",
    description: "Ampie suite per un soggiorno di lusso nel cuore del Chianti.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/camere/suite",
  },
  {
    title: "Casa sull'albero",
    description: "Un'esperienza unica immersi nella natura toscana.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/camere/casa-albero",
  },
  {
    title: "Dependance",
    description: "Maggiore privacy in una struttura indipendente.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/camere/dependance",
  },
  {
    title: "Dependance deLuxe",
    description: "Il massimo del comfort e della privacy nella nostra dependance di lusso.",
    image: "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    href: "/camere/dependance-deluxe",
  },
]

export default function CamerePage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp"
          alt="Camere Villa I Barronci"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Camere & Suites</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            Tutta la bellezza del Chianti osservata da un luogo speciale
          </p>
        </div>
      </section>

      {/* Rooms Grid */}
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
                    Scopri di più
                  </Button>
                </div>
              </Link>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=0"
              target="_blank"
              rel="noopener noreferrer"
            >
              PRENOTA ORA
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
