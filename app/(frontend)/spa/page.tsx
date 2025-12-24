import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"

export default function SpaPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp"
          alt="Namaste Area Relax"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Namaste Area Relax</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            Rigenera corpo e mente circondato dalle colline del Chianti
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <div className="prose prose-lg max-w-none text-muted-foreground space-y-6 mb-12">
          <p className="text-xl">
            Namaste Area Relax nasce per offrire ai nostri ospiti la possibilità di rigenerare corpo e mente in un clima
            di assoluta tranquillità, circondati dalle colline del Chianti.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2 className="text-3xl font-serif text-foreground mb-6">Massaggi e Trattamenti</h2>
            <p className="text-muted-foreground mb-6">
              Scopri i nostri trattamenti personalizzati pensati per il tuo benessere. I nostri operatori specializzati
              sapranno guidarti in un percorso di relax profondo e rigenerazione.
            </p>
            <ul className="space-y-3 text-muted-foreground">
              <li>• Massaggi rilassanti</li>
              <li>• Trattamenti viso e corpo</li>
              <li>• Percorsi benessere personalizzati</li>
              <li>• Aromaterapia</li>
            </ul>
          </div>

          <div className="relative h-[400px] rounded-lg overflow-hidden">
            <Image
              src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp"
              alt="Spa Treatment"
              fill
              className="object-cover"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-12">
          <div className="relative h-[400px] rounded-lg overflow-hidden order-2 md:order-1">
            <Image
              src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0044.webp"
              alt="Relaxation Area"
              fill
              className="object-cover"
            />
          </div>

          <div className="order-1 md:order-2">
            <h2 className="text-3xl font-serif text-foreground mb-6">Area Relax</h2>
            <p className="text-muted-foreground mb-6">
              La nostra area relax è progettata per offrirti momenti di pura tranquillità. Lasciati avvolgere
              dall'atmosfera serena e goditi la vista panoramica sulle colline toscane.
            </p>
            <ul className="space-y-3 text-muted-foreground">
              <li>• Zona relax con vista panoramica</li>
              <li>• Tisaneria con prodotti biologici</li>
              <li>• Docce emozionali</li>
              <li>• Area lettura</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=0"
              target="_blank"
              rel="noopener noreferrer"
            >
              PRENOTA IL TUO TRATTAMENTO
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
