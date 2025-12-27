import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { MapPin, Phone, Mail } from "lucide-react"

export default function DoveSiamoPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="/images/design-mode/villa-i-barronci-web-0044.webp"
          alt="Villa I Barronci Location"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Villa I Barronci, nel cuore del Chianti</h1>
          <p className="text-xl md:text-2xl text-white/90">Dove siamo</p>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-8 text-center">
          Villa I Barronci Resort & Spa
        </h2>

        <div className="prose prose-lg max-w-none text-muted-foreground mb-12 text-center">
          <p>
            Immerso nel territorio magico e incontaminato del Chianti, il nostro resort si erge maestoso sulla collina
            più alta di San Casciano, offrendo viste mozzafiato e un'atmosfera incantevole. Situato in una posizione
            strategica, è il punto di partenza ideale per esplorare i tesori storici e culturali dei principali centri
            della Toscana, regalandoti un'esperienza indimenticabile immersa nella bellezza senza tempo della regione.
          </p>
        </div>

        {/* Contact Info */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="flex flex-col items-center text-center p-6 bg-secondary rounded-lg">
            <MapPin className="h-12 w-12 text-[#8b7355] mb-4" />
            <h3 className="font-serif text-xl text-foreground mb-2">Indirizzo</h3>
            <p className="text-muted-foreground">
              Via Sorripa, 10
              <br />
              50026 San Casciano In Val Di Pesa (FI)
              <br />
              Italia
            </p>
          </div>

          <div className="flex flex-col items-center text-center p-6 bg-secondary rounded-lg">
            <Phone className="h-12 w-12 text-[#8b7355] mb-4" />
            <h3 className="font-serif text-xl text-foreground mb-2">Telefono</h3>
            <a href="tel:+39055820598" className="text-muted-foreground hover:text-foreground transition-colors">
              +39 055820598
            </a>
          </div>

          <div className="flex flex-col items-center text-center p-6 bg-secondary rounded-lg">
            <Mail className="h-12 w-12 text-[#8b7355] mb-4" />
            <h3 className="font-serif text-xl text-foreground mb-2">Email</h3>
            <a
              href="mailto:info@ibarronci.com"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              info@ibarronci.com
            </a>
          </div>
        </div>

        {/* Map */}
        <div className="w-full h-[500px] rounded-lg overflow-hidden">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2888.1234567890!2d11.1234567890!3d43.6543210987!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDPCsDM5JzE1LjYiTiAxMcKwMDcnMjQuNCJF!5e0!3m2!1sit!2sit!4v1234567890"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=0"
              target="_blank"
              rel="noopener noreferrer"
            >
              PRENOTA
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="tel:+39055820598">CHIAMA</a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
